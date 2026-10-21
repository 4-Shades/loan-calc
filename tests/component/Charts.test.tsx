import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { buildSchedule } from "@/engine";
import { BalanceChart } from "@/components/results/BalanceChart";
import { BreakdownChart } from "@/components/results/BreakdownChart";

// jsdom has no layout: a 100%-wide ResponsiveContainer measures 0 unless elements report a size.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ width: 600, height: 260 }));
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(260);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const { rows } = buildSchedule({ principalCents: 1_000_000, aprPercent: 5, periods: 24, frequency: "monthly", startDate: "2026-01-15" });

describe("BalanceChart (REQ-FUNC-AN02)", () => {
  it("renders a labelled line chart with a legend for its three series", () => {
    render(<BalanceChart rows={rows} />);
    const figure = screen.getByRole("figure", { name: "Balance and payments over time" });
    expect(figure.querySelector("svg")).not.toBeNull();
    const legend = within(figure).getByRole("list", { name: "Legend" });
    expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Principal paid",
      "Interest & fees paid",
      "Remaining balance",
    ]);
  });

  it("describes the end state in text so the chart is not the only way to read it", () => {
    render(<BalanceChart rows={rows} />);
    expect(screen.getByRole("figure", { name: "Balance and payments over time" })).toHaveAccessibleDescription(
      "After 24 payments: $10,000.00 principal paid, $529.15 interest and fees paid, $0.00 remaining.",
    );
  });
});

describe("BreakdownChart (REQ-FUNC-AN02)", () => {
  it("renders a donut with each segment's value and share in the legend", () => {
    render(<BreakdownChart rows={rows} />);
    const figure = screen.getByRole("figure", { name: "Payment breakdown" });
    expect(figure.querySelector("svg")).not.toBeNull();
    const legend = within(figure).getByRole("list", { name: "Legend" });
    expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Principal$10,000.0095.0%",
      "Interest$529.155.0%",
    ]);
  });

  it("shows the total paid in the centre", () => {
    render(<BreakdownChart rows={rows} />);
    expect(within(screen.getByRole("figure", { name: "Payment breakdown" })).getByText("$10,529.15")).toBeInTheDocument();
  });
});
