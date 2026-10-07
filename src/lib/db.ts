import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

// One Prisma client per process, created on first use (so importing this file never
// needs DATABASE_URL — `next build` and unit tests work without it). Kept on globalThis
// so dev hot reload doesn't open a new connection pool on every edit.
const globalForDb = globalThis as unknown as { db?: PrismaClient };

function client(): PrismaClient {
  return (globalForDb.db ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: env.databaseUrl }) }));
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
