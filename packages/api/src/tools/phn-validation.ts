import { validatePhn } from "@betty/shared";

import type { Tool } from "@anthropic-ai/sdk/resources/messages";

export const phnValidationTool: Tool = {
  name: "validate_phn",
  description:
    "Validate an Alberta Personal Health Number (PHN). PHNs are 9 digits with a check digit. Always validate before creating a claim.",
  input_schema: {
    type: "object" as const,
    properties: {
      phn: {
        type: "string",
        description: "The PHN to validate (9 digits)",
      },
    },
    required: ["phn"],
  },
};

export function handlePhnValidation(input: { phn: string }): string {
  const result = validatePhn(input.phn);
  return JSON.stringify(result);
}
