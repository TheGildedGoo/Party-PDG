import { fail } from "../../lib/http.js";
import { listCodes, createCode, mutateCode } from "../../lib/actions/admin.js";

export async function GET(request) {
  try {
    return await listCodes(request);
  } catch (err) {
    console.error(err && err.status >= 500 ? err : (err && err.message));
    return fail(err);
  }
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("action")) return await mutateCode(request);
    return await createCode(request);
  } catch (err) {
    console.error(err && err.status >= 500 ? err : (err && err.message));
    return fail(err);
  }
}
