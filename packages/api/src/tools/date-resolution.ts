import * as chrono from "chrono-node";

import type { Tool } from "@anthropic-ai/sdk/resources/messages";

import {
  albertaUtcOffsetMinutes,
  daysBetweenIso,
  formatIsoDate,
  isoDateInAlberta,
} from "@/lib/dates";

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

/** A bare YYYY-MM-DD reference means that civil date in Alberta, not UTC midnight. */
function referenceInstant(reference?: string): Date {
  if (!reference) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(reference)) {
    return new Date(`${reference}T12:00:00-07:00`);
  }
  return new Date(reference);
}

export function handleDateResolution(input: {
  expression: string;
  reference_date?: string;
}): string {
  const refDate = referenceInstant(input.reference_date);
  if (isNaN(refDate.getTime())) {
    return JSON.stringify({
      resolved: false,
      error: `Could not understand reference date "${input.reference_date ?? ""}".`,
    });
  }

  // Resolve relative expressions in Alberta's clock, not the server's.
  const parsed = chrono.parseDate(input.expression, {
    instant: refDate,
    timezone: albertaUtcOffsetMinutes(refDate),
  });

  if (!parsed) {
    return JSON.stringify({
      resolved: false,
      error: `Could not understand "${input.expression}" as a date.`,
    });
  }

  const isoDate = isoDateInAlberta(parsed);
  const todayIso = isoDateInAlberta(refDate);
  const formatted = formatIsoDate(isoDate);

  // Sanity check: date shouldn't be more than 90 days in the past (claim-back period)
  const daysDiff = daysBetweenIso(todayIso, isoDate);
  let warning: string | undefined;
  if (daysDiff > 90) {
    warning =
      "This date is more than 90 days ago. Alberta's standard claim-back period is 90 days — this claim may be rejected.";
  }
  if (isoDate > todayIso) {
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
