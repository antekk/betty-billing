import { describe, expect, test, beforeEach } from "bun:test";

import { processMessage } from "./conversation.service";

import { users, timelineEntries } from "@/db/schema";
import {
  dbState,
  setSelect,
  setAnthropicScripts,
  anthropicState,
  type ScriptedTurn,
} from "@/test-support/fakes";

// @/db and @anthropic-ai/sdk are mocked globally by the test preload; we drive
// them here through the shared fake state. The tool executor is injected.

const MAX_TOOL_ITERATIONS = 5;

function collectEvents() {
  const events: { type: string; data: unknown }[] = [];
  const onEvent = (e: { type: string; data: unknown }) => events.push(e);
  return { events, onEvent };
}

function fakeExecuteTool(returnValue: string) {
  const calls: { name: string; input: Record<string, unknown>; userId: string }[] = [];
  const fn = async (name: string, input: Record<string, unknown>, userId: string) => {
    calls.push({ name, input, userId });
    return returnValue;
  };
  return { fn, calls };
}

beforeEach(() => {
  // One existing user, empty history by default.
  setSelect(users, [{ id: "user-1", name: "Dr. Smith", ahcipPractitionerId: "PRAC-123" }]);
  setSelect(timelineEntries, []);
});

describe("processMessage", () => {
  test("plain text response: streams deltas, emits done, persists inbound + outbound", async () => {
    setAnthropicScripts([
      {
        deltas: ["Hello ", "there ", "Doctor."],
        content: [{ type: "text", text: "Hello there Doctor." }],
      },
    ]);

    const { events, onEvent } = collectEvents();
    await processMessage("user-1", "hi", onEvent);

    const concatenated = events
      .filter((e) => e.type === "delta")
      .map((e) => (e.data as { text: string }).text)
      .join("");
    expect(concatenated).toBe("Hello there Doctor.");

    const doneEvents = events.filter((e) => e.type === "done");
    expect(doneEvents).toHaveLength(1);
    expect((doneEvents[0].data as { text: string }).text).toBe("Hello there Doctor.");
    expect(events[events.length - 1].type).toBe("done");
    expect(events.filter((e) => e.type === "widget")).toHaveLength(0);

    // Model invoked exactly once (no tool loop) with the configured model id.
    expect(anthropicState.callCount).toBe(1);
    expect((anthropicState.calls[0] as { model: string }).model).toBe("claude-sonnet-4-6");

    // Inbound persisted first, outbound persisted with the full response text.
    const inbound = dbState.inserts.find((i) => i.values.direction === "inbound");
    expect(inbound?.values.content).toBe("hi");
    const outbound = dbState.inserts.find((i) => i.values.direction === "outbound");
    expect(outbound?.values.content).toBe("Hello there Doctor.");
    expect(outbound?.values.userId).toBe("user-1");
  });

  test("tool-use loop: emits widget, executes tool with right args, then finishes", async () => {
    const widget = { type: "claim_confirmation", claimId: "claim-1", feeCode: "03.03A" };
    const exec = fakeExecuteTool(JSON.stringify({ widget }));

    setAnthropicScripts([
      {
        deltas: ["Let me create that. "],
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "create_claim",
            input: { fee_code: "03.03A", phn: "123456782" },
          },
        ],
      },
      { deltas: ["Done!"], content: [{ type: "text", text: "Done!" }] },
    ]);

    const { events, onEvent } = collectEvents();
    await processMessage("user-1", "bill a visit", onEvent, { executeTool: exec.fn });

    expect(exec.calls).toHaveLength(1);
    expect(exec.calls[0].name).toBe("create_claim");
    expect(exec.calls[0].input).toEqual({ fee_code: "03.03A", phn: "123456782" });
    expect(exec.calls[0].userId).toBe("user-1");

    const widgetEvents = events.filter((e) => e.type === "widget");
    expect(widgetEvents).toHaveLength(1);
    expect(widgetEvents[0].data).toEqual(widget);

    // Two model turns: the tool turn, then the final text turn.
    expect(anthropicState.callCount).toBe(2);
    // The second turn received the tool_result fed back from the first.
    const secondTurnMessages = (anthropicState.calls[1] as { messages: unknown[] }).messages;
    const serialized = JSON.stringify(secondTurnMessages);
    expect(serialized).toContain("tool_result");

    const done = events[events.length - 1];
    expect(done.type).toBe("done");
    expect((done.data as { text: string }).text).toBe("Let me create that. Done!");

    const outbound = dbState.inserts.find((i) => i.values.direction === "outbound");
    expect(outbound?.values.content).toBe("Let me create that. Done!");
  });

  test("max-iteration guard: stops at MAX_TOOL_ITERATIONS and still emits done", async () => {
    // Every turn requests a tool -> would loop forever without the guard.
    const exec = fakeExecuteTool("{}");
    const loopingTurn: ScriptedTurn = {
      deltas: ["thinking "],
      content: [
        { type: "tool_use", id: "toolu_x", name: "fee_code_lookup", input: { query: "x" } },
      ],
    };
    setAnthropicScripts([loopingTurn]); // exhausted script repeats this turn

    const { events, onEvent } = collectEvents();
    await processMessage("user-1", "loop forever", onEvent, { executeTool: exec.fn });

    expect(anthropicState.callCount).toBe(MAX_TOOL_ITERATIONS);
    expect(exec.calls).toHaveLength(MAX_TOOL_ITERATIONS);

    const doneEvents = events.filter((e) => e.type === "done");
    expect(doneEvents).toHaveLength(1);
    expect(events[events.length - 1].type).toBe("done");
  });

  test("throws when the authenticated user no longer exists", async () => {
    setSelect(users, []);
    setAnthropicScripts([{ deltas: ["hi"], content: [{ type: "text", text: "hi" }] }]);

    const { onEvent } = collectEvents();
    let error: unknown;
    try {
      await processMessage("ghost", "hello", onEvent);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("User not found");
  });
});
