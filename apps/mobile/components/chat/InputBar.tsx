import { useState, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

import { Colors } from "../../constants/colors";

interface Props {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setText("");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.container}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={disabled ? "Betty is typing..." : "Message Betty..."}
          placeholderTextColor={Colors.textTertiary}
          multiline
          maxLength={5000}
          editable={!disabled}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          submitBehavior="newline"
        />
        <TouchableOpacity
          style={[styles.sendButton, (!text.trim() || disabled) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || disabled}
        >
          <SendIcon color={text.trim() && !disabled ? Colors.primary : Colors.disabled} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function SendIcon({ color }: { color: string }) {
  // Simple arrow-up icon using text (could be replaced with a proper icon library)
  return (
    <View style={[styles.sendIcon, { backgroundColor: color }]}>
      <View style={styles.arrow} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.white,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    backgroundColor: Colors.inputBackground,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  sendButton: {
    marginLeft: 8,
    marginBottom: 2,
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 8,
    borderLeftColor: Colors.transparent,
    borderRightColor: Colors.transparent,
    borderBottomColor: Colors.white,
    marginTop: -2,
  },
});
