// Row shapes for the Supabase tables (supabase/migrations). Kept by hand so the
// app compiles without a live database; regenerate with `supabase gen types`
// if you prefer generated types.

export type Role = "student" | "instructor" | "admin";
export type CourseStatus = "draft" | "published" | "archived";
export type Level = "beginner" | "intermediate" | "advanced";
export type ItemKind = "article" | "lab" | "quiz";
export type RuntimeType = "terminal" | "compile";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  headline: string | null;
  avatar_url: string | null;
  role: Role;
  created_at: string;
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_image_url: string | null;
  level: Level;
  tags: string[];
  skills: string[];
  status: CourseStatus;
  is_free: boolean;
  price_paise: number | null;
  estimated_hours: number | null;
  owner_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  position: number;
}

export interface Item {
  id: string;
  course_id: string;
  section_id: string;
  kind: ItemKind;
  title: string;
  summary: string | null;
  position: number;
  required: boolean;
  is_preview: boolean;
  estimated_minutes: number | null;
  lab_id: string | null;
}

export interface SectionWithItems extends Section {
  items: Item[];
}

export interface Article {
  item_id: string;
  blocks: import("@/lib/blocks/schema").Block[];
  reading_minutes: number | null;
}

export interface Quiz {
  item_id: string;
  pass_score: number;
  shuffle_questions: boolean;
  max_attempts: number | null;
  show_answers: boolean;
}

export type QuestionType = "single" | "multiple" | "text" | "code_output";

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  item_id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  code: string | null;
  code_language: string | null;
  options: QuestionOption[];
  points: number;
}

export interface QuestionKey {
  question_id: string;
  answer: { correct?: string[]; accepted?: string[]; caseSensitive?: boolean };
  explanation: string | null;
}

export interface Enrollment {
  id: string;
  user_id: string;
  course_id: string;
  source: string;
  enrolled_at: string;
  completed_at: string | null;
  last_item_id: string | null;
  last_activity_at: string;
}

export interface ItemProgress {
  user_id: string;
  item_id: string;
  course_id: string;
  status: "in_progress" | "completed";
  score: number | null;
  evidence: "server" | "client" | "self" | null;
  completed_at: string | null;
}

export interface Lab {
  id: string;
  slug: string;
  title: string;
  runtime_type: RuntimeType;
  current_version_id: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabVersion {
  id: string;
  lab_id: string;
  version: number;
  spec_yaml: string;
  spec: import("@/lib/labs/spec").LabSpec;
  runtime_type: RuntimeType;
  language: string | null;
  sandbox_image_id: string | null;
  created_at: string;
}

export interface LabAttempt {
  id: string;
  user_id: string;
  lab_version_id: string;
  item_id: string | null;
  course_id: string | null;
  runtime_type: RuntimeType;
  status: "active" | "completed" | "closed";
  steps_passed: string[];
  hints_used: Record<string, number>;
  seed: string | null;
  draft: { files: { path: string; content: string }[] } | null;
  started_at: string;
  completed_at: string | null;
}

export interface SandboxImage {
  id: string;
  slug: string;
  version: number;
  url: string;
  image_type: "cloud" | "bytes" | "github";
  size_bytes: number | null;
  sha256: string | null;
  status: "active" | "retired";
  boot_manifest: string[] | null;
  notes: string | null;
}

export interface CompileLanguage {
  slug: string;
  provider_language_id: number;
  label: string;
  monaco_language: string;
  main_file: string;
  enabled: boolean;
  default_limits: { cpuSeconds: number; wallSeconds: number; memoryMiB: number };
}

export interface Certificate {
  id: string;
  public_code: string;
  user_id: string;
  course_id: string;
  recipient_name: string;
  course_title: string;
  skills: string[];
  hours: number | null;
  evidence: { serverVerified?: number; selfVerified?: number; quizzes?: number; items?: number };
  payload_hash: string;
  status: "valid" | "revoked";
  issued_at: string;
}

// ── commerce ─────────────────────────────────────────────────────────────────
export interface Entitlement {
  id: string;
  user_id: string;
  scope_type: "course" | "catalog";
  course_id: string | null;
  source: "free" | "purchase" | "subscription" | "admin_grant" | "coupon_grant" | "org_seat";
  starts_at: string;
  ends_at: string | null;
  status: "active" | "revoked" | "expired";
  note: string | null;
  order_id: string | null;
  subscription_id: string | null;
  created_at: string;
}

export interface BillingPlan {
  id: string;
  provider: string;
  provider_plan_id: string;
  name: string;
  amount_paise: number;
  currency: string;
  interval: "month" | "year";
  active: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  course_id: string | null;
  amount_paise: number;
  currency: string;
  access_months: number;
  status: "created" | "paid" | "failed" | "refunded";
  provider: string;
  provider_order_id: string;
  provider_payment_id: string | null;
  paid_at: string | null;
  created_at: string;
}

export type SubscriptionStatus = "created" | "authenticated" | "active" | "pending" | "halted" | "cancelled" | "completed" | "expired";

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  provider: string;
  provider_subscription_id: string;
  current_start: string | null;
  current_end: string | null;
  cancel_at_period_end: boolean;
  ended_at: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  order_id: string | null;
  subscription_id: string | null;
  provider_payment_id: string;
  amount_paise: number;
  currency: string;
  status: "captured" | "refunded" | "partially_refunded";
  method: string | null;
  created_at: string;
}

// ── AI tutor ─────────────────────────────────────────────────────────────────
export interface AiTutorSettings {
  enabled: boolean;
  dailyLimit: number;
}

export interface AiMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}
