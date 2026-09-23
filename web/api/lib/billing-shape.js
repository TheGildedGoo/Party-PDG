export function subscriptionIdFromInvoice(invoice) {
  if (!invoice) return null;
  if (typeof invoice.subscription === "string") return invoice.subscription;
  if (invoice.subscription && invoice.subscription.id) return invoice.subscription.id;
  const details = invoice.parent && invoice.parent.subscription_details;
  if (!details || !details.subscription) return null;
  return typeof details.subscription === "string" ? details.subscription : details.subscription.id || null;
}

export function periodEndSeconds(sub) {
  if (!sub) return null;
  if (sub.current_period_end) return sub.current_period_end;
  const item = sub.items && sub.items.data && sub.items.data[0];
  return (item && item.current_period_end) || null;
}

export function promotionCodeIdFromSession(session) {
  if (!session) return null;
  const discounts = session.discounts || [];
  for (const row of discounts) {
    if (!row) continue;
    if (typeof row.promotion_code === "string") return row.promotion_code;
    if (row.promotion_code && row.promotion_code.id) return row.promotion_code.id;
  }
  const breakdown = session.total_details && session.total_details.breakdown && session.total_details.breakdown.discounts;
  if (Array.isArray(breakdown)) {
    for (const row of breakdown) {
      const disc = (row && row.discount) || row;
      if (!disc) continue;
      const promo = disc.promotion_code;
      if (typeof promo === "string") return promo;
      if (promo && promo.id) return promo.id;
    }
  }
  const meta = session.metadata || {};
  return meta.promotionCodeId || null;
}
