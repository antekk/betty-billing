import { useEffect, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { InputBar } from "../components/chat/InputBar";
import { Timeline } from "../components/chat/Timeline";
import { Colors } from "../constants/colors";
import { useChat } from "../services/chat";

export default function ChatScreen() {
  const { entries, isStreaming, streamingText, loadTimeline, sendMessage, confirmClaim } =
    useChat();

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  const handleSend = useCallback(
    async (message: string) => {
      try {
        await sendMessage(message);
      } catch (error) {
        console.error("Failed to send message:", error);
      }
    },
    [sendMessage]
  );

  const handleLoadMore = useCallback(() => {
    if (entries.length > 0) {
      void loadTimeline(entries[0].createdAt);
    }
  }, [entries, loadTimeline]);

  const handleWidgetAction = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      if (action === "send_message" && payload?.message) {
        void sendMessage(payload.message as string);
      }
      // Other actions can be handled here
    },
    [sendMessage]
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.avatar}>
            <View style={styles.avatarDot} />
          </View>
          <Text style={styles.headerName}>Betty</Text>
        </View>
      </View>

      <Timeline
        entries={entries}
        isStreaming={isStreaming}
        streamingText={streamingText}
        onLoadMore={handleLoadMore}
        onConfirmClaim={confirmClaim}
        onWidgetAction={handleWidgetAction}
      />

      <InputBar
        onSend={(text) => {
          void handleSend(text);
        }}
        disabled={isStreaming}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  avatarDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.white,
  },
  headerName: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
});
