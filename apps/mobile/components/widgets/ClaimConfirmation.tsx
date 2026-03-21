import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";

import { Colors } from "../../constants/colors";

export interface ClaimConfirmationData {
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
    } catch (_error) {
      setIsConfirming(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{isConfirmed ? "Claim Submitted" : "Claim Ready to Submit"}</Text>

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
        <Text style={styles.fee}>${parseFloat(data.expectedFee).toFixed(2)}</Text>
      </View>

      {isConfirmed ? (
        <View style={styles.confirmedBadge}>
          <Text style={styles.confirmedText}>Confirmed</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.confirmButton}
          onPress={() => {
            void handleConfirm();
          }}
          disabled={isConfirming}
        >
          {isConfirming ? (
            <ActivityIndicator color={Colors.white} />
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
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.textSecondary,
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
    borderBottomColor: Colors.inputBackground,
  },
  label: {
    fontSize: 14,
    color: Colors.textTertiary,
    width: 80,
  },
  value: {
    fontSize: 15,
    fontWeight: "500",
    color: Colors.textPrimary,
    flex: 1,
    textAlign: "right",
  },
  description: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "right",
    marginTop: 2,
  },
  fee: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  confirmButton: {
    backgroundColor: Colors.successGreen,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  confirmButtonText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: "600",
  },
  confirmedBadge: {
    backgroundColor: Colors.successBackground,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  confirmedText: {
    color: Colors.successGreen,
    fontSize: 17,
    fontWeight: "600",
  },
});
