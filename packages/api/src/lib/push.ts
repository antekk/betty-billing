import { eq } from "drizzle-orm";
import webpush from "web-push";

import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

export interface PushPayload {
  title: string;
  body: string;
  /** Path to open when the notification is tapped (defaults to the chat). */
  url?: string;
}

let configured = false;

/**
 * Push is optional — it activates when VAPID keys are present.
 * Generate a key pair with: bunx web-push generate-vapid-keys
 */
export function isPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

function ensureConfigured(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:support@betty.example",
      publicKey,
      privateKey
    );
    configured = true;
  }
  return true;
}

/**
 * Send a push notification to every subscription a user has.
 * Best-effort: failures are logged, expired subscriptions (404/410) are pruned,
 * and nothing here ever throws — push must never break the calling flow.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription expired or unsubscribed — clean it up
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else {
          console.error(`Push send failed for user ${userId}:`, err);
        }
      }
    })
  );
}
