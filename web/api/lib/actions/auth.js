import { getSql, ready, mapUser, hitLimit } from "../db.js";
import { json, readJson, httpError, assertSameOrigin, appOrigin, clientIp } from "../http.js";
import {
  passwordError, emailError, normalizeEmail, hashPassword, verifyPassword, sha256, newToken,
} from "../passwords.js";
import { openSession, clearSessions, currentUser, requireUser, sessionPayload, clearSessionCookie } from "../session.js";
import { sendMail, verificationMessage, resetMessage } from "../mail.js";
import { cancelSubscriptionIfAny } from "./billing.js";

async function issueToken(sql, userId, purpose, hours) {
  const token = newToken();
  const id = crypto.randomUUID();
  const expires = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  await sql`INSERT INTO email_tokens (id, user_id, purpose, token_hash, expires_at)
    VALUES (${id}, ${userId}, ${purpose}, ${sha256(token)}, ${expires})`;
  return { id, token };
}

export async function registerUser(request) {
  assertSameOrigin(request);
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const badEmail = emailError(email);
  if (badEmail) throw httpError(400, badEmail);
  const badPassword = passwordError(body.password);
  if (badPassword) throw httpError(400, badPassword);
  if (body.password !== body.confirm) throw httpError(400, "Those passwords do not match.");
  const sql = getSql();
  await ready();
  if (await hitLimit(`register:${clientIp(request)}`, 8, 3600)) {
    throw httpError(429, "Too many registrations. Try again later.");
  }
  const existing = await sql`SELECT id FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`;
  if (existing.length) throw httpError(409, "An account with that email already exists.");
  const id = crypto.randomUUID();
  const hash = await hashPassword(body.password);
  await sql`INSERT INTO users (id, email, password_hash) VALUES (${id}, ${email}, ${hash})`;
  const issued = await issueToken(sql, id, "verify", 24);
  let emailSent = true;
  try {
    const msg = verificationMessage(appOrigin(request), issued.token);
    await sendMail({ to: email, ...msg, idempotencyKey: `verify-email/${issued.id}` });
  } catch (err) {
    console.error(err);
    emailSent = false;
  }
  const cookie = await openSession(id, request);
  const user = mapUser((await sql`SELECT * FROM users WHERE id = ${id}`)[0]);
  return json({ ...sessionPayload(user), emailSent }, 201, [cookie]);
}

export async function loginUser(request) {
  assertSameOrigin(request);
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const sql = getSql();
  await ready();
  if (await hitLimit(`login:${clientIp(request)}:${email}`, 8, 900)) {
    throw httpError(429, "Too many login attempts. Try again later.");
  }
  const rows = await sql`SELECT * FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`;
  const user = mapUser(rows[0]);
  if (!user || !(await verifyPassword(body.password || "", user.passwordHash))) {
    throw httpError(401, "Email or password is wrong.");
  }
  if (user.disabledAt) throw httpError(403, "This account is disabled.");
  const cookie = await openSession(user.id, request);
  return json(sessionPayload(user), 200, [cookie]);
}

export async function logoutUser(request) {
  assertSameOrigin(request);
  const user = await currentUser(request);
  if (user) await clearSessions(user.id);
  return json({ ok: true }, 200, [clearSessionCookie(request)]);
}

export async function me(request) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    return json({ user: null, error: "Accounts are not configured yet." }, 503);
  }
  const user = await currentUser(request);
  return json(sessionPayload(user));
}

export async function verifyEmail(request) {
  const origin = appOrigin(request);
  const token = new URL(request.url).searchParams.get("token") || "";
  const sql = getSql();
  await ready();
  const rows = await sql`SELECT * FROM email_tokens
    WHERE token_hash = ${sha256(token)} AND purpose = 'verify' AND used_at IS NULL AND expires_at > NOW() LIMIT 1`;
  if (!rows.length) return Response.redirect(`${origin}/?verify=invalid`, 302);
  const row = rows[0];
  await sql`UPDATE email_tokens SET used_at = NOW() WHERE id = ${row.id}`;
  await sql`UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE id = ${row.user_id}`;
  const cookie = await openSession(row.user_id, request);
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}/?verified=1`, "set-cookie": cookie },
  });
}

export async function resendVerification(request) {
  assertSameOrigin(request);
  const user = await requireUser(request);
  if (user.emailVerifiedAt) throw httpError(400, "This email is already verified.");
  const sql = getSql();
  if (await hitLimit(`verify-resend:${user.id}`, 5, 3600)) throw httpError(429, "Wait a bit before sending another email.");
  const issued = await issueToken(sql, user.id, "verify", 24);
  const msg = verificationMessage(appOrigin(request), issued.token);
  await sendMail({ to: user.email, ...msg, idempotencyKey: `verify-email/${issued.id}` });
  return json({ ok: true });
}

export async function forgotPassword(request) {
  assertSameOrigin(request);
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const sql = getSql();
  await ready();
  if (await hitLimit(`forgot:${clientIp(request)}`, 8, 3600)) {
    return json({ ok: true });
  }
  const rows = await sql`SELECT * FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`;
  const user = mapUser(rows[0]);
  if (user && !user.disabledAt) {
    try {
      if (!user.emailVerifiedAt) {
        const issued = await issueToken(sql, user.id, "verify", 24);
        const msg = verificationMessage(appOrigin(request), issued.token);
        await sendMail({ to: user.email, ...msg, idempotencyKey: `verify-email/${issued.id}` });
      } else {
        const issued = await issueToken(sql, user.id, "reset", 1);
        const msg = resetMessage(appOrigin(request), issued.token);
        await sendMail({ to: user.email, ...msg, idempotencyKey: `password-reset/${issued.id}` });
      }
    } catch (err) {
      console.error(err);
    }
  }
  return json({ ok: true });
}

export async function resetPassword(request) {
  assertSameOrigin(request);
  const body = await readJson(request);
  const badPassword = passwordError(body.password);
  if (badPassword) throw httpError(400, badPassword);
  if (body.password !== body.confirm) throw httpError(400, "Those passwords do not match.");
  const sql = getSql();
  await ready();
  const rows = await sql`SELECT * FROM email_tokens
    WHERE token_hash = ${sha256(body.token || "")} AND purpose = 'reset' AND used_at IS NULL AND expires_at > NOW() LIMIT 1`;
  if (!rows.length) throw httpError(400, "That reset link is invalid or expired.");
  const row = rows[0];
  const hash = await hashPassword(body.password);
  await sql`UPDATE email_tokens SET used_at = NOW() WHERE id = ${row.id}`;
  await sql`UPDATE users SET password_hash = ${hash}, must_change_password = FALSE, updated_at = NOW() WHERE id = ${row.user_id}`;
  await clearSessions(row.user_id);
  const cookie = await openSession(row.user_id, request);
  const user = mapUser((await sql`SELECT * FROM users WHERE id = ${row.user_id}`)[0]);
  return json(sessionPayload(user), 200, [cookie]);
}

export async function changePassword(request) {
  assertSameOrigin(request);
  const user = await requireUser(request);
  const body = await readJson(request);
  const badPassword = passwordError(body.next);
  if (badPassword) throw httpError(400, badPassword);
  if (body.next !== body.confirm) throw httpError(400, "Those passwords do not match.");
  const sql = getSql();
  const rows = await sql`SELECT password_hash FROM users WHERE id = ${user.id} LIMIT 1`;
  if (!(await verifyPassword(body.current || "", rows[0] && rows[0].password_hash))) {
    throw httpError(401, "Current password is wrong.");
  }
  if (await verifyPassword(body.next, rows[0].password_hash)) {
    throw httpError(400, "Choose a different password.");
  }
  const hash = await hashPassword(body.next);
  await sql`UPDATE users SET password_hash = ${hash}, must_change_password = FALSE, updated_at = NOW() WHERE id = ${user.id}`;
  const fresh = mapUser((await sql`SELECT * FROM users WHERE id = ${user.id}`)[0]);
  return json(sessionPayload(fresh));
}

export async function deleteAccount(request) {
  assertSameOrigin(request);
  const user = await requireUser(request);
  const body = await readJson(request);
  if (normalizeEmail(body.email) !== user.email) throw httpError(400, "Type your email to confirm.");
  await cancelSubscriptionIfAny(user);
  await wipeUser(user.id);
  return json({ ok: true }, 200, [clearSessionCookie(request)]);
}

export async function wipeUser(userId) {
  const sql = getSql();
  await ready();
  const anon = `deleted+${userId}@users.invalid`;
  await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
  await sql`DELETE FROM email_tokens WHERE user_id = ${userId}`;
  await sql`DELETE FROM progress WHERE user_id = ${userId}`;
  await sql`UPDATE users SET
    email = ${anon},
    password_hash = 'deleted',
    deleted_at = NOW(),
    disabled_at = COALESCE(disabled_at, NOW()),
    must_change_password = FALSE,
    updated_at = NOW()
    WHERE id = ${userId} AND deleted_at IS NULL`;
}
