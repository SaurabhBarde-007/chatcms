import { toDirectUrl } from "./database-url";

// All environment variables in one place. See .env.example for descriptions.
// Values are read lazily so `next build` works without them; a missing required
// variable throws a clear error the first time it's actually used.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

export const env = {
  /** Neon connection string, used for all queries (and NOTIFY). */
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  /** The same database without Neon's pooler, used for LISTEN. See ./database-url.ts. */
  get directDatabaseUrl() {
    return toDirectUrl(env.databaseUrl);
  },

  whatsapp: {
    get verifyToken() {
      return required("WA_VERIFY_TOKEN");
    },
    get appSecret() {
      return required("WA_APP_SECRET");
    },
    get accessToken() {
      return required("WA_ACCESS_TOKEN");
    },
    get phoneNumberId() {
      return required("WA_PHONE_NUMBER_ID");
    },
    get businessAccountId() {
      return required("WA_BUSINESS_ACCOUNT_ID");
    },
    get graphVersion() {
      return process.env.WA_GRAPH_VERSION || "v26.0";
    },
    /** Meta App ID, used to upload template sample media. Optional: looked up from the token if empty. */
    get appId() {
      return process.env.WA_APP_ID ?? "";
    },
    /** Only changed for testing against a fake Graph API. */
    get graphBaseUrl() {
      return process.env.WA_GRAPH_BASE_URL || "https://graph.facebook.com";
    },
  },

  /** Shared secret for /api/cron/campaigns (GitHub Actions sends it). Optional locally. */
  get cronSecret() {
    return (process.env.CRON_SECRET ?? "").trim();
  },

  /** Key your systems use to call this app's API (opt-in API, API campaigns). */
  get apiKey() {
    return process.env.API_KEY || process.env.OPTIN_API_KEY || "";
  },
  /** @deprecated use apiKey (OPTIN_API_KEY still works). */
  get optInApiKey() {
    return env.apiKey;
  },

  bot: {
    get ingestSecret() {
      return required("BOT_INGEST_SECRET");
    },
    get callbackUrl() {
      return required("BOT_CALLBACK_URL");
    },
  },
};
