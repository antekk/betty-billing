import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";

interface ClaimConfirmationData {
  claimId: string;
  patientName: string | null;
  phnLast4: string;
  feeCode: string;
  feeCodeDescription: string;
  modifier: string | null;
  serviceDate: string;
  serviceDateFormatted: string;
  expectedFee: string;
  status: string;
}

interface Props {
  data: ClaimConfirmationData;
  onConfirm: (claimId: string) => Promise<void>;
}

export function ClaimConfirmation({ data, onConfirm }: Props) {
  const [isConfirming, setIsConfirming] = useState(false);
  const isConfirmed = data.status !== "pending_confirmation";

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm(data.claimId);
    } catch (error) {
      setIsConfirming(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {isConfirmed ? "Claim Submitted" : "Claim Ready to Submit"}
      </Text>

      <View style={styles.row}>
        <Text style={styles.label}>Patient</Text>
        <Text style={styles.value}>
          {data.patientName
            ? `${data.patientName} (PHN ...${data.phnLast4})`
            : `PHN ...${data.phnLast4}`}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Service</Text>
        <View>
          <Text style={styles.value}>{data.feeCode}</Text>
          <Text style={styles.description}>{data.feeCodeDescription}</Text>
        </View>
      </View>

      {data.modifier && (
        <View style={styles.row}>
          <Text style={styles.label}>Modifier</Text>
          <Text style={styles.value}>{data.modifier}</Text>
        </View>
      )}

      <View style={styles.row}>
        <Text style={styles.label}>Date</Text>
        <Text style={styles.value}>{data.serviceDateFormatted}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Expected</Text>
        <Text style={styles.fee}>
          ${parseFloat(data.expectedFee).toFixed(2)}
        </Text>
      </View>

      {isConfirmed ? (
        <View style={styles.confirmedBadge}>
          <Text style={styles.confirmedText}>Confirmed</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.confirmButton}
          onPress={handleConfirm}
          disabled={isConfirming}
        >
          {isConfirming ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.confirmButtonText}>Confirm</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F5F5",
  },
  label: {
    fontSize: 14,
    color: "#999",
    width: 80,
  },
  value: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1A1A1A",
    flex: 1,
    textAlign: "right",
  },
  description: {
    fontSize: 13,
    color: "#666",
    textAlign: "right",
    marginTop: 2,
  },
  fee: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  confirmButton: {
    backgroundColor: "#34C759",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  confirmButtonText: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "600",
  },
  confirmedBadge: {
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  confirmedText: {
    color: "#34C759",
    fontSize: 17,
    fontWeight: "600",
  },
});
