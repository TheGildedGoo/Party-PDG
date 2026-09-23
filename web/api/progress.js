import { fail } from "../lib/http.js";
import { getProgress, putProgress } from "../lib/actions/progress.js";

export async function GET(request) {
  try {
    return await getProgress(request);
  } catch (err) {
    console.error(err && err.status >= 500 ? err : (err && err.message));
    return fail(err);
  }
}

export async function PUT(request) {
  try {
    return await putProgress(request);
  } catch (err) {
    console.error(err && err.status >= 500 ? err : (err && err.message));
    return fail(err);
  }
}
