import type { PaymentFrequency } from "./payment";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function parseIsoDate(iso: string): { year: number; monthIndex: number; day: number } {
  const match = ISO_DATE.exec(iso);
  if (!match) {
    throw new RangeError(`Expected a YYYY-MM-DD date, got "${iso}"`);
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > daysInMonth(year, monthIndex)) {
    throw new RangeError(`"${iso}" is not a valid calendar date`);
  }
  return { year, monthIndex, day };
}

/** Throws a RangeError unless `iso` is a real calendar date in YYYY-MM-DD form. */
export function assertIsoDate(iso: string): void {
  parseIsoDate(iso);
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Due date of payment number `period` for a loan originated on `startDate`.
 * Monthly and annual schedules keep the origination day, clamped to the end of
 * shorter months (Jan 31 → Feb 28 → Mar 31). Pure: no dependence on "today".
 */
export function paymentDate(startDate: string, frequency: PaymentFrequency, period: number): string {
  const { year, monthIndex, day } = parseIsoDate(startDate);

  if (frequency === "weekly" || frequency === "biweekly") {
    const days = (frequency === "weekly" ? 7 : 14) * period;
    return formatIsoDate(new Date(Date.UTC(year, monthIndex, day + days)));
  }

  const monthsAhead = (frequency === "monthly" ? 1 : 12) * period;
  const targetYear = year + Math.floor((monthIndex + monthsAhead) / 12);
  const targetMonth = (monthIndex + monthsAhead) % 12;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return formatIsoDate(new Date(Date.UTC(targetYear, targetMonth, targetDay)));
}
