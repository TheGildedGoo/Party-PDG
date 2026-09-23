import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { entitlement } from "../web/api/lib/entitlement.js";
import { planCoupon, checkoutOptions, plainCheckoutOptions, dollarsToCents, codeError, normalizeCode } from "../web/api/lib/coupon-plan.js";
import { promotionCodeIdFromSession, subscriptionIdFromInvoice, periodEndSeconds } from "../web/api/lib/billing-shape.js";
import { passwordError, hashPassword, verifyPassword } from "../web/api/lib/passwords.js";

const require = createRequire(import.meta.url);
const { mergeSnapshots } = require("../web/js/progress-merge.js");

const base = {
  id: "u1",
  email: "a@example.com",
  role: "user",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  mustChangePassword: false,
  disabledAt: null,
  deletedAt: null,
  subscriptionStatus: null,
  currentPeriodEnd: null,
};

test("play stays locked until email, password, and an active plan", () => {
  assert.equal(entitlement(null).reason, "auth");
  assert.equal(entitlement({ ...base, emailVerifiedAt: null }).reason, "unverified");
  assert.equal(entitlement({ ...base, mustChangePassword: true }).reason, "password");
  assert.equal(entitlement({ ...base, disabledAt: "2026-01-02" }).reason, "disabled");
  assert.equal(entitlement(base).reason, "subscribe");
  assert.equal(entitlement({ ...base, subscriptionStatus: "trialing" }).canPlay, true);
  assert.equal(entitlement({ ...base, subscriptionStatus: "active" }).reason, "active");
  assert.equal(entitlement({ ...base, subscriptionStatus: "past_due" }).reason, "lapsed");
  assert.equal(entitlement({ ...base, subscriptionStatus: "canceled" }).canPlay, false);
  assert.equal(entitlement({ ...base, role: "admin", subscriptionStatus: null }).reason, "admin");
  assert.equal(entitlement({ ...base, role: "admin", mustChangePassword: true }).reason, "password");
});

test("discount codes map onto Stripe coupons", () => {
  const comp = planCoupon({ kind: "comp" });
  assert.equal(comp.ok, true);
  assert.equal(comp.stripeCoupon.percent_off, 100);
  assert.equal(comp.stripeCoupon.duration, "forever");
  assert.equal(comp.keepTrial, false);
  assert.equal(comp.deferCard, true);

  const half = planCoupon({ kind: "percent", percentOff: 50, months: 3 });
  assert.equal(half.stripeCoupon.percent_off, 50);
  assert.equal(half.stripeCoupon.duration, "repeating");
  assert.equal(half.stripeCoupon.duration_in_months, 3);
  assert.equal(half.keepTrial, false);
  assert.match(half.summary, /3 months/);
  assert.match(half.summary, /\$0\.50/);

  const cents = planCoupon({ kind: "amount", amountOff: "0.50", months: 3 });
  assert.equal(cents.amountOffCents, 50);
  assert.equal(cents.stripeCoupon.amount_off, 50);
  assert.equal(cents.stripeCoupon.currency, "usd");
  assert.match(cents.summary, /\$0\.50 off for 3 months/);

  const foreverHalf = planCoupon({ kind: "percent", percentOff: 50 });
  assert.equal(foreverHalf.keepTrial, true);
  assert.equal(foreverHalf.deferCard, false);
  assert.match(foreverHalf.summary, /30-day trial/);

  assert.equal(planCoupon({ kind: "amount", amountOff: "1.50" }).ok, false);
  assert.equal(planCoupon({ kind: "nope" }).ok, false);
  assert.equal(dollarsToCents("0.5"), 50);
  assert.equal(normalizeCode(" friend "), "FRIEND");
  assert.equal(codeError("AB"), "Use 3–40 letters, numbers, or dashes.");
});

test("checkout keeps the trial only when the code does", () => {
  const fresh = { subscriptionStatus: null, trialEndsAt: null };
  const comp = planCoupon({ kind: "comp" });
  assert.deepEqual(checkoutOptions(fresh, comp), { trialPeriodDays: null, paymentMethodCollection: "if_required" });
  const limited = planCoupon({ kind: "amount", amountOff: "0.50", months: 3 });
  assert.equal(checkoutOptions(fresh, limited).trialPeriodDays, null);
  assert.equal(checkoutOptions(fresh, limited).paymentMethodCollection, "always");
  const forever = planCoupon({ kind: "percent", percentOff: 50 });
  assert.equal(checkoutOptions(fresh, forever).trialPeriodDays, 30);
  assert.equal(plainCheckoutOptions(fresh).trialPeriodDays, 30);
  assert.equal(plainCheckoutOptions({ subscriptionStatus: "canceled" }).trialPeriodDays, null);
});

test("billing helpers read current Stripe shapes", () => {
  assert.equal(subscriptionIdFromInvoice({ parent: { subscription_details: { subscription: "sub_1" } } }), "sub_1");
  assert.equal(periodEndSeconds({ items: { data: [{ current_period_end: 50 }] } }), 50);
  assert.equal(promotionCodeIdFromSession({ discounts: [{ promotion_code: "promo_1" }], metadata: {} }), "promo_1");
  assert.equal(promotionCodeIdFromSession({ metadata: { promotionCodeId: "promo_2" } }), "promo_2");
});

test("progress merge keeps both devices and the newer session", () => {
  const merged = mergeSnapshots(
    { sr: { cards: { a: { reps: 2, due: 10 } }, seen: { a: { correct: 2, wrong: 0 } }, chapters: {}, mocks: [], days: ["2026-01-01"] }, achievements: { unlocked: { "first-light": 5 } }, focus: { weakChapters: [{ chapter: 1 }] }, lastSession: { endedAt: "2026-01-01T00:00:00.000Z" } },
    { sr: { cards: { a: { reps: 1, due: 99 }, b: { reps: 1, due: 3 } }, seen: { a: { correct: 1, wrong: 4 } }, chapters: {}, mocks: [{ at: 9 }], days: ["2026-01-02"] }, achievements: { unlocked: { "first-light": 1, "queue-zero": 8 } }, focus: { weakChapters: [{ chapter: 9 }] }, lastSession: { endedAt: "2026-02-01T00:00:00.000Z" } }
  );
  assert.equal(merged.sr.cards.a.reps, 2);
  assert.equal(merged.sr.cards.b.reps, 1);
  assert.equal(merged.sr.seen.a.wrong, 4);
  assert.deepEqual(merged.sr.days, ["2026-01-01", "2026-01-02"]);
  assert.equal(merged.achievements.unlocked["first-light"], 1);
  assert.equal(merged.achievements.unlocked["queue-zero"], 8);
  assert.equal(merged.focus.weakChapters[0].chapter, 9);
  assert.equal(merged.lastSession.endedAt, "2026-02-01T00:00:00.000Z");
});

test("bootstrap password shape is accepted and verified", async () => {
  assert.equal(passwordError("Password1!"), null);
  assert.ok(passwordError("short"));
  const hash = await hashPassword("Password1!");
  assert.equal(await verifyPassword("Password1!", hash), true);
  assert.equal(await verifyPassword("password1!", hash), false);
});
