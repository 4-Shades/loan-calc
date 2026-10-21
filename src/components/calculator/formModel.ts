import { calculateLoan, type CalculationResult } from "@/lib/calculateLoan";
import { loanInputSchema, type LoanType } from "@/schemas/loanInput";

/**
 * Raw form state: every field is the string the user typed, keyed by the dotted
 * path of the canonical input it maps to (e.g. "term.value"), so Zod issue paths
 * point straight back at the field that caused them.
 */
export type FormValues = Readonly<Record<string, string>>;
export type FieldErrors = Readonly<Record<string, string>>;

/** Fee inputs offered per loan type; blank ones are left out of the input. */
export const FEE_SLOTS: Readonly<Partial<Record<LoanType, readonly string[]>>> = {
  TERM_SBA: ["Origination", "SBA guarantee"],
  EQUIPMENT: ["Origination"],
  MCA: ["Origination"],
  GRACE_PERIOD: ["Origination"],
};

const scheduled = { "term.unit": "months", frequency: "monthly", startDate: "" };

// Defaults are the BDD examples, so the calculator opens on a known-good result.
export const DEFAULT_VALUES: Readonly<Record<LoanType, FormValues>> = {
  FIXED_INSTALLMENT: {
    ...scheduled,
    principal: "10000",
    aprPercent: "5",
    "term.value": "24",
    "extraPayments.recurring": "",
    "extraPayments.oneTime.0.amount": "",
    "extraPayments.oneTime.0.period": "",
  },
  INTEREST_ONLY_BALLOON: { ...scheduled, principal: "10000", aprPercent: "6", "term.value": "12" },
  REVOLVING: { balance: "8000", aprPercent: "18", minimumPaymentPercent: "2.5", startDate: "" },
  TERM_SBA: {
    ...scheduled,
    principal: "100000",
    aprPercent: "7.5",
    "term.value": "10",
    "term.unit": "years",
    "fees.0.amount.value": "2",
    "fees.0.amount.kind": "percent",
    "fees.1.amount.value": "",
    "fees.1.amount.kind": "flat",
  },
  EQUIPMENT: {
    ...scheduled,
    purchasePrice: "150000",
    "downPayment.value": "30000",
    "downPayment.kind": "flat",
    residualValue: "15000",
    aprPercent: "6.5",
    "term.value": "48",
    "fees.0.amount.value": "",
    "fees.0.amount.kind": "percent",
  },
  MCA: {
    advance: "50000",
    factorRate: "1.25",
    frequency: "daily",
    "repayment.kind": "fixedTerm",
    "repayment.termMonths": "6",
    "repayment.holdbackPercent": "10",
    "repayment.revenuePerPeriod": "",
    startDate: "",
    "fees.0.amount.value": "",
    "fees.0.amount.kind": "flat",
  },
  GRACE_PERIOD: {
    ...scheduled,
    principal: "100000",
    aprPercent: "7.5",
    "term.value": "36",
    gracePeriodMonths: "6",
    "fees.0.amount.value": "",
    "fees.0.amount.kind": "percent",
  },
};

export type Evaluation =
  | { status: "pending" }
  | { status: "invalid"; errors: FieldErrors }
  | { status: "error"; message: string; errors: FieldErrors }
  | { status: "ok"; result: CalculationResult; errors: FieldErrors };

/**
 * Validates the form and, only if it passes, runs the calculation. Invalid input
 * never reaches the engine. `today` is null during server rendering.
 */
export function evaluateForm(loanType: LoanType, values: FormValues, today: string | null): Evaluation {
  if (!values.startDate && today === null) return { status: "pending" };

  const { candidate, parseErrors, fieldKey } = buildCandidate(loanType, values, today ?? "");
  const parsed = loanInputSchema.safeParse(candidate);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = fieldKey(issue.path);
      errors[key] ??= issue.message;
    }
    // "Enter a number" is more useful than the schema's "is required" for text like "abc".
    return { status: "invalid", errors: { ...errors, ...parseErrors } };
  }

  const outcome = calculateLoan(parsed.data);
  return outcome.ok
    ? { status: "ok", result: outcome.result, errors: {} }
    : { status: "error", message: outcome.error, errors: {} };
}

interface Candidate {
  candidate: Record<string, unknown>;
  parseErrors: FieldErrors;
  /** Maps a Zod issue path back to the form field key. */
  fieldKey: (path: readonly PropertyKey[]) => string;
}

function buildCandidate(loanType: LoanType, values: FormValues, today: string): Candidate {
  const parseErrors: Record<string, string> = {};
  const text = (key: string) => (values[key] ?? "").trim();
  const isBlank = (key: string) => text(key) === "";
  /** Blank → undefined (the schema reports it as required); non-numeric → NaN plus a parse error. */
  const num = (key: string): number | undefined => {
    if (isBlank(key)) return undefined;
    const parsed = Number(text(key).replace(/,/g, ""));
    if (Number.isNaN(parsed)) parseErrors[key] = "Enter a number";
    return parsed;
  };

  const feeSlots = (FEE_SLOTS[loanType] ?? []).flatMap((label, slot) =>
    isBlank(`fees.${slot}.amount.value`) ? [] : [{ label, slot }],
  );
  const fees = feeSlots.map(({ label, slot }) => ({
    label,
    amount: { kind: text(`fees.${slot}.amount.kind`), value: num(`fees.${slot}.amount.value`) },
  }));

  const scheduled = {
    aprPercent: num("aprPercent"),
    term: { value: num("term.value"), unit: text("term.unit") },
    frequency: text("frequency"),
  };
  const startDate = text("startDate") || today;

  let candidate: Record<string, unknown>;
  switch (loanType) {
    case "FIXED_INSTALLMENT": {
      const recurring = isBlank("extraPayments.recurring") ? undefined : num("extraPayments.recurring");
      const hasOneTime = !isBlank("extraPayments.oneTime.0.amount") || !isBlank("extraPayments.oneTime.0.period");
      const oneTime = hasOneTime
        ? [{ period: num("extraPayments.oneTime.0.period"), amount: num("extraPayments.oneTime.0.amount") }]
        : undefined;
      candidate = {
        principal: num("principal"),
        ...scheduled,
        extraPayments: recurring === undefined && !oneTime ? undefined : { recurring, oneTime },
      };
      break;
    }
    case "INTEREST_ONLY_BALLOON":
      candidate = { principal: num("principal"), ...scheduled };
      break;
    case "REVOLVING":
      candidate = {
        balance: num("balance"),
        aprPercent: num("aprPercent"),
        minimumPaymentPercent: num("minimumPaymentPercent"),
      };
      break;
    case "TERM_SBA":
      candidate = { principal: num("principal"), ...scheduled, fees };
      break;
    case "EQUIPMENT":
      candidate = {
        purchasePrice: num("purchasePrice"),
        downPayment: { kind: text("downPayment.kind"), value: num("downPayment.value") },
        residualValue: num("residualValue"),
        ...scheduled,
        fees,
      };
      break;
    case "MCA":
      candidate = {
        advance: num("advance"),
        factorRate: num("factorRate"),
        frequency: text("frequency"),
        repayment:
          text("repayment.kind") === "revenueShare"
            ? {
                kind: "revenueShare",
                holdbackPercent: num("repayment.holdbackPercent"),
                revenuePerPeriod: num("repayment.revenuePerPeriod"),
              }
            : { kind: "fixedTerm", termMonths: num("repayment.termMonths") },
        fees,
      };
      break;
    case "GRACE_PERIOD":
      candidate = { principal: num("principal"), ...scheduled, gracePeriodMonths: num("gracePeriodMonths"), fees };
      break;
  }

  return {
    candidate: { loanType, ...candidate, startDate },
    parseErrors,
    fieldKey: (path) => {
      const parts = [...path];
      // Blank fee slots are dropped, so array index → slot index.
      if (parts[0] === "fees" && typeof parts[1] === "number") {
        parts[1] = feeSlots[parts[1]]?.slot ?? parts[1];
      }
      return parts.map(String).join(".");
    },
  };
}
