// The app needs just one setting, DATABASE_URL: the connection string from the Neon console.
//
// Neon's "pooled" URL (host contains "-pooler") goes through PgBouncer, which is right for
// normal queries but can't hold a LISTEN (real-time) or run migrations. For those we connect
// to the same database directly — the same URL with "-pooler" removed. If DATABASE_URL is
// already a direct URL (or a non-Neon Postgres), it's used as-is.

export function toDirectUrl(databaseUrl: string): string {
  return databaseUrl.replace("-pooler.", ".");
}
