import { afterEach, describe, expect, test } from "bun:test";

import { createSmsProvider } from "./sms";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env.SMS_PROVIDER = ORIGINAL_ENV.SMS_PROVIDER;
  process.env.TWILIO_ACCOUNT_SID = ORIGINAL_ENV.TWILIO_ACCOUNT_SID;
  process.env.TWILIO_AUTH_TOKEN = ORIGINAL_ENV.TWILIO_AUTH_TOKEN;
  process.env.TWILIO_PHONE_NUMBER = ORIGINAL_ENV.TWILIO_PHONE_NUMBER;
});

describe("createSmsProvider", () => {
  test("defaults to the mock provider", () => {
    delete process.env.SMS_PROVIDER;
    expect(() => createSmsProvider()).not.toThrow();
  });

  test("throws on unknown provider", () => {
    process.env.SMS_PROVIDER = "carrier-pigeon";
    expect(() => createSmsProvider()).toThrow("Unknown SMS provider");
  });

  test("twilio requires credentials", () => {
    process.env.SMS_PROVIDER = "twilio";
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE_NUMBER;
    expect(() => createSmsProvider()).toThrow("requires TWILIO_ACCOUNT_SID");
  });

  test("twilio provider constructs with full credentials", () => {
    process.env.SMS_PROVIDER = "twilio";
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_PHONE_NUMBER = "+15875550100";
    expect(() => createSmsProvider()).not.toThrow();
  });

  test("twilio sendOtp surfaces API errors with detail", async () => {
    process.env.SMS_PROVIDER = "twilio";
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_PHONE_NUMBER = "+15875550100";
    const provider = createSmsProvider();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: 21211, message: "Invalid 'To' phone number" }), {
        status: 400,
      })) as unknown as typeof fetch;

    try {
      expect(provider.sendOtp("+1000", "123456")).rejects.toThrow("Invalid 'To' phone number");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("twilio sendOtp sends the expected request", async () => {
    process.env.SMS_PROVIDER = "twilio";
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_PHONE_NUMBER = "+15875550100";
    const provider = createSmsProvider();

    const calls: { url: string; init: RequestInit }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: url.toString(), init: init ?? {} });
      return new Response(JSON.stringify({ sid: "SMxxx" }), { status: 201 });
    }) as unknown as typeof fetch;

    try {
      await provider.sendOtp("+15875550123", "654321");
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls.length).toBe(1);
    const req = calls[0];
    expect(req.url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json");
    const headers = req.init.headers as Record<string, string>;
    expect(headers.Authorization).toStartWith("Basic ");
    const body = req.init.body as URLSearchParams;
    expect(body.get("To")).toBe("+15875550123");
    expect(body.get("From")).toBe("+15875550100");
    expect(body.get("Body")).toContain("654321");
  });
});
