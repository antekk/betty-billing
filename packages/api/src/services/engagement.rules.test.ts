import { describe, expect, test } from "bun:test";

import { isReminderDue, getReminderThresholdDays } from "./engagement.rules";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-06-12T17:00:00Z");

describe("isReminderDue", () => {
  test("not due when the last claim is recent", () => {
    const lastClaim = new Date(now.getTime() - 2 * DAY);
    expect(isReminderDue(lastClaim, null, now, 7)).toBe(false);
  });

  test("due when the gap exceeds the threshold and no reminder was sent", () => {
    const lastClaim = new Date(now.getTime() - 10 * DAY);
    expect(isReminderDue(lastClaim, null, now, 7)).toBe(true);
  });

  test("not due again for the same gap (respects silence)", () => {
    const lastClaim = new Date(now.getTime() - 10 * DAY);
    const reminded = new Date(now.getTime() - 3 * DAY); // after the last claim
    expect(isReminderDue(lastClaim, reminded, now, 7)).toBe(false);
  });

  test("due again after the physician billed since the last reminder", () => {
    const lastClaim = new Date(now.getTime() - 8 * DAY);
    const reminded = new Date(now.getTime() - 20 * DAY); // before the last claim
    expect(isReminderDue(lastClaim, reminded, now, 7)).toBe(true);
  });

  test("boundary: exactly at the threshold counts as due", () => {
    const lastClaim = new Date(now.getTime() - 7 * DAY);
    expect(isReminderDue(lastClaim, null, now, 7)).toBe(true);
  });

  test("respects a custom threshold", () => {
    const lastClaim = new Date(now.getTime() - 10 * DAY);
    expect(isReminderDue(lastClaim, null, now, 14)).toBe(false);
    expect(isReminderDue(lastClaim, null, now, 3)).toBe(true);
  });
});

describe("getReminderThresholdDays", () => {
  test("defaults to 7", () => {
    delete process.env.BILLING_REMINDER_DAYS;
    expect(getReminderThresholdDays()).toBe(7);
  });

  test("reads BILLING_REMINDER_DAYS", () => {
    process.env.BILLING_REMINDER_DAYS = "14";
    expect(getReminderThresholdDays()).toBe(14);
    delete process.env.BILLING_REMINDER_DAYS;
  });

  test("falls back to default on invalid values", () => {
    process.env.BILLING_REMINDER_DAYS = "-3";
    expect(getReminderThresholdDays()).toBe(7);
    process.env.BILLING_REMINDER_DAYS = "abc";
    expect(getReminderThresholdDays()).toBe(7);
    delete process.env.BILLING_REMINDER_DAYS;
  });
});
