import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { installExternalCallSink } from "./external-log";

// PrismaClient יחיד לתהליך - ב-CLI זה טריוויאלי; ב-Next (תוכנית 2ב) globalThis מונע חיבורים כפולים ב-dev
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ארכיון הקריאות החיצוניות (הכרעת מייסד 17.8): כל תהליך שרת שמחזיק prisma מחבר את ה-sink -
// זו נקודת האתחול היחידה שכל נתיבי השרת עוברים בה (external-log לא מייבא מכאן - אין מעגל)
installExternalCallSink(prisma);
