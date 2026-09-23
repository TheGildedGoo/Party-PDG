import { fail } from "../lib/http.js";
import { deleteAccount } from "../lib/actions/auth.js";

export async function POST(request) {
  try {
    return await deleteAccount(request);
  } catch (err) {
    console.error(err && err.status >= 500 ? err : (err && err.message));
    return fail(err);
  }
}
