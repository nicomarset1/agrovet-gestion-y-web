import "server-only";
import { panelLoginPath } from "./panel-path";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clearLoginFailures as clearStoredLoginFailures, reserveLoginAttempt as reserveStoredLoginAttempt } from "./db";

const cookieName = "agrovet_admin";
const sessionHours = 6;
const numericPasswordPattern = /^\d{8,12}$/;

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

export async function reserveLoginAttempt(identifier: string) {
  return reserveStoredLoginAttempt(identifier);
}

export async function clearLoginFailures(identifier: string) {
  return clearStoredLoginFailures(identifier);
}

// La firma de la sesión depende también del código de acceso: cambiarlo revoca todas las cookies, sin
// consultar la base en cada pedido.
function signSession(payload: string) {
  const key = createHmac("sha256", secret()).update(`sesion:${process.env.ADMIN_PASSWORD ?? ""}`).digest();
  return createHmac("sha256", key).update(payload).digest("hex");
}

export function createSessionToken(expires: number, nonce: string) {
  const payload = `admin.${expires}.${nonce}`;
  return `${payload}.${signSession(payload)}`;
}

export function isValidSessionToken(token: string) {
  const [role, expires, nonce, signature] = token.split(".");
  const payload = `${role}.${expires}.${nonce}`;
  if (role !== "admin" || Number(expires) < Date.now() || !nonce || !signature) return false;
  const expected = Buffer.from(signSession(payload));
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function startAdminSession() {
  const maxAge = 60 * 60 * sessionHours;
  const expires = Date.now() + 1000 * maxAge;
  const nonce = randomBytes(16).toString("hex");
  (await cookies()).set(cookieName, createSessionToken(expires, nonce), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function isAdmin() {
  const token = (await cookies()).get(cookieName)?.value;
  return token ? isValidSessionToken(token) : false;
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect(panelLoginPath);
}

export async function endAdminSession() {
  (await cookies()).delete(cookieName);
}
