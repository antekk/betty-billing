import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url().optional(),
    JWT_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
    ENCRYPTION_KEY: z.string().length(64),
    SMS_PROVIDER: z.enum(["mock", "twilio"]).default("mock"),
    // Twilio — required when SMS_PROVIDER=twilio
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_PHONE_NUMBER: z.string().optional(),
    // Web Push (optional) — generate with: bunx web-push generate-vapid-keys
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional(),
    // Proactive billing-gap reminder threshold (days)
    BILLING_REMINDER_DAYS: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (env) =>
      env.SMS_PROVIDER !== "twilio" ||
      (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER),
    {
      message:
        "SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER",
    }
  )
  .refine((env) => !!env.VAPID_PUBLIC_KEY === !!env.VAPID_PRIVATE_KEY, {
    message: "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together",
  });

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

export function getEnv(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error("Invalid environment variables:", result.error.flatten().fieldErrors);
      throw new Error("Invalid environment variables");
    }
    _env = result.data;
  }
  return _env;
}
