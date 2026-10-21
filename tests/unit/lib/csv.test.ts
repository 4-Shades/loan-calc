import { describe, expect, it } from "vitest";
import { buildSchedule, buildTermLoan } from "@/engine";
import { CSV_FILENAME, CSV_HEADER, escapeCsvCell, scheduleToCsv } from "@/lib/csv";

const { rows } = buildSchedule({ principalCents: 1_000_000, aprPercent: 5, periods: 36, frequency: "monthly", startDate: "2026-01-15" });

describe("scheduleToCsv (REQ-FUNC-DB03)", () => {
  const lines = scheduleToCsv(rows).split("\r\n");

  it("starts with the header row from the BDD scenario", () => {
    expect(CSV_HEADER.join(",")).toBe("Period,Date,Payment,Principal,Interest,Fees,Remaining Balance");
    expect(lines[0]).toBe("Period,Date,Payment,Principal,Interest,Fees,Remaining Balance");
    expect(CSV_FILENAME).toBe("loan-amortization-schedule.csv");
  });

  it("writes one line per period, with plain decimal amounts spreadsheets can parse", () => {
    expect(lines).toHaveLength(1 + 36 + 1); // header, rows, trailing CRLF
    expect(lines[1]).toBe(`1,2026-02-15,${(rows[0]!.paymentCents / 100).toFixed(2)},${(rows[0]!.principalCents / 100).toFixed(2)},41.67,0.00,${(rows[0]!.balanceCents / 100).toFixed(2)}`);
    expect(lines[36]).toMatch(/^36,2029-01-15,.*,0\.00$/);
    expect(lines.at(-1)).toBe("");
  });

  it("includes a fee closing row as period 0", () => {
    const termLoan = buildTermLoan({
      principalCents: 10_000_000,
      aprPercent: 7.5,
      periods: 120,
      frequency: "monthly",
      startDate: "2026-01-15",
      fees: [{ label: "Origination", amount: { kind: "flat", amountCents: 350_000 } }],
    });
    expect(scheduleToCsv(termLoan.rows).split("\r\n")[1]).toBe("0,2026-01-15,3500.00,0.00,0.00,3500.00,100000.00");
  });
});

describe("escapeCsvCell", () => {
  it.each([
    [42, "42"],
    ["plain", "plain"],
    ["a,b", '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ["line\nbreak", '"line\nbreak"'],
  ])("%j → %j", (value, expected) => {
    expect(escapeCsvCell(value)).toBe(expected);
  });

  it.each(["=SUM(A1)", "+1", "-cmd", "@import", "\tx"])("neutralizes spreadsheet formula %j", (value) => {
    expect(escapeCsvCell(value).replace(/^"/, "")).toMatch(/^'/);
  });
});
