import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma לא עובר bundling של Next — נשאר external בצד השרת
  serverExternalPackages: ["@prisma/client"],
  // StrictMode מריץ effects פעמיים ב-dev — אצלנו effect אחד יורה סריקה בתשלום (Places).
  // הגנת ה-module-level במסך הסריקה היא ההגנה האמיתית; זה מוריד את הרעש
  reactStrictMode: false,
};

export default nextConfig;
