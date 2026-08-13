import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// PrismaClient יחיד לתהליך — ב-CLI זה טריוויאלי; ב-Next (תוכנית 2ב) globalThis מונע חיבורים כפולים ב-dev
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
