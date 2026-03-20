import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ContentBlockParam,
  ToolResultBlockParam,
  ToolUseBlock,
  TextBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { db } from "@/db";
import { timelineEntries, users } from "@/db/schema";
import { eq, desc, and, ne } from "drizzle-orm";
import { buildSystemPrompt } from "@/prompts/system";
import { tools, executeTool } from "@/tools";
import type { WidgetData } from "@betty/shared";

const MAX_TOOL_ITERATIONS = 5;
const CONTEXT_WINDOW_SIZE = 50;

const anthropic = new Anthropic();

interface ConversationEvent {
  type: "delta" | "widget" | "done" | "error";
  data: unknown;
}

/**
 * Process a user message and stream Betty's response.
 *
 * This is the core orchestration loop:
 * 1. Save user message as inbound timeline entry
 * 2. Load conversation context from timeline
 * 3. Call Claude with streaming, tools, and system prompt
 * 4. Handle tool calls in a loop (max 5 iterations)
 * 5. Stream text deltas and widget data back to the caller
 * 6. Save Betty's response as outbound timeline entry
 */
export async function processMessage(
  userId: string,
  messageText: string,
  onEvent: (event: ConversationEvent) => void
): Promise<void> {
  // 1. Save inbound message
  await db.insert(timelineEntries).values({
    userId,
    type: "message",
    direction: "inbound",
    content: messageText,
    visibility: "default",
    importanceFlag: false,
  });

  // 2. Load user context
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (!user) {
    onEvent({ type: "error", data: { message: "User not found" } });
    return;
  }

  // 3. Load conversation history
  const history = await db
    .select()
    .from(timelineEntries)
    .where(and(eq(timelineEntries.userId, userId), ne(timelineEntries.visibility, "internal")))
    .orderBy(desc(timelineEntries.createdAt))
    .limit(CONTEXT_WINDOW_SIZE);

  // Reverse to chronological order
  history.reverse();

  // Convert timeline entries to Claude message format
  const messages = timelineToMessages(history);

  // Build system prompt
  const systemPrompt = buildSystemPrompt({
    currentDate: new Date().toISOString().slice(0, 10),
    userName: user.name,
    practitionerId: user.ahcipPractitionerId,
  });

  // 4. Call Claude with tool loop
  let fullResponseText = "";
  let widgets: WidgetData[] = [];
  let currentMessages = [...messages];
  let iterations = 0;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: currentMessages,
      tools,
    });

    let toolUseBlocks: ToolUseBlock[] = [];
    let textContent = "";

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        textContent += event.delta.text;
        onEvent({ type: "delta", data: { text: event.delta.text } });
      }
    }

    const finalMessage = await stream.finalMessage();

    // Collect tool use blocks
    for (const block of finalMessage.content) {
      if (block.type === "tool_use") {
        toolUseBlocks.push(block);
      }
    }

    fullResponseText += textContent;

    // If no tool calls, we're done
    if (toolUseBlocks.length === 0) {
      break;
    }

    // Execute tools and build tool results
    const toolResults: ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const result = await executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>,
        userId
      );

      // Check if the tool created a widget
      try {
        const parsed = JSON.parse(result);
        if (parsed.widget) {
          widgets.push(parsed.widget);
          onEvent({ type: "widget", data: parsed.widget });
        }
      } catch {
        // Not JSON or no widget — that's fine
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    // Add assistant message and tool results for next iteration
    currentMessages = [
      ...currentMessages,
      { role: "assistant", content: finalMessage.content },
      { role: "user", content: toolResults },
    ];
  }

  // 5. Save outbound message
  if (fullResponseText.trim()) {
    await db.insert(timelineEntries).values({
      userId,
      type: "message",
      direction: "outbound",
      content: fullResponseText,
      visibility: "default",
      importanceFlag: false,
    });
  }

  // 6. Signal completion
  onEvent({ type: "done", data: { text: fullResponseText } });
}

/**
 * Convert timeline entries to Claude message format.
 */
function timelineToMessages(entries: (typeof timelineEntries.$inferSelect)[]): MessageParam[] {
  const messages: MessageParam[] = [];

  for (const entry of entries) {
    if (entry.direction === "inbound" && entry.content) {
      messages.push({
        role: "user",
        content: entry.content,
      });
    } else if (entry.direction === "outbound") {
      const content: ContentBlockParam[] = [];

      if (entry.content) {
        content.push({ type: "text", text: entry.content });
      }

      if (entry.widgetType && entry.widgetData) {
        // Include widget data as context so Betty knows what she already presented
        content.push({
          type: "text",
          text: `[Widget displayed: ${JSON.stringify(entry.widgetData)}]`,
        });
      }

      if (content.length > 0) {
        messages.push({ role: "assistant", content });
      }
    } else if (entry.direction === "system" && entry.content) {
      // System events shown as assistant messages with context
      messages.push({
        role: "assistant",
        content: `[System: ${entry.content}]`,
      });
    }
  }

  // Ensure messages alternate properly (Claude requires user/assistant alternation)
  return consolidateMessages(messages);
}

/**
 * Ensure messages alternate between user and assistant roles.
 * Merge consecutive same-role messages.
 */
function consolidateMessages(messages: MessageParam[]): MessageParam[] {
  if (messages.length === 0) return [];

  const result: MessageParam[] = [messages[0]];

  for (let i = 1; i < messages.length; i++) {
    const prev = result[result.length - 1];
    const curr = messages[i];

    if (prev.role === curr.role) {
      // Merge content
      const prevContent = Array.isArray(prev.content)
        ? prev.content
        : [{ type: "text" as const, text: prev.content }];
      const currContent = Array.isArray(curr.content)
        ? curr.content
        : [{ type: "text" as const, text: curr.content }];

      result[result.length - 1] = {
        role: prev.role,
        content: [...prevContent, ...currContent] as ContentBlockParam[],
      };
    } else {
      result.push(curr);
    }
  }

  return result;
}
