import { fail } from "../../lib/http.js";
import { verifyEmail } from "../../lib/actions/auth.js";

export async function GET(request) {
  try {
    return await verifyEmail(request);
  } catch (err) {
    console.error(err && err.status >= 500 ? err : (err && err.message));
    return fail(err);
  }
}
