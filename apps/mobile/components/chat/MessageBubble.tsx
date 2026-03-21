import { View, Text, StyleSheet } from "react-native";

import { Colors } from "../../constants/colors";

import type { TimelineEntry } from "../../services/chat";

interface Props {
  entry: TimelineEntry;
}

export function MessageBubble({ entry }: Props) {
  const isInbound = entry.direction === "inbound";
  const isSystem = entry.direction === "system";

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={styles.systemText}>{entry.content}</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, isInbound ? styles.inboundContainer : styles.outboundContainer]}
    >
      <View style={[styles.bubble, isInbound ? styles.inboundBubble : styles.outboundBubble]}>
        <Text style={[styles.text, isInbound ? styles.inboundText : styles.outboundText]}>
          {entry.content}
        </Text>
      </View>
    </View>
  );
}

export function StreamingBubble({ text }: { text: string }) {
  return (
    <View style={styles.outboundContainer}>
      <View style={[styles.bubble, styles.outboundBubble]}>
        <Text style={styles.outboundText}>{text}</Text>
        <View style={styles.cursor} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 16,
  },
  inboundContainer: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  outboundContainer: {
    alignItems: "flex-start",
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  inboundBubble: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  outboundBubble: {
    backgroundColor: Colors.bubbleAssistant,
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  inboundText: {
    color: Colors.white,
  },
  outboundText: {
    color: Colors.textPrimary,
  },
  systemContainer: {
    alignItems: "center",
    paddingHorizontal: 32,
    marginVertical: 8,
  },
  systemText: {
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: "center",
    fontStyle: "italic",
  },
  cursor: {
    width: 2,
    height: 16,
    backgroundColor: Colors.textTertiary,
    marginLeft: 2,
    opacity: 0.6,
  },
});
