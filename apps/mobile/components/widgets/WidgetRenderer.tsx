import { ClaimConfirmation } from "./ClaimConfirmation";
import { ActionCard } from "./ActionCard";

interface Props {
  widgetType: string;
  widgetData: Record<string, unknown>;
  onConfirmClaim: (claimId: string) => Promise<void>;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
}

export function WidgetRenderer({ widgetType, widgetData, onConfirmClaim, onAction }: Props) {
  switch (widgetType) {
    case "claim_confirmation":
      return <ClaimConfirmation data={widgetData as any} onConfirm={onConfirmClaim} />;
    case "action_card":
      return <ActionCard data={widgetData as any} onAction={onAction} />;
    default:
      return null;
  }
}
