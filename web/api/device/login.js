import { fail } from "../lib/http.js";
import { deviceLogin, deviceResponse } from "../lib/actions/device.js";
import { devicePreflight } from "../lib/device-session.js";

export function OPTIONS() {
  return devicePreflight();
}

export async function POST(request) {
  try {
    return deviceResponse(await deviceLogin(request));
  } catch (err) {
    console.error(err && err.status >= 500 ? err : (err && err.message));
    return deviceResponse(fail(err));
  }
}
