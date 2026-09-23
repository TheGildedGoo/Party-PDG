import { fail } from "../lib/http.js";
import { validateCode } from "../lib/actions/billing.js";

export async function POST(request) {
  try {
    return await validateCode(request);
  } catch (err) {
    console.error(err && err.status >= 500 ? err : (err && err.message));
    return fail(err);
  }
}
