import { fail } from "../lib/http.js";
import { stripeWebhook } from "../lib/actions/billing.js";

export async function POST(request) {
  try {
    return await stripeWebhook(request);
  } catch (err) {
    console.error(err && err.status >= 500 ? err : (err && err.message));
    return fail(err);
  }
}
