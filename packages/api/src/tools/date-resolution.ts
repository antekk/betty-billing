import * as chrono from "chrono-node";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";

export const dateResolutionTool: Tool = {
  name: "resolve_date",
  description:
    'Resolve a relative or informal date expression to a specific date. Examples: "Monday", "yesterday", "last Friday", "March 16", "today".',
  input_schema: {
    type: "object" as const,
    properties: {
      expression: {
        type: "string",
        description: 'The date expression to resolve (e.g., "Monday", "yesterday")',
      },
      reference_date: {
        type: "string",
        description: "Optional reference date in ISO format. Defaults to today.",
      },
    },
    required: ["expression"],
  },
};

export async function handleDateResolution(input: {
  expression: string;
  reference_date?: string;
}): Promise<string> {
  const refDate = input.reference_date ? new Date(input.reference_date) : new Date();

  const parsed = chrono.parseDate(input.expression, refDate);

  if (!parsed) {
    return JSON.stringify({
      resolved: false,
      error: `Could not understand "${input.expression}" as a date.`,
    });
  }

  const isoDate = parsed.toISOString().slice(0, 10);
  const formatted = parsed.toLocaleDateString("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // Sanity check: date shouldn't be more than 90 days in the past (claim-back period)
  const daysDiff = Math.floor((refDate.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24));
  let warning: string | undefined;
  if (daysDiff > 90) {
    warning =
      "This date is more than 90 days ago. Alberta's standard claim-back period is 90 days — this claim may be rejected.";
  }
  if (parsed > refDate) {
    warning = "This date is in the future. Claims cannot be submitted for future dates.";
  }

  return JSON.stringify({
    resolved: true,
    date: isoDate,
    formatted,
    daysDiff,
    warning,
  });
}
