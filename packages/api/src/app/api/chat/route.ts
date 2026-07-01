import { type NextRequest } from "next/server";
import { z } from "zod";

import { rateLimit } from "@/lib/rate-limit";
import { authenticate, isAuthError } from "@/middleware/auth";
import { processMessage } from "@/services/conversation.service";

const chatSchema = z.object({
  message: z.string().min(1).max(5000),
});

// Each message can fan out to several Claude calls, so cap per-user throughput.
const CHAT_RATE_LIMIT = { limit: 20, windowMs: 60 * 1000 };

export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (isAuthError(auth)) return auth;

  const rl = await rateLimit(`chat:${auth.userId}`, CHAT_RATE_LIMIT);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({
        error: "You're sending messages too quickly. Give me a moment to catch up.",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString(),
        },
      }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const body = await request.json();
  const parsed = chatSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0].message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { message } = parsed.data;

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await processMessage(auth.userId, message, (event) => {
          const data = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
          controller.enqueue(encoder.encode(data));
        });
      } catch (_error) {
        const errorData = `event: error\ndata: ${JSON.stringify({
          message: "An unexpected error occurred",
        })}\n\n`;
        controller.enqueue(encoder.encode(errorData));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
