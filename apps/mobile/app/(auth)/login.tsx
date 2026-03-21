import { router } from "expo-router";
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

export default function LoginScreen() {
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { requestOtp } = useAuth();

  const handleSendCode = async () => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length !== 10) {
      Alert.alert("Invalid phone number", "Please enter a 10-digit phone number.");
      return;
    }

    const fullPhone = `+1${cleaned}`;
    setIsLoading(true);

    try {
      await requestOtp(fullPhone);
      router.push({
        pathname: "/(auth)/verify",
        params: { phone: fullPhone },
      });
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to send code");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Betty</Text>
        <Text style={styles.subtitle}>Your billing assistant</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Phone Number</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.prefix}>+1</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="(403) 555-0123"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="phone-pad"
              autoFocus
              maxLength={14}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={() => {
              void handleSendCode();
            }}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>{isLoading ? "Sending..." : "Send Code"}</Text>
          </TouchableOpacity>
        </View>
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
  title: {
    fontSize: 40,
    fontWeight: "700",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 17,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 48,
  },
  form: {
    gap: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: "500",
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  prefix: {
    fontSize: 17,
    color: Colors.textTertiary,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 17,
    paddingVertical: 14,
    color: Colors.textPrimary,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
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
