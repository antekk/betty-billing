import { createLogger } from "@/lib/logger";

const log = createLogger({ module: "sms" });

export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}

class MockSmsProvider implements SmsProvider {
  sendOtp(phone: string, code: string): Promise<void> {
    log.debug({ phone, code }, "Mock OTP sent");
    return Promise.resolve();
  }
}

export function createSmsProvider(): SmsProvider {
  const provider = process.env.SMS_PROVIDER ?? "mock";

  switch (provider) {
    case "mock":
      return new MockSmsProvider();
    case "twilio":
      throw new Error("Twilio provider not implemented yet");
    default:
      throw new Error(`Unknown SMS provider: ${provider}`);
  }
}
