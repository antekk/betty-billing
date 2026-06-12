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

class TwilioSmsProvider implements SmsProvider {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error(
        "SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER"
      );
    }

    this.accountSid = accountSid;
    this.authToken = authToken;
    this.fromNumber = fromNumber;
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");

    const body = new URLSearchParams({
      To: phone,
      From: this.fromNumber,
      Body: `Your Betty verification code is ${code}. It expires in 5 minutes.`,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!res.ok) {
      // Twilio error bodies are JSON with `code` and `message`
      let detail = `HTTP ${res.status}`;
      try {
        const err = (await res.json()) as { code?: number; message?: string };
        if (err.message) detail = `${detail} — ${err.message} (code ${err.code ?? "unknown"})`;
      } catch {
        // Non-JSON error body — keep the status code
      }
      throw new Error(`Twilio SMS send failed: ${detail}`);
    }
  }
}

export function createSmsProvider(): SmsProvider {
  const provider = process.env.SMS_PROVIDER ?? "mock";

  switch (provider) {
    case "mock":
      return new MockSmsProvider();
    case "twilio":
      return new TwilioSmsProvider();
    default:
      throw new Error(`Unknown SMS provider: ${provider}`);
  }
}
