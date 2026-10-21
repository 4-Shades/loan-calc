import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Calculator } from "@/components/calculator/Calculator";
import { calculateLoan } from "@/lib/calculateLoan";
import { LOAN_TYPES, LOAN_TYPE_LABELS, categoryOf, loanInputSchema } from "@/schemas/loanInput";

// Spy on the dispatcher so tests can prove invalid input never reaches the engine.
vi.mock("@/lib/calculateLoan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calculateLoan")>();
  return { ...actual, calculateLoan: vi.fn(actual.calculateLoan) };
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-15T12:00:00"));
  vi.mocked(calculateLoan).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

const results = () => screen.getByRole("region", { name: "Results" });

async function replace(label: string | RegExp, value: string) {
  const input = screen.getByLabelText(label);
  await userEvent.clear(input);
  if (value) await userEvent.type(input, value);
}

describe("Calculator form (REQ-UI-003, REQ-NFR-CODE2)", () => {
  it("starts in Personal mode with a fixed-rate loan and shows its result", () => {
    render(<Calculator />);
    expect(screen.getByRole("radio", { name: "Personal Loan" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Loan type")).toHaveValue("FIXED_INSTALLMENT");
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-01-15");
    expect(within(results()).getByText("$438.71")).toBeInTheDocument();
    expect(within(results()).getByText("$529.15")).toBeInTheDocument();
    expect(within(results()).getByText("24")).toBeInTheDocument();
  });

  it("offers only personal loan types in Personal mode and business types in Business mode", async () => {
    render(<Calculator />);
    const personalOptions = within(screen.getByLabelText("Loan type")).getAllByRole("option").map((o) => o.textContent);
    expect(personalOptions).toEqual(["Fixed-Rate Installment Loan", "Interest-Only Loan with Balloon", "Revolving Line of Credit"]);

    await userEvent.click(screen.getByRole("radio", { name: "Business Loan" }));
    const businessOptions = within(screen.getByLabelText("Loan type")).getAllByRole("option").map((o) => o.textContent);
    expect(businessOptions).toEqual([
      "Term / SBA Loan",
      "Equipment Financing",
      "Merchant Cash Advance",
      "Interest-Only Grace Period Loan",
    ]);
    expect(screen.getByLabelText("Loan type")).toHaveValue("TERM_SBA");
  });

  it("shows type-specific fields only for the loan types that use them", async () => {
    render(<Calculator />);
    expect(screen.queryByLabelText("Factor rate")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Grace period (months)")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Extra payment per period")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Business Loan" }));
    await userEvent.selectOptions(screen.getByLabelText("Loan type"), "MCA");
    expect(screen.getByLabelText("Factor rate")).toBeInTheDocument();
    expect(screen.queryByLabelText("APR (%)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Extra payment per period")).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Loan type"), "GRACE_PERIOD");
    expect(screen.getByLabelText("Grace period (months)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Factor rate")).not.toBeInTheDocument();
  });

  it("shows an inline error and withholds results for invalid input", async () => {
    render(<Calculator />);
    await replace("Loan amount", "50");

    const amount = screen.getByLabelText("Loan amount");
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(amount).toHaveAccessibleDescription("Loan amount must be between $100 and $500,000");
    expect(within(results()).queryByText("$438.71")).not.toBeInTheDocument();
    expect(within(results()).getByText(/fix the highlighted fields/i)).toBeInTheDocument();
  });

  it("never passes invalid input to the engine", async () => {
    render(<Calculator />);
    await replace("Loan amount", "50");
    await replace("APR (%)", "abc");
    await replace("Term", "0");

    expect(screen.getByLabelText("APR (%)")).toHaveAccessibleDescription("Enter a number");
    for (const [input] of vi.mocked(calculateLoan).mock.calls) {
      expect(loanInputSchema.safeParse(input).success).toBe(true);
    }
  });

  it("accepts thousands separators", async () => {
    render(<Calculator />);
    await replace("Loan amount", "25,000");
    await replace("APR (%)", "8.5");
    await replace("Term", "60");
    expect(within(results()).getByText("$512.91")).toBeInTheDocument();
  });

  it("explains inputs that are valid but cannot be calculated", async () => {
    render(<Calculator />);
    await replace("Loan amount", "100000");
    await replace("APR (%)", "50");
    await replace("Term", "30");
    await userEvent.selectOptions(screen.getByLabelText("Term unit"), "years");
    expect(screen.getByRole("alert")).toHaveTextContent(/never reduces the balance/);
  });

  it("keeps the APR slider and number input in sync", async () => {
    render(<Calculator />);
    const slider = screen.getByRole("slider", { name: "APR (%) slider" });
    fireEvent.change(slider, { target: { value: "7.5" } });
    expect(screen.getByLabelText("APR (%)")).toHaveValue("7.5");

    await replace("APR (%)", "12");
    expect(slider).toHaveValue("12");
  });

  it("shows the impact of extra payments (REQ-FUNC-PL03)", async () => {
    render(<Calculator />);
    await replace("Loan amount", "20000");
    await replace("APR (%)", "6");
    await replace("Term", "48");
    await replace("Extra payment per period", "100");
    expect(within(results()).getByText("$498.21")).toBeInTheDocument();
    expect(within(results()).getByText("9")).toBeInTheDocument();
  });

  it("validates a one-time extra payment against the term", async () => {
    render(<Calculator />);
    await replace("One-time extra payment", "500");
    await replace("Paid with payment #", "30");
    expect(screen.getByLabelText("Paid with payment #")).toHaveAccessibleDescription("Choose a payment between 1 and 24");
  });

  it("calculates the BDD merchant cash advance", async () => {
    render(<Calculator />);
    await userEvent.click(screen.getByRole("radio", { name: "Business Loan" }));
    await userEvent.selectOptions(screen.getByLabelText("Loan type"), "MCA");
    expect(within(results()).getByText("$62,500.00")).toBeInTheDocument();
    expect(within(results()).getByText("$12,500.00")).toBeInTheDocument();
    expect(within(results()).getByText("92.22%")).toBeInTheDocument();
  });

  it.each(LOAN_TYPES)("calculates %s from its default inputs", async (loanType) => {
    render(<Calculator />);
    if (categoryOf(loanType) === "BUSINESS") {
      await userEvent.click(screen.getByRole("radio", { name: "Business Loan" }));
    }
    await userEvent.selectOptions(screen.getByLabelText("Loan type"), loanType);
    expect(within(results()).getByRole("heading", { name: LOAN_TYPE_LABELS[loanType] })).toBeInTheDocument();
    expect(within(results()).getAllByRole("term").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/fix the highlighted fields/i)).not.toBeInTheDocument();
  });

  it("switches an MCA to a revenue-share repayment", async () => {
    render(<Calculator />);
    await userEvent.click(screen.getByRole("radio", { name: "Business Loan" }));
    await userEvent.selectOptions(screen.getByLabelText("Loan type"), "MCA");
    await userEvent.selectOptions(screen.getByLabelText("Repayment"), "revenueShare");
    expect(screen.queryByLabelText("Term (months)")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Revenue per withholding")).toHaveAccessibleDescription("Revenue per withholding is required");

    await replace("Revenue per withholding", "5000");
    // 10% of $5,000 = $500 per business day.
    expect(within(results()).getByText("$500.00")).toBeInTheDocument();
  });

  it("shows upfront fees and net proceeds for a term loan", async () => {
    render(<Calculator />);
    await userEvent.click(screen.getByRole("radio", { name: "Business Loan" }));
    await replace("SBA guarantee fee", "1500");
    expect(within(results()).getByText("$3,500.00")).toBeInTheDocument();
    expect(within(results()).getByText("$96,500.00")).toBeInTheDocument();
    expect(within(results()).getByText("8.32%")).toBeInTheDocument();
  });

  it("remembers each loan type's inputs when switching back", async () => {
    render(<Calculator />);
    await replace("Loan amount", "12345");
    await userEvent.selectOptions(screen.getByLabelText("Loan type"), "REVOLVING");
    expect(screen.getByLabelText("Outstanding balance")).toHaveValue("8000");
    await userEvent.selectOptions(screen.getByLabelText("Loan type"), "FIXED_INSTALLMENT");
    expect(screen.getByLabelText("Loan amount")).toHaveValue("12345");
  });
});
