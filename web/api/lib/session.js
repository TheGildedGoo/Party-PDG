import { getSql, ready, mapUser } from "./db.js";
import { sha256, newToken } from "./passwords.js";
import { readCookie, sessionCookie, clearSessionCookie } from "./http.js";
import { publicUser } from "./entitlement.js";

const SESSION_SECONDS = Number(process.env.SESSION_DAYS || 30) * 24 * 60 * 60;

export async function openSession(userId, request) {
  const sql = getSql();
  await ready();
  const token = newToken();
  const id = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await sql`INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (${id}, ${userId}, ${sha256(token)}, ${expires})`;
  return sessionCookie(token, request, SESSION_SECONDS);
}

export async function clearSessions(userId) {
  const sql = getSql();
  await ready();
  await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
}

export async function currentUser(request) {
  const token = readCookie(request, "pdg_session");
  if (!token) return null;
  const sql = getSql();
  await ready();
  const rows = await sql`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${sha256(token)} AND s.expires_at > NOW() AND u.deleted_at IS NULL LIMIT 1`;
  return mapUser(rows[0]);
}

export async function requireUser(request) {
  const user = await currentUser(request);
  if (!user) {
    const err = new Error("Log in required.");
    err.status = 401;
    throw err;
  }
  return user;
}

export function sessionPayload(user) {
  return { user: publicUser(user) };
}

export { clearSessionCookie };
