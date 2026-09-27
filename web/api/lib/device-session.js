import { getSql, ready, mapUser } from "./db.js";
import { sha256, newToken } from "./passwords.js";
import { httpError } from "./http.js";
import {
  bearerToken,
  cleanDeviceName,
  deviceSessionSeconds,
  deviceUser,
  deviceAccessError,
  deviceCorsHeaders,
  devicePreflight,
  withDeviceCors,
} from "./device-gate.js";

export {
  bearerToken,
  cleanDeviceName,
  deviceSessionSeconds,
  deviceUser,
  deviceAccessError,
  deviceCorsHeaders,
  devicePreflight,
  withDeviceCors,
};

export async function openDeviceSession(userId, deviceName) {
  const sql = getSql();
  await ready();
  const token = newToken();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + deviceSessionSeconds() * 1000).toISOString();
  const name = cleanDeviceName(deviceName);
  await sql`INSERT INTO sessions (id, user_id, token_hash, expires_at, kind, device_name)
    VALUES (${id}, ${userId}, ${sha256(token)}, ${expiresAt}, 'device', ${name})`;
  return { token, expiresAt };
}

export async function userFromDeviceBearer(request) {
  const token = bearerToken(request);
  if (!token) return null;
  const sql = getSql();
  await ready();
  const rows = await sql`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${sha256(token)}
      AND s.expires_at > NOW()
      AND s.kind = 'device'
      AND u.deleted_at IS NULL
    LIMIT 1`;
  return mapUser(rows[0]);
}

export async function requireDeviceUser(request) {
  const user = await userFromDeviceBearer(request);
  if (!user) throw httpError(401, "Log in required.");
  return user;
}
