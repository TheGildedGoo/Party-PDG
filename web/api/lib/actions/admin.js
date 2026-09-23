import { getSql, ready, mapUser } from "../db.js";
import { json, readJson, httpError, assertSameOrigin } from "../http.js";
import { requireUser } from "../session.js";
import { publicUser } from "../entitlement.js";
import { normalizeCode, codeError, planCoupon } from "../coupon-plan.js";
import { getStripe } from "../stripe-client.js";
import { cancelSubscriptionIfAny } from "./billing.js";
import { wipeUser } from "./auth.js";

async function requireAdmin(request) {
  const user = await requireUser(request);
  if (user.role !== "admin") throw httpError(403, "Admin only.");
  if (user.mustChangePassword) throw httpError(403, "Change your password first.");
  return user;
}

function viewUser(row) {
  const user = mapUser(row);
  return { ...publicUser(user), createdAt: user.createdAt };
}

export async function listUsers(request) {
  await requireAdmin(request);
  const sql = getSql();
  await ready();
  const rows = await sql`SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 200`;
  return json({ users: rows.map(viewUser) });
}

export async function mutateUser(request) {
  assertSameOrigin(request);
  const admin = await requireAdmin(request);
  const body = await readJson(request);
  const action = String(body.action || "");
  if (!body.id) throw httpError(400, "Missing user.");
  if ((action === "delete" || action === "disable") && body.id === admin.id) {
    throw httpError(400, "Use account settings to delete your own account.");
  }
  const sql = getSql();
  const rows = await sql`SELECT * FROM users WHERE id = ${body.id} AND deleted_at IS NULL LIMIT 1`;
  const user = mapUser(rows[0]);
  if (!user) throw httpError(404, "User not found.");
  if (action === "disable") {
    await sql`UPDATE users SET disabled_at = NOW(), updated_at = NOW() WHERE id = ${user.id}`;
    await sql`DELETE FROM sessions WHERE user_id = ${user.id}`;
  } else if (action === "enable") {
    await sql`UPDATE users SET disabled_at = NULL, updated_at = NOW() WHERE id = ${user.id}`;
  } else if (action === "delete") {
    await cancelSubscriptionIfAny(user);
    await wipeUser(user.id);
  } else {
    throw httpError(400, "Unknown action.");
  }
  return json({ ok: true });
}

function expiresUnix(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) throw httpError(400, "Expiration date is invalid.");
  if (ms < Date.now() + 60 * 1000) throw httpError(400, "Expiration must be in the future.");
  if (ms > Date.now() + 5 * 365 * 24 * 3600 * 1000) throw httpError(400, "Expiration must be within 5 years.");
  return Math.floor(ms / 1000);
}

function viewCode(row, redemptions) {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    percentOff: row.percent_off == null ? null : Number(row.percent_off),
    amountOffCents: row.amount_off_cents,
    duration: row.duration,
    months: row.duration_months,
    maxRedemptions: row.max_redemptions,
    expiresAt: row.expires_at,
    active: !!row.active,
    notes: row.notes || "",
    summary: row.summary || "",
    redemptions: redemptions.map((item) => ({
      email: item.email,
      at: item.created_at,
      revoked: !!item.revoked_at,
      subscriptionId: item.stripe_subscription_id || null,
    })),
  };
}

export async function listCodes(request) {
  await requireAdmin(request);
  const sql = getSql();
  await ready();
  const codes = await sql`SELECT * FROM discount_codes WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`;
  const redemptions = await sql`SELECT * FROM discount_redemptions ORDER BY created_at DESC LIMIT 500`;
  const byCode = {};
  for (const row of redemptions) {
    if (!byCode[row.code_id]) byCode[row.code_id] = [];
    if (byCode[row.code_id].length < 50) byCode[row.code_id].push(row);
  }
  return json({
    codes: codes.map((row) => viewCode(row, byCode[row.id] || [])),
    note: "Codes are Stripe coupons plus promotion codes. Duration-limited codes skip the 30-day trial so the promo months are real, then the price returns to $1/mo. Forever partial discounts start after the trial. Deleting a free comp cancels those subscriptions. Disabling a code only stops new redemptions.",
  });
}

export async function createCode(request) {
  assertSameOrigin(request);
  await requireAdmin(request);
  const body = await readJson(request);
  const code = normalizeCode(body.code);
  const bad = codeError(code);
  if (bad) throw httpError(400, bad);
  const plan = planCoupon(body);
  if (!plan.ok) throw httpError(400, plan.error);
  const max = body.maxRedemptions === "" || body.maxRedemptions == null ? null : Number(body.maxRedemptions);
  if (max != null && (!Number.isInteger(max) || max < 1 || max > 100000)) {
    throw httpError(400, "Max redemptions must be blank or a positive number.");
  }
  const expires = expiresUnix(body.expiresAt);
  const notes = String(body.notes || "").slice(0, 500);
  const active = body.active !== false;
  const sql = getSql();
  await ready();
  const dup = await sql`SELECT id FROM discount_codes WHERE code = ${code} AND deleted_at IS NULL LIMIT 1`;
  if (dup.length) throw httpError(409, "That code already exists.");
  const stripe = getStripe();
  const id = crypto.randomUUID();
  const couponParams = {
    name: code.slice(0, 40),
    metadata: { codeId: id, notes },
    ...plan.stripeCoupon,
  };
  if (max) couponParams.max_redemptions = max;
  if (expires) couponParams.redeem_by = expires;
  let coupon;
  let promo;
  try {
    coupon = await stripe.coupons.create(couponParams);
    const promoParams = {
      promotion: { type: "coupon", coupon: coupon.id },
      code,
      active,
      metadata: { codeId: id },
    };
    if (max) promoParams.max_redemptions = max;
    if (expires) promoParams.expires_at = expires;
    promo = await stripe.promotionCodes.create(promoParams);
  } catch (err) {
    console.error(err);
    throw httpError(400, err && err.message ? err.message : "Stripe rejected that code.");
  }
  try {
    await sql`INSERT INTO discount_codes (
      id, code, kind, percent_off, amount_off_cents, duration, duration_months,
      max_redemptions, expires_at, active, notes, summary, stripe_coupon_id, stripe_promotion_code_id
    ) VALUES (
      ${id}, ${code}, ${plan.kind}, ${plan.percentOff}, ${plan.amountOffCents}, ${plan.duration}, ${plan.months},
      ${max}, ${expires ? new Date(expires * 1000).toISOString() : null}, ${active}, ${notes}, ${plan.summary},
      ${coupon.id}, ${promo.id}
    )`;
  } catch (err) {
    console.error(err);
    try { await stripe.promotionCodes.update(promo.id, { active: false }); } catch (inner) { console.error(inner); }
    throw httpError(500, "Could not save that code.");
  }
  return json({ ok: true, id });
}

export async function mutateCode(request) {
  assertSameOrigin(request);
  await requireAdmin(request);
  const body = await readJson(request);
  const action = String(body.action || "");
  const sql = getSql();
  await ready();
  const rows = await sql`SELECT * FROM discount_codes WHERE id = ${body.id || ""} AND deleted_at IS NULL LIMIT 1`;
  const row = rows[0];
  if (!row) throw httpError(404, "Code not found.");
  const stripe = getStripe();
  if (action === "disable" || action === "enable") {
    const active = action === "enable";
    if (active && row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      throw httpError(400, "That code is expired.");
    }
    await stripe.promotionCodes.update(row.stripe_promotion_code_id, { active });
    await sql`UPDATE discount_codes SET active = ${active} WHERE id = ${row.id}`;
    return json({ ok: true });
  }
  if (action !== "delete") throw httpError(400, "Unknown action.");
  const failures = [];
  if (row.kind === "comp") {
    const redemptions = await sql`SELECT * FROM discount_redemptions WHERE code_id = ${row.id} AND revoked_at IS NULL`;
    for (const redemption of redemptions) {
      if (redemption.stripe_subscription_id) {
        try {
          await stripe.subscriptions.cancel(redemption.stripe_subscription_id);
        } catch (err) {
          console.error(err);
          failures.push(redemption.email);
        }
      }
      await sql`UPDATE discount_redemptions SET revoked_at = NOW() WHERE id = ${redemption.id}`;
    }
  }
  try {
    await stripe.promotionCodes.update(row.stripe_promotion_code_id, { active: false });
  } catch (err) {
    console.error(err);
  }
  await sql`UPDATE discount_codes SET active = FALSE, deleted_at = NOW() WHERE id = ${row.id}`;
  return json({ ok: true, revokeFailures: failures });
}
