import { fail } from "../lib/http.js";

async function run(request, method) {
  try {
    const actions = await import("../lib/actions/progress.js");
    if (method === "PUT") return await actions.putProgress(request);
    return await actions.getProgress(request);
  } catch (err) {
    console.error(err && err.status >= 500 ? err : (err && err.message));
    return fail(err);
  }
}

export function GET(request) {
  return run(request, "GET");
}

export function PUT(request) {
  return run(request, "PUT");
}
