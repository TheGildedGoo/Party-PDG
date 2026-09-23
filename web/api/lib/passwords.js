import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

export const ADMIN_EMAIL = "nalyd0206@gmail.com";

export function passwordError(password) {
  const value = String(password || "");
  if (value.length < 8) return "Use at least 8 characters.";
  if (value.length > 200) return "That password is too long.";
  return null;
}

export function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

export function emailError(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email.";
  if (email.length > 320) return "That email is too long.";
  return null;
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${buf.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const expected = Buffer.from(parts[2], "hex");
  const actual = await scrypt(password, parts[1], 64);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function newToken() {
  return randomBytes(32).toString("base64url");
}
