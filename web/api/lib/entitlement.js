/** Pure play-access rules. No database and no Stripe calls. */

export function entitlement(user, now = Date.now()) {
  if (!user || user.deletedAt) return { canPlay: false, reason: "auth" };
  if (user.disabledAt) return { canPlay: false, reason: "disabled" };
  if (user.mustChangePassword) return { canPlay: false, reason: "password" };
  if (!user.emailVerifiedAt) return { canPlay: false, reason: "unverified" };
  if (user.role === "admin") return { canPlay: true, reason: "admin" };
  const status = user.subscriptionStatus || "";
  if (status === "trialing" || status === "active") {
    const end = user.currentPeriodEnd ? new Date(user.currentPeriodEnd).getTime() : 0;
    if (status === "active" && end && end + 24 * 60 * 60 * 1000 < now) {
      return { canPlay: false, reason: "lapsed", status };
    }
    return { canPlay: true, reason: status };
  }
  if (!status) return { canPlay: false, reason: "subscribe" };
  return { canPlay: false, reason: "lapsed", status };
}

export function publicUser(user) {
  if (!user || user.deletedAt) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt || null,
    mustChangePassword: !!user.mustChangePassword,
    disabledAt: user.disabledAt || null,
    subscriptionStatus: user.subscriptionStatus || null,
    trialEndsAt: user.trialEndsAt || null,
    currentPeriodEnd: user.currentPeriodEnd || null,
    username: user.username || null,
    hasBillingCustomer: !!user.stripeCustomerId,
    entitlement: entitlement(user),
  };
}
