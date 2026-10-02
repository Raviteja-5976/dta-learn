/**
 * Central place for environment access. Public values are inlined at build
 * time by Next.js (NEXT_PUBLIC_*); server values are read at request time.
 */

export const publicEnv = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  cheerpxVersion: process.env.NEXT_PUBLIC_CHEERPX_VERSION ?? "1.3.9",
  sandboxIdleMinutes: Number(process.env.NEXT_PUBLIC_SANDBOX_IDLE_MINUTES ?? 30),
};

export function isSupabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

export const serverEnv = {
  supabaseServiceRoleKey: () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? required("SUPABASE_SERVICE_ROLE_KEY"),
  adminEmails: () =>
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  s3: () => ({
    bucket: required("S3_BUCKET"),
    region: process.env.S3_REGION ?? "ap-south-1",
    accessKeyId: process.env.S3_ACCESS_KEY_ID || undefined,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || undefined,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || undefined,
  }),
  s3Configured: () => Boolean(process.env.S3_BUCKET),
  judge0: () => ({
    url: (process.env.JUDGE0_URL ?? "").replace(/\/+$/, ""),
    apiKey: process.env.JUDGE0_API_KEY ?? "",
  }),
  judge0Configured: () => Boolean(process.env.JUDGE0_URL),
  razorpay: () => ({
    keyId: required("RAZORPAY_KEY_ID"),
    keySecret: required("RAZORPAY_KEY_SECRET"),
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  }),
  razorpayConfigured: () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
  billing: () => ({
    // A course purchase unlocks the course for this many calendar months.
    courseAccessMonths: Number(process.env.COURSE_ACCESS_MONTHS ?? 6),
    // Paid subscribers keep access this long past the period end while a renewal retries.
    graceDays: Number(process.env.SUBSCRIPTION_GRACE_DAYS ?? 5),
    // Billing cycles authorised up front (Razorpay requires a total_count).
    subscriptionCycles: Number(process.env.SUBSCRIPTION_TOTAL_COUNT ?? 60),
  }),
  xai: () => ({
    apiKey: required("XAI_API_KEY"),
    baseUrl: (process.env.XAI_BASE_URL ?? "https://api.x.ai/v1").replace(/\/+$/, ""),
    model: process.env.XAI_MODEL ?? "grok-4.3",
  }),
  xaiConfigured: () => Boolean(process.env.XAI_API_KEY),
  limits: () => ({
    runsPerMinute: Number(process.env.COMPILE_RUNS_PER_MINUTE ?? 10),
    runsPerDay: Number(process.env.COMPILE_RUNS_PER_DAY ?? 200),
    checksPerMinute: Number(process.env.COMPILE_CHECKS_PER_MINUTE ?? 5),
  }),
};
