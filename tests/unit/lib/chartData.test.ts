import { describe, expect, it } from "vitest";
import { buildMerchantCashAdvance, buildSchedule, buildTermLoan } from "@/engine";
import { paymentBreakdown, timelineSeries } from "@/lib/chartData";

const fixed = buildSchedule({ principalCents: 1_000_000, aprPercent: 5, periods: 24, frequency: "monthly", startDate: "2026-01-15" });

describe("timelineSeries (REQ-FUNC-AN02: cumulative principal vs interest, balance over time)", () => {
  it("starts at the full balance with nothing paid and ends fully repaid", () => {
    const series = timelineSeries(fixed.rows);
    expect(series).toHaveLength(25);
    // Without a closing row the rows don't carry the start date; the chart's x-axis is the payment number.
    expect(series[0]).toEqual({ period: 0, date: null, principalPaid: 0, interestAndFeesPaid: 0, balance: 10_000 });
    expect(series.at(-1)).toEqual({
      period: 24,
      date: "2028-01-15",
      principalPaid: 10_000,
      interestAndFeesPaid: 529.15,
      balance: 0,
    });
  });

  it("accumulates principal and interest period by period", () => {
    const [, first, second] = timelineSeries(fixed.rows);
    expect(first).toMatchObject({ period: 1, principalPaid: 397.04, interestAndFeesPaid: 41.67, balance: 9_602.96 });
    // Period 2: interest 4,001.23¢ → $40.01, so $398.70 of principal.
    expect(second?.principalPaid).toBe(795.74);
  });

  it("uses the closing row as the starting point when fees are withheld", () => {
    const termLoan = buildTermLoan({
      principalCents: 10_000_000,
      aprPercent: 7.5,
      periods: 120,
      frequency: "monthly",
      startDate: "2026-01-15",
      fees: [{ label: "Origination", amount: { kind: "flat", amountCents: 350_000 } }],
    });
    const series = timelineSeries(termLoan.rows);
    expect(series).toHaveLength(121);
    expect(series[0]).toEqual({ period: 0, date: "2026-01-15", principalPaid: 0, interestAndFeesPaid: 3_500, balance: 100_000 });
  });

  it("downsamples long schedules but keeps the first and last points", () => {
    const mca = buildMerchantCashAdvance({
      advanceCents: 5_000_000,
      factorRate: 1.5,
      frequency: "daily",
      repayment: { kind: "fixedTerm", termMonths: 120 },
      startDate: "2026-01-15",
    });
    const series = timelineSeries(mca.rows, 120);
    expect(series.length).toBeLessThanOrEqual(121);
    expect(series[0]?.period).toBe(0);
    expect(series.at(-1)).toMatchObject({ period: 2_520, balance: 0, principalPaid: 50_000, interestAndFeesPaid: 25_000 });
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.period).toBeGreaterThan(series[i - 1]!.period);
    }
  });
});

describe("paymentBreakdown (REQ-FUNC-AN02: payment breakdown donut)", () => {
  it("splits total payments into principal and interest", () => {
    expect(paymentBreakdown(fixed.rows)).toEqual([
      { key: "principal", label: "Principal", cents: 1_000_000 },
      { key: "interest", label: "Interest", cents: 52_915 },
    ]);
  });

  it("shows a merchant cash advance's factor charge as fees, omitting zero interest", () => {
    const mca = buildMerchantCashAdvance({
      advanceCents: 5_000_000,
      factorRate: 1.25,
      frequency: "daily",
      repayment: { kind: "fixedTerm", termMonths: 6 },
      startDate: "2026-01-15",
    });
    expect(paymentBreakdown(mca.rows)).toEqual([
      { key: "principal", label: "Principal", cents: 5_000_000 },
      { key: "fees", label: "Fees", cents: 1_250_000 },
    ]);
  });
});
