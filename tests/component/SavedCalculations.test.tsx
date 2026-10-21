import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedCalculations } from "@/components/saved/SavedCalculations";

function saved(title: string, monthly: number, interest: number, apr: number) {
  return {
    id: `${title.toLowerCase().replace(/ /g, "-")}`,
    title,
    loanType: "TERM_SBA",
    createdAt: "2026-10-21T08:00:00.000Z",
    summary: {
      category: "BUSINESS",
      loanAmountCents: 10_000_000,
      regularPaymentCents: monthly,
      monthlyPaymentCents: monthly,
      totalInterestCents: interest,
      totalFeesCents: 0,
      totalPaidCents: 10_000_000 + interest,
      periods: 36,
      effectiveAprPercent: apr,
    },
  };
}

// The BDD comparison-matrix fixtures, plus one more to exercise the 3-item cap.
const ITEMS = [
  saved("Bank Term Loan", 309_664, 1_147_904, 7.2),
  saved("MCA Option", 416_666, 2_499_980, 42.5),
  saved("Equipment Lease", 235_367, 1_297_616, 6.1),
  saved("Credit Union", 300_000, 1_200_000, 6.9),
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation(async () => Response.json({ items: ITEMS, limit: 20, offset: 0 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const checkbox = (title: string) => screen.getByRole("checkbox", { name: new RegExp(title) });
const compareButton = () => screen.getByRole("button", { name: /Comparison Matrix/ });

async function openMatrix(titles: string[]) {
  render(<SavedCalculations refreshKey={0} />);
  for (const title of titles) await userEvent.click(await screen.findByRole("checkbox", { name: new RegExp(title) }));
  await userEvent.click(compareButton());
  return screen.getByRole("dialog", { name: "Comparison Matrix" });
}

describe("SavedCalculations (REQ-FUNC-DB02)", () => {
  it("lists saved calculations from the API, newest first", async () => {
    render(<SavedCalculations refreshKey={0} />);
    expect(await screen.findByRole("checkbox", { name: /Bank Term Loan/ })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledWith("/api/calculations?limit=20", expect.anything());
  });

  it("reloads when a new calculation is saved", async () => {
    const { rerender } = render(<SavedCalculations refreshKey={0} />);
    await screen.findByRole("checkbox", { name: /Bank Term Loan/ });
    rerender(<SavedCalculations refreshKey={1} />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("says so when nothing has been saved", async () => {
    fetchMock.mockImplementation(async () => Response.json({ items: [], limit: 20, offset: 0 }));
    render(<SavedCalculations refreshKey={0} />);
    expect(await screen.findByText("No saved calculations yet.")).toBeInTheDocument();
  });

  it("reports when the list can't be loaded", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SavedCalculations refreshKey={0} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load saved calculations.");
  });

  it("allows comparing two or three calculations, no more", async () => {
    render(<SavedCalculations refreshKey={0} />);
    await screen.findByRole("checkbox", { name: /Bank Term Loan/ });
    expect(compareButton()).toBeDisabled();

    await userEvent.click(checkbox("Bank Term Loan"));
    expect(compareButton()).toBeDisabled();
    await userEvent.click(checkbox("MCA Option"));
    expect(compareButton()).toBeEnabled();
    await userEvent.click(checkbox("Equipment Lease"));
    expect(compareButton()).toHaveAccessibleName("Open Comparison Matrix (3)");

    expect(checkbox("Credit Union")).toBeDisabled();
    expect(screen.getByText("You can compare up to 3 calculations.")).toBeInTheDocument();
  });

  it("shows the selected calculations side by side in a modal", async () => {
    const dialog = await openMatrix(["Bank Term Loan", "MCA Option", "Equipment Lease"]);
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const headers = within(dialog).getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Metric", "Bank Term Loan", "MCA Option", "Equipment Lease"]);
  });

  it("highlights the lowest total interest in green and the lowest monthly payment in blue", async () => {
    const dialog = await openMatrix(["Bank Term Loan", "MCA Option", "Equipment Lease"]);
    const cell = (metric: string, column: number) =>
      within(within(dialog).getByRole("row", { name: new RegExp(`^${metric}`) })).getAllByRole("cell")[column]!;

    const cheapest = cell("Total interest & fees", 0);
    expect(cheapest).toHaveAttribute("data-highlight", "lowest-cost");
    expect(cheapest.className).toMatch(/green/);
    expect(cheapest).toHaveTextContent("$11,479.04Lowest cost");

    const lowestPayment = cell("Monthly payment", 2);
    expect(lowestPayment).toHaveAttribute("data-highlight", "lowest-payment");
    expect(lowestPayment.className).toMatch(/blue/);
    expect(lowestPayment).toHaveTextContent("$2,353.67Lowest payment");

    expect(cell("Monthly payment", 0)).not.toHaveAttribute("data-highlight");
  });

  it("closes with Escape or the close button and returns focus to the trigger", async () => {
    await openMatrix(["Bank Term Loan", "MCA Option"]);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(compareButton()).toHaveFocus();

    await userEvent.click(compareButton());
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("SavedCalculations column order", () => {
  it("shows columns in the order the calculations were selected", async () => {
    const dialog = await openMatrix(["Equipment Lease", "Bank Term Loan"]);
    expect(within(dialog).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Metric",
      "Equipment Lease",
      "Bank Term Loan",
    ]);
  });
});
