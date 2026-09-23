import { createRequire } from "node:module";
import { getSql, ready } from "../db.js";
import { json, readJson, httpError, assertSameOrigin } from "../http.js";
import { requireUser } from "../session.js";

const require = createRequire(import.meta.url);
const { mergeSnapshots } = require("../../../js/progress-merge.js");

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

export async function getProgress(request) {
  const user = await allow(request);
  const sql = getSql();
  await ready();
  const rows = await sql`SELECT * FROM progress WHERE user_id = ${user.id} LIMIT 1`;
  return json({ progress: snapshotFromRow(rows[0]) });
}

export async function putProgress(request) {
  assertSameOrigin(request);
  const user = await allow(request);
  const body = await readJson(request);
  const text = JSON.stringify(body || {});
  if (text.length > 400000) throw httpError(413, "Progress payload is too large.");
  const sql = getSql();
  await ready();
  const rows = await sql`SELECT * FROM progress WHERE user_id = ${user.id} LIMIT 1`;
  const merged = mergeSnapshots(snapshotFromRow(rows[0]), {
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
      last_session = ${lastSession}, updated_at = NOW() WHERE user_id = ${user.id}`;
  } else {
    await sql`INSERT INTO progress (user_id, sr, achievements, focus, last_session)
      VALUES (${user.id}, ${sr}, ${achievements}, ${focus}, ${lastSession})`;
  }
  const saved = await sql`SELECT * FROM progress WHERE user_id = ${user.id} LIMIT 1`;
  return json({ progress: snapshotFromRow(saved[0]) });
}
