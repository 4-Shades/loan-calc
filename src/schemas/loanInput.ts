import { z } from "zod";
import { assertIsoDate } from "@/engine/dates";
import { PERIODS_PER_YEAR, periodsForTerm, type PaymentFrequency } from "@/engine/payment";

/**
 * Canonical loan inputs (REQ-NFR-CODE2): amounts in dollars, terms in months or
 * years, exactly as a user enters them. The form validates against these schemas
 * and the persistence API stores the parsed result.
 */

export const LOAN_TYPES = [
  "FIXED_INSTALLMENT",
  "INTEREST_ONLY_BALLOON",
  "REVOLVING",
  "TERM_SBA",
  "EQUIPMENT",
  "MCA",
  "GRACE_PERIOD",
] as const;
export type LoanType = (typeof LOAN_TYPES)[number];

export type LoanCategory = "PERSONAL" | "BUSINESS";

export const LOAN_CATEGORIES = {
  PERSONAL: ["FIXED_INSTALLMENT", "INTEREST_ONLY_BALLOON", "REVOLVING"],
  BUSINESS: ["TERM_SBA", "EQUIPMENT", "MCA", "GRACE_PERIOD"],
} as const satisfies Record<LoanCategory, readonly LoanType[]>;

export const LOAN_TYPE_LABELS: Readonly<Record<LoanType, string>> = {
  FIXED_INSTALLMENT: "Fixed-Rate Installment Loan",
  INTEREST_ONLY_BALLOON: "Interest-Only Loan with Balloon",
  REVOLVING: "Revolving Line of Credit",
  TERM_SBA: "Term / SBA Loan",
  EQUIPMENT: "Equipment Financing",
  MCA: "Merchant Cash Advance",
  GRACE_PERIOD: "Interest-Only Grace Period Loan",
};

export function categoryOf(loanType: LoanType): LoanCategory {
  return (LOAN_CATEGORIES.PERSONAL as readonly LoanType[]).includes(loanType) ? "PERSONAL" : "BUSINESS";
}

const PERSONAL_MAX = 500_000;
const BUSINESS_MAX = 10_000_000;
const MAX_TERM_MONTHS = 360;

const usd = (dollars: number) => `$${dollars.toLocaleString("en-US")}`;
const isWholeCents = (dollars: number) => Math.abs(dollars * 100 - Math.round(dollars * 100)) < 1e-6;

const money = (label: string, min: number, max: number) =>
  z
    .number({ error: `${label} is required` })
    .min(min, `${label} must be between ${usd(min)} and ${usd(max)}`)
    .max(max, `${label} must be between ${usd(min)} and ${usd(max)}`)
    .refine(isWholeCents, "Enter whole cents");

const percent = (label: string, message: string) =>
  z.number({ error: `${label} is required` }).min(0, message).max(100, message);

const APR_MESSAGE = "APR must be between 0.01% and 100%";
const apr = z.number({ error: "APR is required" }).min(0.01, APR_MESSAGE).max(100, APR_MESSAGE);

const isoDate = z.string({ error: "Enter a valid date" }).refine((value) => {
  try {
    assertIsoDate(value);
    return true;
  } catch {
    return false;
  }
}, "Enter a valid date");

export interface Term {
  value: number;
  unit: "months" | "years";
}

const term = z
  .object({
    value: z.number({ error: "Term is required" }).int("Term must be a whole number").min(1, "Term must be at least 1"),
    unit: z.enum(["months", "years"], { error: "Choose months or years" }),
  })
  .refine((t) => termMonths(t) <= MAX_TERM_MONTHS, { message: "Term can be at most 30 years", path: ["value"] });

export function termMonths({ value, unit }: Term): number {
  return unit === "years" ? value * 12 : value;
}

/** Converts a span in months to whole payment periods at the given frequency. */
export function monthsToPeriods(months: number, frequency: PaymentFrequency): number {
  return Math.round((months * PERIODS_PER_YEAR[frequency]) / 12);
}

const paymentFrequency = z.enum(["weekly", "biweekly", "monthly", "annually"], {
  error: "Choose a payment frequency",
});

const FREQUENCY_ADJECTIVE: Record<PaymentFrequency, string> = {
  weekly: "weekly",
  biweekly: "bi-weekly",
  monthly: "monthly",
  annually: "annual",
};

/** Number of payments for a term, or null when the term is shorter than one payment period. */
export function periodsOrNull(t: Term, frequency: PaymentFrequency): number | null {
  try {
    return periodsForTerm(termMonths(t), frequency);
  } catch {
    return null;
  }
}

const PERCENT_MESSAGE = "Percentage must be between 0% and 100%";

const amount = (label: string, maxFlat: number) =>
  z.discriminatedUnion(
    "kind",
    [
      z.object({ kind: z.literal("flat"), value: money(label, 0, maxFlat) }),
      z.object({ kind: z.literal("percent"), value: percent(label, PERCENT_MESSAGE) }),
    ],
    { error: "Choose $ or %" },
  );

export type AmountInput = z.infer<ReturnType<typeof amount>>;

const fees = z
  .array(
    z.object({
      label: z.string({ error: "Name the fee" }).trim().min(1, "Name the fee").max(60, "Use at most 60 characters"),
      amount: amount("Fee", BUSINESS_MAX),
    }),
  )
  .max(5, "Add at most 5 fees")
  .optional();

/** Shared by loan types with a term and payment frequency. */
const scheduled = {
  aprPercent: apr,
  term,
  frequency: paymentFrequency,
  startDate: isoDate,
};

type AddIssue = (path: (string | number)[], message: string) => void;

/**
 * Cross-field rules run only once every field is valid on its own (Zod 4 otherwise
 * runs them after non-fatal field errors), so each problem gets one message.
 */
function crossField<T>(rule: (input: T, addIssue: AddIssue) => void) {
  return (ctx: z.core.ParsePayload<T>) => {
    if (ctx.issues.length > 0) return;
    rule(ctx.value, (path, message) => ctx.issues.push({ code: "custom", message, input: ctx.value, path }));
  };
}

function termCoversOnePayment(input: { term: Term; frequency: PaymentFrequency }, addIssue: AddIssue) {
  if (periodsOrNull(input.term, input.frequency) === null) {
    addIssue(["term", "value"], `Term is shorter than one ${FREQUENCY_ADJECTIVE[input.frequency]} payment`);
  }
}

const fixedInstallment = z
  .object({
    loanType: z.literal("FIXED_INSTALLMENT"),
    principal: money("Loan amount", 100, PERSONAL_MAX),
    ...scheduled,
    extraPayments: z
      .object({
        recurring: z
          .number({ error: "Extra payment is required" })
          .min(0, "Extra payment cannot be negative")
          .max(PERSONAL_MAX, `Extra payment can be at most ${usd(PERSONAL_MAX)}`)
          .refine(isWholeCents, "Enter whole cents")
          .optional(),
        oneTime: z
          .array(
            z.object({
              period: z
                .number({ error: "Payment number is required" })
                .int("Payment number must be a whole number")
                .min(1, "Payment number must be at least 1"),
              amount: z
                .number({ error: "Extra payment is required" })
                .gt(0, "Extra payment must be more than $0")
                .max(PERSONAL_MAX, `Extra payment can be at most ${usd(PERSONAL_MAX)}`)
                .refine(isWholeCents, "Enter whole cents"),
            }),
          )
          .max(12, "Add at most 12 one-time extra payments")
          .optional(),
      })
      .optional(),
  })
  .check(
    crossField((input, addIssue) => {
      termCoversOnePayment(input, addIssue);
      const periods = periodsOrNull(input.term, input.frequency);
      if (periods === null) return;
      input.extraPayments?.oneTime?.forEach((extra, index) => {
        if (extra.period > periods) {
          addIssue(["extraPayments", "oneTime", index, "period"], `Choose a payment between 1 and ${periods}`);
        }
      });
    }),
  );

const interestOnlyBalloon = z
  .object({
    loanType: z.literal("INTEREST_ONLY_BALLOON"),
    principal: money("Loan amount", 100, PERSONAL_MAX),
    ...scheduled,
  })
  .check(crossField(termCoversOnePayment));

const MINIMUM_MESSAGE = "Minimum payment must be above 0% and at most 100%";

const revolving = z.object({
  loanType: z.literal("REVOLVING"),
  balance: money("Balance", 100, PERSONAL_MAX),
  aprPercent: apr,
  minimumPaymentPercent: z
    .number({ error: "Minimum payment is required" })
    .gt(0, MINIMUM_MESSAGE)
    .max(100, MINIMUM_MESSAGE),
  startDate: isoDate,
});

const termSba = z
  .object({
    loanType: z.literal("TERM_SBA"),
    principal: money("Loan amount", 100, BUSINESS_MAX),
    ...scheduled,
    fees,
  })
  .check(crossField(termCoversOnePayment));

/** Resolves a flat-or-percent amount to dollars. */
export function resolveDollars(value: AmountInput, base: number): number {
  return value.kind === "flat" ? value.value : (base * value.value) / 100;
}

const equipment = z
  .object({
    loanType: z.literal("EQUIPMENT"),
    purchasePrice: money("Purchase price", 100, BUSINESS_MAX),
    downPayment: amount("Down payment", BUSINESS_MAX),
    residualValue: money("Residual value", 0, BUSINESS_MAX),
    ...scheduled,
    fees,
  })
  .check(
    crossField((input, addIssue) => {
      termCoversOnePayment(input, addIssue);
      const financed = input.purchasePrice - resolveDollars(input.downPayment, input.purchasePrice);
      if (financed <= 0) {
        addIssue(["downPayment", "value"], "Down payment must be less than the purchase price");
      } else if (input.residualValue >= financed) {
        addIssue(["residualValue"], "Residual value must be less than the amount financed");
      }
    }),
  );

const FACTOR_MESSAGE = "Factor rate must be between 1.05 and 1.50";
const MCA_TERM_MESSAGE = "Term must be 1 to 120 months";
const HOLDBACK_MESSAGE = "Holdback must be above 0% and at most 100%";

const mca = z.object({
  loanType: z.literal("MCA"),
  advance: money("Advance amount", 100, BUSINESS_MAX),
  factorRate: z.number({ error: "Factor rate is required" }).min(1.05, FACTOR_MESSAGE).max(1.5, FACTOR_MESSAGE),
  frequency: z.enum(["daily", "weekly", "monthly"], { error: "Choose daily, weekly or monthly" }),
  repayment: z.discriminatedUnion(
    "kind",
    [
      z.object({
        kind: z.literal("fixedTerm"),
        termMonths: z
          .number({ error: "Term is required" })
          .int(MCA_TERM_MESSAGE)
          .min(1, MCA_TERM_MESSAGE)
          .max(120, MCA_TERM_MESSAGE),
      }),
      z.object({
        kind: z.literal("revenueShare"),
        holdbackPercent: z.number({ error: "Holdback is required" }).gt(0, HOLDBACK_MESSAGE).max(100, HOLDBACK_MESSAGE),
        revenuePerPeriod: money("Revenue per withholding", 0.01, BUSINESS_MAX),
      }),
    ],
    { error: "Choose a repayment type" },
  ),
  startDate: isoDate,
  fees,
});

const gracePeriod = z
  .object({
    loanType: z.literal("GRACE_PERIOD"),
    principal: money("Loan amount", 100, BUSINESS_MAX),
    ...scheduled,
    gracePeriodMonths: z
      .number({ error: "Grace period is required" })
      .int("Grace period must be a whole number of months")
      .min(0, "Grace period cannot be negative"),
    fees,
  })
  .check(
    crossField((input, addIssue) => {
      termCoversOnePayment(input, addIssue);
      const periods = periodsOrNull(input.term, input.frequency);
      if (periods !== null && monthsToPeriods(input.gracePeriodMonths, input.frequency) >= periods) {
        addIssue(["gracePeriodMonths"], "Grace period must be shorter than the term");
      }
    }),
  );

export const loanInputSchema = z.discriminatedUnion(
  "loanType",
  [fixedInstallment, interestOnlyBalloon, revolving, termSba, equipment, mca, gracePeriod],
  { error: "Choose a loan type" },
);

export type LoanInput = z.infer<typeof loanInputSchema>;
export type LoanInputOf<T extends LoanType> = Extract<LoanInput, { loanType: T }>;
