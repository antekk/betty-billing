import type { TimelineEntryType, Direction, Visibility, WidgetType } from "../constants";
import type {
  ClaimConfirmationData,
  ClaimUpdateConfirmationData,
  ActionCardData,
} from "./claim";

export type WidgetData = ClaimConfirmationData | ClaimUpdateConfirmationData | ActionCardData;

export interface TimelineEntry {
  id: string;
  userId: string;
  type: TimelineEntryType;
  direction: Direction;
  content: string | null;
  widgetType: WidgetType | null;
  widgetData: WidgetData | null;
  visibility: Visibility;
  importanceFlag: boolean;
  createdAt: Date;
}
