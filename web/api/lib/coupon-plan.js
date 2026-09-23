const PLAN_CENTS = 100;

export function normalizeCode(raw) {
  return String(raw || "").trim().toUpperCase();
}

export function codeError(code) {
  if (!/^[A-Z0-9-]{3,40}$/.test(code)) return "Use 3–40 letters, numbers, or dashes.";
  return null;
}

export function dollarsToCents(input) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.round(input * 100);
  }
  const text = String(input == null ? "" : input).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const parts = text.split(".");
  const dollars = Number(parts[0]);
  const frac = ((parts[1] || "") + "00").slice(0, 2);
  return dollars * 100 + Number(frac);
}

function money(cents) {
  return "$" + (cents / 100).toFixed(2);
}

function monthsValue(months) {
  if (months == null || months === "" || Number(months) === 0) return null;
  const n = Number(months);
  if (!Number.isInteger(n) || n < 1 || n > 36) return { error: "Duration must be blank (forever) or 1–36 months." };
  return n;
}

/**
 * Map an admin discount form onto a Stripe coupon.
 * Forever partial discounts keep the 30-day trial, then stay discounted.
 * Month-limited discounts skip the trial so all N months bill at the promo price, then return to $1.
 * A forever 100% comp does not collect a card. Deleting that code cancels those subscriptions.
 */
export function planCoupon(input) {
  const src = input || {};
  const kind = String(src.kind || "").toLowerCase();
  if (kind !== "comp" && kind !== "percent" && kind !== "amount") {
    return { ok: false, error: "Type must be comp, percent, or amount." };
  }
  const monthsParsed = monthsValue(src.months);
  if (monthsParsed && monthsParsed.error) return { ok: false, error: monthsParsed.error };
  const months = monthsParsed;

  let percentOff = null;
  let amountOffCents = null;
  if (kind === "comp") {
    percentOff = 100;
  } else if (kind === "percent") {
    const pct = Number(src.percentOff);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      return { ok: false, error: "Percent off must be between 1 and 100." };
    }
    percentOff = Math.round(pct * 100) / 100;
  } else {
    const cents = src.amountOffCents != null && src.amountOffCents !== ""
      ? Number(src.amountOffCents)
      : dollarsToCents(src.amountOff);
    if (!Number.isInteger(cents) || cents < 1 || cents > PLAN_CENTS) {
      return { ok: false, error: "Amount off must be from $0.01 to $1.00 on the $1 plan." };
    }
    amountOffCents = cents;
  }

  const due = percentOff != null
    ? Math.max(0, Math.round(PLAN_CENTS * (1 - percentOff / 100)))
    : Math.max(0, PLAN_CENTS - amountOffCents);
  const duration = months ? "repeating" : "forever";
  const keepTrial = duration === "forever" && due > 0;
  const deferCard = duration === "forever" && due === 0;
  const pay = money(due);
  let summary;
  if (duration === "forever" && due === 0) {
    summary = "Free until an admin deletes this code. No card required.";
  } else if (duration === "repeating" && due === 0) {
    summary = `Free for ${months} months, then $1/mo. A card is collected for the months after the comp.`;
  } else if (kind === "percent" && duration === "forever") {
    summary = `${percentOff}% off after the 30-day trial (${pay}/mo).`;
  } else if (kind === "percent") {
    summary = `${percentOff}% off for ${months} months (${pay}/mo), then $1/mo. The 30-day trial is not added on top of this code.`;
  } else if (duration === "forever") {
    summary = `${money(amountOffCents)} off after the 30-day trial (${pay}/mo).`;
  } else {
    summary = `${money(amountOffCents)} off for ${months} months (${pay}/mo), then $1/mo. The 30-day trial is not added on top of this code.`;
  }

  const stripeCoupon = { duration };
  if (months) stripeCoupon.duration_in_months = months;
  if (percentOff != null) stripeCoupon.percent_off = percentOff;
  else {
    stripeCoupon.amount_off = amountOffCents;
    stripeCoupon.currency = "usd";
  }

  return {
    ok: true,
    kind,
    percentOff,
    amountOffCents,
    duration,
    months,
    keepTrial,
    deferCard,
    dueCents: due,
    summary,
    stripeCoupon,
  };
}

export function checkoutOptions(user, plan) {
  const hadBilling = !!(user && (user.subscriptionStatus || user.trialEndsAt));
  const trial = !hadBilling && plan.keepTrial;
  return {
    trialPeriodDays: trial ? 30 : null,
    paymentMethodCollection: plan.deferCard ? "if_required" : "always",
  };
}

export function plainCheckoutOptions(user) {
  const hadBilling = !!(user && (user.subscriptionStatus || user.trialEndsAt));
  return {
    trialPeriodDays: hadBilling ? null : 30,
    paymentMethodCollection: "always",
  };
}
