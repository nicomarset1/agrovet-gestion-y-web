import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const cookieName = "agrovet_admin";
const sessionHours = 6;
const loginWindowMs = 1000 * 60 * 15;
const loginLockMs = 1000 * 60 * 15;
const maxLoginFailures = 5;
const numericPasswordPattern = /^\d{8,12}$/;

type LoginBucket = {
  failures: number;
  lockedUntil: number;
  resetAt: number;
};

const loginBuckets = new Map<string, LoginBucket>();

function secret() {
  const value = process.env.AUTH_SECRET ?? "";
  if (process.env.NODE_ENV === "production" && value.length < 32) {
    throw new Error("AUTH_SECRET must be configured with at least 32 characters.");
  }
  return value || "agrovet-local-development-secret-change-me";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function isValidAdminPassword(password: string) {
  const configured = process.env.ADMIN_PASSWORD ?? "";
  if (!numericPasswordPattern.test(configured) || !numericPasswordPattern.test(password)) return false;
  const expected = Buffer.from(sign(configured));
  const supplied = Buffer.from(sign(password));
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function getLoginRateLimit(identifier: string) {
  const now = Date.now();
  const bucket = loginBuckets.get(identifier);
  if (!bucket) return { limited: false, retryAfterSeconds: 0 };
  if (bucket.resetAt <= now && bucket.lockedUntil <= now) {
    loginBuckets.delete(identifier);
    return { limited: false, retryAfterSeconds: 0 };
  }
  if (bucket.lockedUntil > now) {
    return { limited: true, retryAfterSeconds: Math.ceil((bucket.lockedUntil - now) / 1000) };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export function recordLoginAttempt(identifier: string, success: boolean) {
  if (success) {
    loginBuckets.delete(identifier);
    return;
  }
  const now = Date.now();
  const current = loginBuckets.get(identifier);
  const bucket = current && current.resetAt > now
    ? current
    : { failures: 0, lockedUntil: 0, resetAt: now + loginWindowMs };
  bucket.failures += 1;
  if (bucket.failures >= maxLoginFailures) {
    bucket.lockedUntil = now + loginLockMs;
    bucket.resetAt = bucket.lockedUntil;
  }
  loginBuckets.set(identifier, bucket);
}

export async function startAdminSession() {
  const maxAge = 60 * 60 * sessionHours;
  const expires = Date.now() + 1000 * maxAge;
  const nonce = randomBytes(16).toString("hex");
  const payload = `admin.${expires}.${nonce}`;
  (await cookies()).set(cookieName, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function isAdmin() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return false;
  const [role, expires, nonce, signature] = token.split(".");
  const payload = `${role}.${expires}.${nonce}`;
  if (role !== "admin" || Number(expires) < Date.now() || !nonce || !signature) return false;
  const expected = Buffer.from(sign(payload));
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

export async function endAdminSession() {
  (await cookies()).delete(cookieName);
}
