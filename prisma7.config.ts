import "dotenv/config";
import { defineConfig } from "prisma/config";
import { toDirectUrl } from "./src/lib/database-url";

// Prisma CLI config (migrate, studio, generate).
// Migrations can't run through Neon's pooler, so they use the direct form of DATABASE_URL.
const databaseUrl = process.env["DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl && toDirectUrl(databaseUrl),
  },
});
