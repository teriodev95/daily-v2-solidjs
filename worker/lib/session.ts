/**
 * Sesión web (cookie + JWT) y su renovación deslizante.
 *
 * La sesión dura 30 días, pero el token se reemite cuando ya tiene más de un
 * día: mientras la persona siga entrando, la sesión se desliza y nunca caduca;
 * si deja de entrar 30 días, se pide login otra vez. Antes el JWT se emitía una
 * sola vez al iniciar sesión y a los 7 días exactos sacaba a todo el mundo,
 * aunque hubieran usado la app a diario.
 */

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 días

// Umbral de reemisión. Alto para no firmar un token en cada petición, bajo
// frente al TTL para que cualquier visita dentro del mes renueve de sobra.
export const SESSION_RENEW_AFTER_SECONDS = 24 * 60 * 60; // 1 día

/**
 * `true` cuando el token ya tiene edad suficiente para reemitirse.
 * Un `iat` ausente o del futuro (reloj desfasado) no renueva: solo se renueva
 * con una edad positiva y comprobable.
 */
export const shouldRenewSession = (
  iat: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean => {
  if (typeof iat !== 'number' || !Number.isFinite(iat)) return false;
  const age = nowSeconds - iat;
  return age > SESSION_RENEW_AFTER_SECONDS;
};

export function sessionCookie(value: string, maxAge: number, reqUrl: string) {
  const isHttps = new URL(reqUrl).protocol === 'https:';
  const sameSite = isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax';
  return `session=${value}; HttpOnly; ${sameSite}; Path=/; Max-Age=${maxAge}`;
}
