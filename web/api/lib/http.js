export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function json(body, status = 200, cookies = []) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify({ saas: true, ...body }), { status, headers });
}

export function fail(err) {
  const status = err && err.status ? err.status : 500;
  const message = status >= 500 ? "Something went wrong." : (err && err.message) || "Request failed.";
  return json({ error: message }, status);
}

export async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  if (text.length > 400000) throw httpError(413, "That request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "Invalid JSON.");
  }
}

export function appOrigin(request) {
  const configured = process.env.APP_ORIGIN && String(process.env.APP_ORIGIN).replace(/\/$/, "");
  if (configured) return configured;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "pdg-play.vercel.app";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export function assertSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const allowed = new Set([appOrigin(request)]);
  if (process.env.APP_ORIGIN) allowed.add(String(process.env.APP_ORIGIN).replace(/\/$/, ""));
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) allowed.add(`${proto}://${host}`);
  if (!allowed.has(origin)) throw httpError(403, "Cross-origin request blocked.");
}

export function clientIp(request) {
  const fwd = request.headers.get("x-forwarded-for") || "";
  return (fwd.split(",")[0].trim() || "unknown").slice(0, 80);
}

export function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const parts = header.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return "";
}

export function sessionCookie(token, request, maxAge) {
  const secure = process.env.VERCEL === "1" || (request.headers.get("x-forwarded-proto") || "").includes("https");
  const parts = [
    `pdg_session=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(request) {
  return sessionCookie("", request, 0);
}
