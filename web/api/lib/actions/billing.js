import { getSql, ready, mapUser } from "../db.js";
import { json, readJson, httpError, assertSameOrigin, appOrigin } from "../http.js";
import { requireUser, sessionPayload } from "../session.js";
import { getStripe, priceId, integrationIdentifier } from "../stripe-client.js";
import { normalizeCode, planCoupon, checkoutOptions, plainCheckoutOptions } from "../coupon-plan.js";
import { periodEndSeconds, promotionCodeIdFromSession, subscriptionIdFromInvoice } from "../billing-shape.js";

async function loadCode(sql, raw) {
  const code = normalizeCode(raw);
  if (!code) return null;
  const rows = await sql`SELECT * FROM discount_codes WHERE code = ${code} AND deleted_at IS NULL LIMIT 1`;
  return rows[0] || null;
}

function codeIsUsable(row, redemptionCount) {
  if (!row || !row.active) return "That code is not active.";
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return "That code has expired.";
  if (row.max_redemptions && redemptionCount >= Number(row.max_redemptions)) return "That code has been fully redeemed.";
  if (!row.stripe_promotion_code_id) return "That code is not ready for checkout.";
  return "";
}

async function redemptionCount(sql, codeId) {
  const rows = await sql`SELECT COUNT(*)::int AS n FROM discount_redemptions WHERE code_id = ${codeId} AND revoked_at IS NULL`;
  return Number(rows[0] && rows[0].n) || 0;
}

export async function validateCode(request) {
  assertSameOrigin(request);
  const body = await readJson(request);
  const sql = getSql();
  await ready();
  const row = await loadCode(sql, body.code);
  const reason = codeIsUsable(row, row ? await redemptionCount(sql, row.id) : 0);
  if (reason) throw httpError(400, reason);
  const plan = planCoupon({
    kind: row.kind,
    percentOff: row.percent_off,
    amountOffCents: row.amount_off_cents,
    months: row.duration === "repeating" ? row.duration_months : null,
  });
  return json({ ok: true, summary: row.summary || (plan.ok ? plan.summary : "") });
}

async function ensureCustomer(stripe, user) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { userId: user.id },
  });
  const sql = getSql();
  await sql`UPDATE users SET stripe_customer_id = ${customer.id}, updated_at = NOW() WHERE id = ${user.id}`;
  return customer.id;
}

export async function createCheckout(request) {
  assertSameOrigin(request);
  const user = await requireUser(request);
  if (user.mustChangePassword) throw httpError(403, "Change your password first.");
  if (!user.emailVerifiedAt) throw httpError(403, "Verify your email first.");
  if (user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing") {
    throw httpError(409, "You already have an active plan. Use Manage billing to change it.");
  }
  if (user.subscriptionStatus === "past_due" || user.subscriptionStatus === "unpaid") {
    throw httpError(409, "Update your payment method in the billing portal.");
  }
  const body = await readJson(request);
  const sql = getSql();
  const stripe = getStripe();
  let codeRow = null;
  let plan = null;
  if (body.code) {
    codeRow = await loadCode(sql, body.code);
    const reason = codeIsUsable(codeRow, codeRow ? await redemptionCount(sql, codeRow.id) : 0);
    if (reason) throw httpError(400, reason);
    plan = planCoupon({
      kind: codeRow.kind,
      percentOff: codeRow.percent_off,
      amountOffCents: codeRow.amount_off_cents,
      months: codeRow.duration === "repeating" ? codeRow.duration_months : null,
    });
    if (!plan.ok) throw httpError(400, plan.error);
  }
  const options = plan ? checkoutOptions(user, plan) : plainCheckoutOptions(user);
  const origin = appOrigin(request);
  const customerId = await ensureCustomer(stripe, user);
  const params = {
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceId(), quantity: 1 }],
    success_url: `${origin}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?billing=cancel`,
    payment_method_collection: options.paymentMethodCollection,
    subscription_data: { metadata: { userId: user.id } },
    metadata: {
      userId: user.id,
      discountCodeId: codeRow ? codeRow.id : "",
      promotionCodeId: codeRow ? codeRow.stripe_promotion_code_id : "",
    },
    integration_identifier: integrationIdentifier(),
  };
  if (options.trialPeriodDays) params.subscription_data.trial_period_days = options.trialPeriodDays;
  if (codeRow) params.discounts = [{ promotion_code: codeRow.stripe_promotion_code_id }];
  else params.allow_promotion_codes = true;
  const session = await stripe.checkout.sessions.create(params);
  return json({ url: session.url });
}

export async function createPortal(request) {
  assertSameOrigin(request);
  const user = await requireUser(request);
  if (!user.stripeCustomerId) throw httpError(400, "No billing profile yet. Subscribe first.");
  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${appOrigin(request)}/?billing=return`,
  });
  return json({ url: portal.url });
}

export async function confirmCheckout(request) {
  assertSameOrigin(request);
  const user = await requireUser(request);
  const body = await readJson(request);
  if (!body.sessionId) throw httpError(400, "Missing checkout session.");
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(body.sessionId, {
    expand: ["subscription", "discounts"],
  });
  const owner = session.client_reference_id || (session.metadata && session.metadata.userId);
  if (owner !== user.id) throw httpError(403, "That checkout session belongs to another account.");
  await applyCheckoutSession(session, user.id);
  const sql = getSql();
  const fresh = mapUser((await sql`SELECT * FROM users WHERE id = ${user.id}`)[0]);
  return json(sessionPayload(fresh));
}

export async function syncSubscription(sub, fallbackUserId) {
  const sql = getSql();
  await ready();
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer && sub.customer.id;
  let userId = (sub.metadata && sub.metadata.userId) || fallbackUserId || "";
  if (!userId && customerId) {
    const rows = await sql`SELECT id FROM users WHERE stripe_customer_id = ${customerId} LIMIT 1`;
    userId = rows[0] && rows[0].id;
  }
  if (!userId) return;
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
  const period = periodEndSeconds(sub);
  const periodEnd = period ? new Date(period * 1000).toISOString() : null;
  await sql`UPDATE users SET
    stripe_customer_id = ${customerId},
    stripe_subscription_id = ${sub.id},
    subscription_status = ${sub.status},
    trial_ends_at = ${trialEnd},
    current_period_end = ${periodEnd},
    updated_at = NOW()
    WHERE id = ${userId}`;
}

async function recordRedemption(session, userId, subscriptionId) {
  const sql = getSql();
  const meta = session.metadata || {};
  let codeId = meta.discountCodeId || "";
  const promoId = promotionCodeIdFromSession(session);
  if (!codeId && promoId) {
    const rows = await sql`SELECT id FROM discount_codes WHERE stripe_promotion_code_id = ${promoId} LIMIT 1`;
    codeId = rows[0] && rows[0].id;
  }
  if (!codeId || !userId) return;
  const users = await sql`SELECT email, deleted_at FROM users WHERE id = ${userId} LIMIT 1`;
  if (!users.length || users[0].deleted_at) return;
  const id = crypto.randomUUID();
  await sql`INSERT INTO discount_redemptions (id, code_id, user_id, email, stripe_subscription_id)
    VALUES (${id}, ${codeId}, ${userId}, ${users[0].email}, ${subscriptionId || null})
    ON CONFLICT (code_id, user_id) DO NOTHING`;
}

export async function applyCheckoutSession(session, fallbackUserId) {
  if (!session || session.mode !== "subscription") return;
  const subId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription && session.subscription.id;
  const userId = session.client_reference_id || (session.metadata && session.metadata.userId) || fallbackUserId;
  if (subId) {
    const stripe = getStripe();
    const sub = typeof session.subscription === "object" && session.subscription && session.subscription.status
      ? session.subscription
      : await stripe.subscriptions.retrieve(subId);
    await syncSubscription(sub, userId);
  }
  await recordRedemption(session, userId, subId);
}

export async function cancelSubscriptionIfAny(user) {
  if (!user || !user.stripeSubscriptionId) return;
  const status = user.subscriptionStatus || "";
  if (!["active", "trialing", "past_due", "unpaid", "paused"].includes(status)) return;
  try {
    const stripe = getStripe();
    await stripe.subscriptions.cancel(user.stripeSubscriptionId);
  } catch (err) {
    console.error("stripe cancel", err && err.message);
    throw httpError(502, "Could not cancel the Stripe subscription. Try Manage billing, then delete the account again.");
  }
}

export async function handleStripeEvent(event) {
  const sql = getSql();
  await ready();
  const inserted = await sql`INSERT INTO stripe_events (id, type) VALUES (${event.id}, ${event.type})
    ON CONFLICT (id) DO NOTHING RETURNING id`;
  if (!inserted.length) return;
  try {
    await dispatchStripe(event);
  } catch (err) {
    await sql`DELETE FROM stripe_events WHERE id = ${event.id}`;
    throw err;
  }
}

async function dispatchStripe(event) {
  const stripe = getStripe();
  if (event.type === "checkout.session.completed") {
    const full = await stripe.checkout.sessions.retrieve(event.data.object.id, {
      expand: ["subscription", "discounts"],
    });
    await applyCheckoutSession(full);
    return;
  }
  if (event.type.startsWith("customer.subscription.")) {
    await syncSubscription(event.data.object);
    return;
  }
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const subId = subscriptionIdFromInvoice(event.data.object);
    if (!subId) return;
    const sub = await stripe.subscriptions.retrieve(subId);
    await syncSubscription(sub);
  }
}

export async function stripeWebhook(request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw httpError(503, "STRIPE_WEBHOOK_SECRET is not set.");
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature");
  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    console.error("stripe webhook signature failed");
    throw httpError(400, "Invalid Stripe signature.");
  }
  await handleStripeEvent(event);
  return json({ received: true });
}
