import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { getSql, ready } from "../db.js";
import { json, readJson, httpError, assertSameOrigin } from "../http.js";
import { requireUser } from "../session.js";

let mergeSnapshotsFn = null;

function loadMergeSnapshots() {
  if (mergeSnapshotsFn) return mergeSnapshotsFn;
  const candidates = [
    fileURLToPath(new URL("../../../js/progress-merge.js", import.meta.url)),
    join(process.cwd(), "js", "progress-merge.js"),
    join("/var/task", "js", "progress-merge.js"),
  ];
  let source = "";
  for (const path of candidates) {
    try {
      source = readFileSync(path, "utf8");
      if (source) break;
    } catch {
      source = "";
    }
  }
  if (!source) throw new Error("Progress merge file is missing.");
  const sandbox = {};
  runInNewContext(source, sandbox, { filename: "progress-merge.js" });
  if (!sandbox.PDG || typeof sandbox.PDG.mergeSnapshots !== "function") {
    throw new Error("Progress merge did not load.");
  }
  mergeSnapshotsFn = sandbox.PDG.mergeSnapshots;
  return mergeSnapshotsFn;
}

function asObj(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
}

function snapshotFromRow(row) {
  if (!row) return { sr: {}, achievements: {}, focus: {}, lastSession: null, updatedAt: null };
  return {
    sr: asObj(row.sr, {}),
    achievements: asObj(row.achievements, {}),
    focus: asObj(row.focus, {}),
    lastSession: asObj(row.last_session, null),
    updatedAt: row.updated_at,
  };
}

async function allow(request) {
  const user = await requireUser(request);
  if (user.disabledAt || user.mustChangePassword || !user.emailVerifiedAt) {
    throw httpError(403, "Verify your account before syncing progress.");
  }
  return user;
}

export async function loadProgressSnapshot(userId) {
  const sql = getSql();
  await ready();
  const rows = await sql`SELECT * FROM progress WHERE user_id = ${userId} LIMIT 1`;
  return { progress: snapshotFromRow(rows[0]) };
}

export async function saveMergedProgress(userId, body) {
  const text = JSON.stringify(body || {});
  if (text.length > 400000) throw httpError(413, "Progress payload is too large.");
  const sql = getSql();
  await ready();
  const rows = await sql`SELECT * FROM progress WHERE user_id = ${userId} LIMIT 1`;
  const merged = loadMergeSnapshots()(snapshotFromRow(rows[0]), {
    sr: body.sr || {},
    achievements: body.achievements || {},
    focus: body.focus || {},
    lastSession: body.lastSession || null,
  });
  const sr = merged.sr || {};
  const achievements = merged.achievements || {};
  const focus = merged.focus || {};
  const lastSession = merged.lastSession || null;
  if (rows.length) {
    await sql`UPDATE progress SET sr = ${sr}, achievements = ${achievements}, focus = ${focus},
      last_session = ${lastSession}, updated_at = NOW() WHERE user_id = ${userId}`;
  } else {
    await sql`INSERT INTO progress (user_id, sr, achievements, focus, last_session)
      VALUES (${userId}, ${sr}, ${achievements}, ${focus}, ${lastSession})`;
  }
  const saved = await sql`SELECT * FROM progress WHERE user_id = ${userId} LIMIT 1`;
  return { progress: snapshotFromRow(saved[0]) };
}

export async function getProgress(request) {
  const user = await allow(request);
  return json(await loadProgressSnapshot(user.id));
}

export async function putProgress(request) {
  assertSameOrigin(request);
  const user = await allow(request);
  const body = await readJson(request);
  return json(await saveMergedProgress(user.id, body));
}
