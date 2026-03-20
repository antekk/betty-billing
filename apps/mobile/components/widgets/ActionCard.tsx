import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface ActionCardData {
  title: string;
  body: string;
  claimId?: string;
  actions: Array<{
    label: string;
    action: string;
    payload?: Record<string, unknown>;
  }>;
}

interface Props {
  data: ActionCardData;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
}

export function ActionCard({ data, onAction }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.alertDot} />
        <Text style={styles.title}>{data.title}</Text>
      </View>

      <Text style={styles.body}>{data.body}</Text>

      <View style={styles.actions}>
        {data.actions.map((action, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.actionButton, i === 0 ? styles.primaryAction : styles.secondaryAction]}
            onPress={() => onAction(action.action, action.payload)}
          >
            <Text
              style={[
                styles.actionText,
                i === 0 ? styles.primaryActionText : styles.secondaryActionText,
              ]}
            >
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FFD4D4",
    borderLeftWidth: 4,
    borderLeftColor: "#FF3B30",
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF3B30",
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  body: {
    fontSize: 15,
    color: "#666",
    lineHeight: 20,
    marginBottom: 16,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryAction: {
    backgroundColor: "#007AFF",
  },
  secondaryAction: {
    backgroundColor: "#F0F0F0",
  },
  actionText: {
    fontSize: 15,
    fontWeight: "500",
  },
  primaryActionText: {
    color: "#FFF",
  },
  secondaryActionText: {
    color: "#007AFF",
  },
});
