export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}

/**
 * Development helper: prints the code instead of sending an SMS.
 * createSmsProvider refuses to build this in production unless the deployment
 * explicitly opts in — logged login codes are readable by anyone with log
 * access.
 */
class MockSmsProvider implements SmsProvider {
  sendOtp(phone: string, code: string): Promise<void> {
    console.log(`\n========================================`);
    console.log(`  OTP for ${phone}: ${code}`);
    console.log(`========================================\n`);
    return Promise.resolve();
  }
}

class TwilioSmsProvider implements SmsProvider {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string
  ) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: phone,
          From: this.fromNumber,
          Body: `Your Betty login code is ${code}. It expires in 5 minutes.`,
        }),
      }
    );
    if (!res.ok) {
      // Never include the response body in the error — it echoes the request.
      throw new Error(`Twilio send failed with status ${res.status}`);
    }
  }
}

export function createSmsProvider(): SmsProvider {
  const provider = process.env.SMS_PROVIDER ?? "mock";

  switch (provider) {
    case "mock":
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_SMS !== "true") {
        throw new Error(
          "SMS_PROVIDER=mock is not allowed in production: it writes login codes to logs. " +
            "Configure the twilio provider, or set ALLOW_MOCK_SMS=true for a demo environment."
        );
      }
      return new MockSmsProvider();
    case "twilio": {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;
      if (!accountSid || !authToken || !fromNumber) {
        throw new Error(
          "SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER"
        );
      }
      return new TwilioSmsProvider(accountSid, authToken, fromNumber);
    }
    default:
      throw new Error(`Unknown SMS provider: ${provider}`);
  }
}
