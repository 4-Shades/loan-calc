/**
 * Content Security Policy (REQ-NFR-SEC1, defense in depth behind React's escaping).
 *
 * Uses the Next.js "without nonces" policy: nonces would force every page to render
 * dynamically and are incompatible with partial prerendering, which this app uses.
 * So inline scripts (Next's bootstrap and flight data) stay allowed, but everything
 * else is locked to this origin, eval is off in production, and framing is refused.
 * upgrade-insecure-requests is deliberately omitted: the Docker stack serves plain
 * HTTP and TLS belongs to the reverse proxy in front of it.
 */
export function contentSecurityPolicy({ isDev }: { isDev: boolean }): string {
  const directives: Record<string, string> = {
    "default-src": "'self'",
    // React needs eval only in development, for its error overlay.
    "script-src": `'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src": "'self' 'unsafe-inline'",
    "img-src": "'self' blob: data:",
    "font-src": "'self'",
    "connect-src": "'self'",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "frame-ancestors": "'none'",
  };
  return Object.entries(directives)
    .map(([name, value]) => `${name} ${value}`)
    .join("; ");
}

/** Response headers for every route, pages and API alike. */
export function securityHeaders({ isDev }: { isDev: boolean }): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ isDev }) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ];
}
