import { useRef, useCallback } from "react";
import { FlatList, StyleSheet } from "react-native";

import { MessageBubble, StreamingBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { Colors } from "../../constants/colors";
import { WidgetRenderer } from "../widgets/WidgetRenderer";

import type { TimelineEntry } from "../../services/chat";

interface Props {
  entries: TimelineEntry[];
  isStreaming: boolean;
  streamingText: string;
  onLoadMore: () => void;
  onConfirmClaim: (claimId: string) => Promise<void>;
  onWidgetAction: (action: string, payload?: Record<string, unknown>) => void;
}

export function Timeline({
  entries,
  isStreaming,
  streamingText,
  onLoadMore: _onLoadMore,
  onConfirmClaim,
  onWidgetAction,
}: Props) {
  const flatListRef = useRef<FlatList>(null);

  const renderItem = useCallback(
    ({ item }: { item: TimelineEntry }) => {
      if (item.type === "widget" && item.widgetType && item.widgetData) {
        return (
          <WidgetRenderer
            widgetType={item.widgetType}
            widgetData={item.widgetData}
            onConfirmClaim={onConfirmClaim}
            onAction={onWidgetAction}
          />
        );
      }

      if (item.type === "message" || item.type === "system_event") {
        return <MessageBubble entry={item} />;
      }

      return null;
    },
    [onConfirmClaim, onWidgetAction]
  );

  const renderFooter = useCallback(() => {
    if (!isStreaming) return null;

    if (streamingText) {
      return <StreamingBubble text={streamingText} />;
    }

    return <TypingIndicator />;
  }, [isStreaming, streamingText]);

  return (
    <FlatList
      ref={flatListRef}
      data={entries}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      style={styles.list}
      contentContainerStyle={styles.content}
      ListFooterComponent={renderFooter}
      onEndReached={() => {
        // For inverted lists this would be onStartReached
        // Since we're not inverted, handle scroll-to-top for load more
      }}
      onContentSizeChange={() => {
        // Auto-scroll to bottom on new content
        flatListRef.current?.scrollToEnd({ animated: true });
      }}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    paddingVertical: 16,
  },
});
