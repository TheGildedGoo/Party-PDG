import { fail } from "../lib/http.js";
import { listUsers, mutateUser } from "../lib/actions/admin.js";

export async function GET(request) {
  try {
    return await listUsers(request);
  } catch (err) {
    console.error(err && err.status >= 500 ? err : (err && err.message));
    return fail(err);
  }
}

export async function POST(request) {
  try {
    return await mutateUser(request);
  } catch (err) {
    console.error(err && err.status >= 500 ? err : (err && err.message));
    return fail(err);
  }
}
