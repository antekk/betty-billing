/**
 * Alberta-local date helpers. Physicians bill in Alberta civil time; the
 * server (Docker/Cloud Run) runs in UTC, so every "what day is it" and every
 * ISO-date render must go through an explicit timezone instead of the
 * process-local one — otherwise evening claims get tomorrow's service date
 * and confirmation widgets show the wrong day.
 */

const ALBERTA_TZ = "America/Edmonton";

/** Today's civil date in Alberta as YYYY-MM-DD (en-CA renders ISO order). */
export function todayInAlberta(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: ALBERTA_TZ });
}

/** Civil date (YYYY-MM-DD) of an instant, in Alberta. */
export function isoDateInAlberta(instant: Date): string {
  return instant.toLocaleDateString("en-CA", { timeZone: ALBERTA_TZ });
}

/** Alberta's current UTC offset in minutes (handles MST/MDT). */
export function albertaUtcOffsetMinutes(now: Date = new Date()): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: ALBERTA_TZ,
    timeZoneName: "shortOffset",
  })
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = label ? /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(label) : null;
  if (!match) return -420; // MST fallback
  const sign = match[1] === "-" ? -1 : 1;
  // The minutes group is optional, so it can be undefined at runtime.
  const minutes = (match as (string | undefined)[])[3];
  return sign * (Number(match[2]) * 60 + Number(minutes ?? "0"));
}

const DEFAULT_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "short",
  day: "numeric",
};

/**
 * Format an ISO civil date (YYYY-MM-DD) for display. Anchored at noon UTC and
 * rendered in UTC so the calendar day never shifts, whatever the server TZ.
 */
export function formatIsoDate(
  isoDate: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_FORMAT
): string {
  const instant = new Date(`${isoDate}T12:00:00Z`);
  if (isNaN(instant.getTime())) return isoDate;
  return instant.toLocaleDateString("en-CA", { ...options, timeZone: "UTC" });
}

/** Whole days between two ISO civil dates (a minus b). */
export function daysBetweenIso(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}
