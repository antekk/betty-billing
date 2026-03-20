import { useEffect, useCallback } from "react";
import { View, Text, StyleSheet, SafeAreaView } from "react-native";
import { Timeline } from "../components/chat/Timeline";
import { InputBar } from "../components/chat/InputBar";
import { useChat } from "../services/chat";

export default function ChatScreen() {
  const {
    entries,
    isStreaming,
    streamingText,
    loadTimeline,
    sendMessage,
    confirmClaim,
  } = useChat();

  useEffect(() => {
    loadTimeline();
  }, []);

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
      loadTimeline(entries[0].createdAt);
    }
  }, [entries, loadTimeline]);

  const handleWidgetAction = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      if (action === "send_message" && payload?.message) {
        sendMessage(payload.message as string);
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

      <InputBar onSend={handleSend} disabled={isStreaming} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  avatarDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#FFF",
  },
  headerName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1A1A1A",
  },
});
