import { fail } from "../../lib/http.js";
import { createCheckout } from "../../lib/actions/billing.js";

export async function POST(request) {
  try {
    return await createCheckout(request);
  } catch (err) {
    console.error(err && err.status >= 500 ? err : (err && err.message));
    return fail(err);
  }
}
