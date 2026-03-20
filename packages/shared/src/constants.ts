export const CLAIM_STATUS = {
  PENDING_CONFIRMATION: "pending_confirmation",
  STAGED: "staged",
  SUBMITTED: "submitted",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  NEEDS_ATTENTION: "needs_attention",
} as const;

export type ClaimStatus = (typeof CLAIM_STATUS)[keyof typeof CLAIM_STATUS];

export const TIMELINE_ENTRY_TYPE = {
  MESSAGE: "message",
  WIDGET: "widget",
  SYSTEM_EVENT: "system_event",
} as const;

export type TimelineEntryType = (typeof TIMELINE_ENTRY_TYPE)[keyof typeof TIMELINE_ENTRY_TYPE];

export const DIRECTION = {
  INBOUND: "inbound",
  OUTBOUND: "outbound",
  SYSTEM: "system",
} as const;

export type Direction = (typeof DIRECTION)[keyof typeof DIRECTION];

export const VISIBILITY = {
  DEFAULT: "default",
  FILTERED: "filtered",
  INTERNAL: "internal",
} as const;

export type Visibility = (typeof VISIBILITY)[keyof typeof VISIBILITY];

export const WIDGET_TYPE = {
  CLAIM_CONFIRMATION: "claim_confirmation",
  ACTION_CARD: "action_card",
  REPORT: "report",
} as const;

export type WidgetType = (typeof WIDGET_TYPE)[keyof typeof WIDGET_TYPE];

export const BATCH_STATUS = {
  PENDING: "pending",
  SUBMITTED: "submitted",
  COMPLETED: "completed",
  PARTIAL_FAILURE: "partial_failure",
} as const;

export type BatchStatus = (typeof BATCH_STATUS)[keyof typeof BATCH_STATUS];

export const SUBSCRIPTION_STATUS = {
  FREE: "free",
  ACTIVE: "active",
} as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];
