import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/securityHeaders";

const directives = (csp: string) =>
  Object.fromEntries(
    csp
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name, values.join(" ")];
      }),
  );

describe("contentSecurityPolicy (REQ-NFR-SEC1, defense in depth)", () => {
  const csp = directives(contentSecurityPolicy({ isDev: false }));

  it("only allows resources from this origin", () => {
    expect(csp["default-src"]).toBe("'self'");
    expect(csp["connect-src"]).toBe("'self'");
    expect(csp["font-src"]).toBe("'self'");
    expect(csp["img-src"]).toBe("'self' blob: data:");
  });

  it("blocks plugins, base-tag hijacking, foreign form posts and framing", () => {
    expect(csp["object-src"]).toBe("'none'");
    expect(csp["base-uri"]).toBe("'self'");
    expect(csp["form-action"]).toBe("'self'");
    expect(csp["frame-ancestors"]).toBe("'none'");
  });

  it("allows Next.js inline bootstrap scripts but never eval in production", () => {
    expect(csp["script-src"]).toBe("'self' 'unsafe-inline'");
    expect(csp["style-src"]).toBe("'self' 'unsafe-inline'");
  });

  it("adds 'unsafe-eval' only in development, where React needs it for error overlays", () => {
    expect(directives(contentSecurityPolicy({ isDev: true }))["script-src"]).toBe("'self' 'unsafe-inline' 'unsafe-eval'");
  });
});

describe("securityHeaders", () => {
  const headers = Object.fromEntries(securityHeaders({ isDev: false }).map((h) => [h.key, h.value]));

  it.each([
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "DENY"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Cross-Origin-Opener-Policy", "same-origin"],
    ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"],
  ])("sets %s: %s", (key, value) => {
    expect(headers[key]).toBe(value);
  });

  it("includes the content security policy", () => {
    expect(headers["Content-Security-Policy"]).toBe(contentSecurityPolicy({ isDev: false }));
  });
});
