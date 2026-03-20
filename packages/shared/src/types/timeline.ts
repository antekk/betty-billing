import type { TimelineEntryType, Direction, Visibility, WidgetType } from "../constants";
import type { ClaimConfirmationData, ActionCardData } from "./claim";

export type WidgetData = ClaimConfirmationData | ActionCardData;

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
