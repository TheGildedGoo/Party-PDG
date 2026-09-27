import { getSql, ready, mapUser, hitLimit } from "../db.js";
import { json, readJson, httpError, clientIp } from "../http.js";
import { normalizeEmail, verifyPassword } from "../passwords.js";
import { sessionPayload } from "../session.js";
import { entitlement } from "../entitlement.js";
import { loadProgressSnapshot, saveMergedProgress } from "./progress.js";
import { loadDeviceCatalog, shapeBank } from "../device-bank.js";
import {
  deviceAccessError,
  deviceUser,
  openDeviceSession,
  requireDeviceUser,
  withDeviceCors,
} from "../device-session.js";

function gate(user) {
  const blocked = deviceAccessError(user);
  if (blocked) throw httpError(blocked.status, blocked.message);
}

async function allowProgress(request) {
  const user = await requireDeviceUser(request);
  if (user.disabledAt || user.mustChangePassword || !user.emailVerifiedAt) {
    throw httpError(403, "Verify your account before syncing progress.");
  }
  return user;
}

export async function deviceLogin(request) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const sql = getSql();
  await ready();
  if (await hitLimit(`device-login:${clientIp(request)}:${email}`, 8, 900)) {
    throw httpError(429, "Too many login attempts. Try again later.");
  }
  const rows = await sql`SELECT * FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`;
  const user = mapUser(rows[0]);
  if (!user || !(await verifyPassword(body.password || "", user.passwordHash))) {
    throw httpError(401, "Email or password is wrong.");
  }
  gate(user);
  const session = await openDeviceSession(user.id, body.deviceName);
  return json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: deviceUser(user),
    entitlement: entitlement(user),
  });
}

export async function deviceMe(request) {
  const user = await requireDeviceUser(request);
  return json(sessionPayload(user));
}

export async function deviceBank(request) {
  const user = await requireDeviceUser(request);
  gate(user);
  const url = new URL(request.url);
  const body = shapeBank(loadDeviceCatalog(), {
    rank: url.searchParams.get("rank") || "E5",
    updated_since: url.searchParams.get("updated_since") || "",
  });
  return json(body);
}

export async function deviceGetProgress(request) {
  const user = await allowProgress(request);
  return json(await loadProgressSnapshot(user.id));
}

export async function devicePutProgress(request) {
  const user = await allowProgress(request);
  const body = await readJson(request);
  const snapshot = body && body.progress && !body.sr ? body.progress : body;
  return json(await saveMergedProgress(user.id, snapshot || {}));
}

export function deviceResponse(response) {
  return withDeviceCors(response);
}
