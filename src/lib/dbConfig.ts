/** Hosts on the same machine or the Compose network, where TLS adds nothing. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "postgres"]);

export type SslSetting = false | { rejectUnauthorized: boolean };

interface SslOptions {
  url: string;
  nodeEnv?: string;
  /** DATABASE_SSL: true | require | no-verify | false | disable */
  override?: string;
}

/**
 * TLS settings for the PostgreSQL pool (REQ-INT-001): verified TLS for remote
 * databases in production, plain connections locally. DATABASE_SSL or the URL's
 * sslmode override the default (no-verify suits providers with private CAs).
 */
export function databaseSsl({ url, nodeEnv, override }: SslOptions): SslSetting {
  if (override !== undefined && override !== "") {
    switch (override.toLowerCase()) {
      case "true":
      case "require":
        return { rejectUnauthorized: true };
      case "no-verify":
        return { rejectUnauthorized: false };
      case "false":
      case "disable":
        return false;
      default:
        throw new Error(`DATABASE_SSL must be true, require, no-verify, false or disable; got "${override}"`);
    }
  }

  const parsed = new URL(url);
  const sslmode = parsed.searchParams.get("sslmode");
  if (sslmode === "disable") return false;
  if (sslmode) return { rejectUnauthorized: true };

  if (nodeEnv !== "production") return false;
  return LOCAL_HOSTS.has(parsed.hostname) ? false : { rejectUnauthorized: true };
}
