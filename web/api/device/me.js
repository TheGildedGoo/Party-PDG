import { fail } from "../lib/http.js";
import { deviceMe, deviceResponse } from "../lib/actions/device.js";
import { devicePreflight } from "../lib/device-session.js";

export function OPTIONS() {
  return devicePreflight();
}

export async function GET(request) {
  try {
    return deviceResponse(await deviceMe(request));
  } catch (err) {
    console.error(err && err.status >= 500 ? err : (err && err.message));
    return deviceResponse(fail(err));
  }
}
