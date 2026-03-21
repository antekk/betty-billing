"use client";

import { ActionCard } from "./ActionCard";
import { ClaimConfirmation } from "./ClaimConfirmation";

interface WidgetRendererProps {
  widgetType: string;
  widgetData: Record<string, unknown>;
  onConfirmClaim: (claimId: string) => Promise<void>;
  onWidgetAction: (payload: string) => void;
}

export function WidgetRenderer({
  widgetType,
  widgetData,
  onConfirmClaim,
  onWidgetAction,
}: WidgetRendererProps) {
  switch (widgetType) {
    case "claim_confirmation":
      return (
        <ClaimConfirmation
          data={widgetData as unknown as Parameters<typeof ClaimConfirmation>[0]["data"]}
          onConfirm={onConfirmClaim}
        />
      );

    case "action_card":
      return (
        <ActionCard
          data={widgetData as unknown as Parameters<typeof ActionCard>[0]["data"]}
          onAction={onWidgetAction}
        />
      );

    default:
      return null;
  }
}
