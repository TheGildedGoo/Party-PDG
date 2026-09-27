import { entitlement } from "./entitlement.js";

const DAY_SECONDS = 24 * 60 * 60;

export function deviceSessionSeconds() {
  const days = Number(process.env.DEVICE_SESSION_DAYS || 365);
  const clamped = Number.isFinite(days) ? Math.min(730, Math.max(1, days)) : 365;
  return clamped * DAY_SECONDS;
}

export function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : "";
}

export function cleanDeviceName(raw) {
  const name = String(raw || "Pocket PDG").replace(/[^\w .'-]/g, "").trim().slice(0, 40);
  return name || "Pocket PDG";
}

/** Play gate for a brick. Same rules as Quiet Hours, without a browser cookie. */
export function deviceAccessError(user) {
  if (!user || user.deletedAt) return { status: 401, message: "Email or password is wrong." };
  if (user.disabledAt) return { status: 403, message: "This account is disabled." };
  if (!user.emailVerifiedAt) return { status: 403, message: "Verify your email before using Pocket PDG." };
  if (user.mustChangePassword) return { status: 403, message: "Change your password on pdg-play.com before using Pocket PDG." };
  const access = entitlement(user);
  if (!access.canPlay) {
    if (access.reason === "subscribe" || access.reason === "lapsed") {
      return { status: 403, message: "An active plan is required." };
    }
    return { status: 403, message: "This account cannot play yet." };
  }
  return null;
}

export function deviceUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username || null,
    role: user.role,
  };
}

export const deviceCorsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Authorization, Content-Type",
  "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
  "access-control-max-age": "86400",
};

export function devicePreflight() {
  return new Response(null, { status: 204, headers: deviceCorsHeaders });
}

export function withDeviceCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(deviceCorsHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}
