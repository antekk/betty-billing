export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}

class MockSmsProvider implements SmsProvider {
  sendOtp(phone: string, code: string): Promise<void> {
    console.log(`\n========================================`);
    console.log(`  OTP for ${phone}: ${code}`);
    console.log(`========================================\n`);
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
