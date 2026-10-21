import { config } from "./config.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: config.databaseUrl,
  connectionTimeoutMillis: config.serviceTimeoutMs,
  query_timeout: config.serviceTimeoutMs,
  statement_timeout: config.serviceTimeoutMs,
});

export const prisma = new PrismaClient({ adapter });
