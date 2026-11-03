// Límites del login del panel, compartidos por los dos drivers para que se comporten igual.

// Por IP: 5 intentos, y después 15 minutos de espera.
export const loginWindowMs = 1000 * 60 * 15;
export const loginLockMs = 1000 * 60 * 15;
export const maxLoginFailures = 5;

// Tope global: frena probar los 8 dígitos desde muchas IP. Es alto a propósito, para que un intento casual
// no deje afuera al dueño. Quien ya tiene sesión no pasa por acá.
export const globalLoginIdentifier = "__global__";
export const globalLoginWindowMs = 1000 * 60 * 60;
export const maxGlobalLoginFailures = 200;

export type LoginCounter = { failures: number; lockedUntil: number };
export type LoginReservation = { limited: boolean; retryAfterSeconds: number };

// Se cuenta antes de probar el código: el incremento es atómico, así una ráfaga en paralelo no puede pasar
// entera antes de que se registre el primer fallo. Pasa solo si, ya sumado este intento, sigue dentro del tope.
export function loginReservation(counter: LoginCounter, max: number, now: number): LoginReservation {
  if (Number(counter.failures) <= max) return { limited: false, retryAfterSeconds: 0 };
  return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((Number(counter.lockedUntil) - now) / 1000)) };
}
