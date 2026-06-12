"use client";

import { ActionCard } from "./ActionCard";
import { ClaimConfirmation } from "./ClaimConfirmation";
import { ClaimUpdateConfirmation } from "./ClaimUpdateConfirmation";

interface WidgetRendererProps {
  widgetType: string;
  widgetData: Record<string, unknown>;
  onConfirmClaim: (claimId: string) => Promise<void>;
  onCancelClaim: (claimId: string) => Promise<void>;
  onApplyClaimUpdate: (claimId: string, timelineEntryId: string) => Promise<void>;
  onWidgetAction: (payload: string) => void;
}

export function WidgetRenderer({
  widgetType,
  widgetData,
  onConfirmClaim,
  onCancelClaim,
  onApplyClaimUpdate,
  onWidgetAction,
}: WidgetRendererProps) {
  switch (widgetType) {
    case "claim_confirmation":
      return (
        <ClaimConfirmation
          data={widgetData as unknown as Parameters<typeof ClaimConfirmation>[0]["data"]}
          onConfirm={onConfirmClaim}
          onCancel={onCancelClaim}
        />
      );

    case "claim_update_confirmation":
      return (
        <ClaimUpdateConfirmation
          data={widgetData as unknown as Parameters<typeof ClaimUpdateConfirmation>[0]["data"]}
          onApply={onApplyClaimUpdate}
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
