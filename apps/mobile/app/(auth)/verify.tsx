import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

import { Colors } from "../../constants/colors";
import { useAuth } from "../../services/auth";

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { verifyOtp } = useAuth();

  const handleVerify = async () => {
    if (code.length !== 6) {
      Alert.alert("Invalid code", "Please enter the 6-digit code.");
      return;
    }

    setIsLoading(true);

    try {
      await verifyOtp(phone, code);
      router.replace("/");
    } catch (error) {
      Alert.alert("Invalid code", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const maskedPhone = phone ? `(${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}` : "";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Enter Code</Text>
        <Text style={styles.subtitle}>Sent to {maskedPhone}</Text>

        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={setCode}
          placeholder="000000"
          placeholderTextColor={Colors.disabled}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          textAlign="center"
        />

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={() => {
            void handleVerify();
          }}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>{isLoading ? "Verifying..." : "Verify"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  backButton: {
    position: "absolute",
    top: 60,
    left: 20,
  },
  backText: {
    fontSize: 17,
    color: Colors.primary,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 17,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 32,
  },
  codeInput: {
    fontSize: 32,
    fontWeight: "600",
    letterSpacing: 12,
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
    color: Colors.textPrimary,
    marginBottom: 24,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: "600",
  },
});
