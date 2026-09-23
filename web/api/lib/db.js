import { neon } from "@neondatabase/serverless";
import { hashPassword, ADMIN_EMAIL } from "./passwords.js";
import { httpError } from "./http.js";

let sqlClient = null;
let schemaPromise = null;

export function getSql() {
  if (!process.env.DATABASE_URL) throw httpError(503, "DATABASE_URL is not set.");
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    email_verified_at TIMESTAMPTZ,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    disabled_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT,
    trial_ends_at TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS email_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS email_tokens_hash_idx ON email_tokens (token_hash)`,
  `CREATE TABLE IF NOT EXISTS progress (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    sr JSONB NOT NULL DEFAULT '{}'::jsonb,
    achievements JSONB NOT NULL DEFAULT '{}'::jsonb,
    focus JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_session JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS stripe_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    bucket TEXT PRIMARY KEY,
    hits INTEGER NOT NULL,
    window_start TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS discount_codes (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    kind TEXT NOT NULL,
    percent_off NUMERIC,
    amount_off_cents INTEGER,
    duration TEXT NOT NULL,
    duration_months INTEGER,
    max_redemptions INTEGER,
    expires_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    stripe_coupon_id TEXT,
    stripe_promotion_code_id TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS discount_redemptions (
    id TEXT PRIMARY KEY,
    code_id TEXT NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    stripe_subscription_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    UNIQUE (code_id, user_id)
  )`,
];

export function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
    emailVerifiedAt: row.email_verified_at,
    mustChangePassword: !!row.must_change_password,
    disabledAt: row.disabled_at,
    deletedAt: row.deleted_at,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    subscriptionStatus: row.subscription_status,
    trialEndsAt: row.trial_ends_at,
    currentPeriodEnd: row.current_period_end,
    createdAt: row.created_at,
  };
}

async function seedAdmin(sql) {
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!password) {
    console.error("ADMIN_BOOTSTRAP_PASSWORD is not set; admin seed skipped.");
    return;
  }
  const existing = await sql`SELECT id FROM users WHERE email = ${ADMIN_EMAIL} LIMIT 1`;
  if (existing.length) return;
  const hash = await hashPassword(password);
  const id = crypto.randomUUID();
  try {
    await sql`INSERT INTO users (
      id, email, password_hash, role, email_verified_at, must_change_password
    ) VALUES (
      ${id}, ${ADMIN_EMAIL}, ${hash}, 'admin', NOW(), TRUE
    )`;
  } catch (err) {
    if (!/duplicate|unique/i.test(String(err && err.message))) throw err;
  }
}

async function ensure() {
  const sql = getSql();
  for (const statement of STATEMENTS) await sql.query(statement);
  await seedAdmin(sql);
}

export async function ready() {
  if (!schemaPromise) {
    schemaPromise = ensure().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

export async function hitLimit(bucket, limit, windowSec) {
  const sql = getSql();
  await ready();
  const rows = await sql`SELECT hits, window_start FROM rate_limits WHERE bucket = ${bucket}`;
  const now = Date.now();
  if (!rows.length) {
    await sql`INSERT INTO rate_limits (bucket, hits, window_start) VALUES (${bucket}, 1, NOW())`;
    return false;
  }
  const start = new Date(rows[0].window_start).getTime();
  if (now - start > windowSec * 1000) {
    await sql`UPDATE rate_limits SET hits = 1, window_start = NOW() WHERE bucket = ${bucket}`;
    return false;
  }
  const hits = Number(rows[0].hits) + 1;
  await sql`UPDATE rate_limits SET hits = ${hits} WHERE bucket = ${bucket}`;
  return hits > limit;
}
