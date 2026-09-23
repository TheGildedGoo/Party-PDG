import { fail } from "../../lib/http.js";
import { loginUser } from "../../lib/actions/auth.js";

export async function POST(request) {
  try {
    return await loginUser(request);
  } catch (err) {
    console.error(err && err.status >= 500 ? err : (err && err.message));
    return fail(err);
  }
}
