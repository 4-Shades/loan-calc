import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildSchedule, buildTermLoan } from "@/engine";
import { AmortizationTable } from "@/components/results/AmortizationTable";

const loan = (periods: number) =>
  buildSchedule({ principalCents: 1_000_000, aprPercent: 5, periods, frequency: "monthly", startDate: "2026-01-15" }).rows;

afterEach(() => {
  vi.restoreAllMocks();
});

const bodyRows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
const status = () => screen.getByRole("status");

describe("AmortizationTable (REQ-FUNC-AN01)", () => {
  it("has the schedule columns, in CSV order", () => {
    render(<AmortizationTable rows={loan(24)} />);
    expect(screen.getByRole("table", { name: "Amortization schedule" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Period",
      "Date",
      "Payment",
      "Principal",
      "Interest",
      "Fees",
      "Remaining Balance",
    ]);
  });

  it("shows each row's figures with the period as the row header", () => {
    render(<AmortizationTable rows={loan(24)} />);
    const first = bodyRows()[0]!;
    expect(within(first).getByRole("rowheader")).toHaveTextContent("1");
    expect(within(first).getAllByRole("cell").map((td) => td.textContent)).toEqual([
      "2026-02-15",
      "$438.71",
      "$397.04",
      "$41.67",
      "$0.00",
      "$9,602.96",
    ]);
  });

  it("paginates 12 rows at a time", async () => {
    render(<AmortizationTable rows={loan(24)} />);
    expect(bodyRows()).toHaveLength(12);
    expect(status()).toHaveTextContent("Showing payments 1–12 of 24");
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(status()).toHaveTextContent("Showing payments 13–24 of 24");
    expect(within(bodyRows()[0]!).getByRole("rowheader")).toHaveTextContent("13");
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "First page" }));
    expect(status()).toHaveTextContent("Showing payments 1–12 of 24");
  });

  it("jumps to the last page", async () => {
    render(<AmortizationTable rows={loan(30)} />);
    await userEvent.click(screen.getByRole("button", { name: "Last page" }));
    expect(status()).toHaveTextContent("Showing payments 25–30 of 30");
    expect(within(bodyRows().at(-1)!).getAllByRole("cell").at(-1)).toHaveTextContent("$0.00");
  });

  it("changes the page size", async () => {
    render(<AmortizationTable rows={loan(60)} />);
    await userEvent.selectOptions(screen.getByLabelText("Rows per page"), "24");
    expect(bodyRows()).toHaveLength(24);
    expect(status()).toHaveTextContent("Showing payments 1–24 of 60");
  });

  it("virtualizes the full schedule instead of rendering every row", async () => {
    // jsdom has no layout; give the scroll area the size a browser would (TanStack reads clientHeight).
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(480);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
    render(<AmortizationTable rows={loan(360)} />);
    await userEvent.selectOptions(screen.getByLabelText("Rows per page"), "all");
    const table = screen.getByRole("table");
    expect(table).toHaveAttribute("aria-rowcount", "361");
    const rendered = bodyRows().filter((row) => row.getAttribute("aria-rowindex"));
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(100);
    expect(rendered[0]).toHaveAttribute("aria-rowindex", "2");
    expect(status()).toHaveTextContent("All 360 payments");
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
  });

  it("labels a fee closing row and leaves it out of the payment count", () => {
    const { rows } = buildTermLoan({
      principalCents: 10_000_000,
      aprPercent: 7.5,
      periods: 120,
      frequency: "monthly",
      startDate: "2026-01-15",
      fees: [{ label: "Origination", amount: { kind: "flat", amountCents: 350_000 } }],
    });
    render(<AmortizationTable rows={rows} />);
    expect(within(bodyRows()[0]!).getByRole("rowheader")).toHaveTextContent("Closing");
    expect(within(bodyRows()[0]!).getAllByRole("cell")[4]).toHaveTextContent("$3,500.00");
    expect(status()).toHaveTextContent("of 120");
  });

  it("stays on a valid page when the schedule shrinks", async () => {
    const { rerender } = render(<AmortizationTable rows={loan(36)} />);
    await userEvent.click(screen.getByRole("button", { name: "Last page" }));
    rerender(<AmortizationTable rows={loan(12)} />);
    expect(status()).toHaveTextContent("Showing payments 1–12 of 12");
  });
});
