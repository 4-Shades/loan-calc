import {
  LoanCalculationError,
  buildEquipmentLoan,
  buildGracePeriodLoan,
  buildInterestOnlySchedule,
  buildMerchantCashAdvance,
  buildRevolvingSchedule,
  buildSchedule,
  buildTermLoan,
  periodsForTerm,
  toCents,
  type Amount,
  type BusinessSchedule,
  type EquipmentSummary,
  type LoanCalculationErrorCode,
  type McaSummary,
  type RevolvingSchedule,
  type Schedule,
  type ScheduleInput,
  type UpfrontFee,
} from "@/engine";
import {
  monthsToPeriods,
  termMonths,
  type AmountInput,
  type LoanInput,
  type LoanInputOf,
  type LoanType,
} from "@/schemas/loanInput";

interface ScheduleByType {
  FIXED_INSTALLMENT: Schedule;
  INTEREST_ONLY_BALLOON: Schedule;
  REVOLVING: RevolvingSchedule;
  TERM_SBA: BusinessSchedule;
  EQUIPMENT: BusinessSchedule<EquipmentSummary>;
  MCA: BusinessSchedule<McaSummary>;
  GRACE_PERIOD: BusinessSchedule;
}

export type CalculationResult = {
  [T in LoanType]: { loanType: T; schedule: ScheduleByType[T] };
}[LoanType];

export type CalculationOutcome = { ok: true; result: CalculationResult } | { ok: false; error: string };

const ERROR_MESSAGES: Record<LoanCalculationErrorCode, string> = {
  NON_AMORTIZING: "At this rate and term the payment never reduces the balance. Shorten the term or lower the APR.",
  MINIMUM_BELOW_INTEREST:
    "The minimum payment doesn't cover the monthly interest, so the balance would never go down. Raise the minimum percentage.",
  FEES_EXCEED_LOAN: "Upfront fees must be less than the loan amount.",
  ADVANCE_TOO_SMALL: "The advance is too small to split across that many withdrawals.",
  REPAYMENT_TOO_LONG: "At this holdback and revenue the advance would take more than 10 years to repay.",
};

/**
 * Runs the engine for validated input. Inputs that pass validation but cannot be
 * calculated together come back as a readable error; anything else is a bug and throws.
 */
export function calculateLoan(input: LoanInput): CalculationOutcome {
  try {
    return { ok: true, result: dispatch(input) };
  } catch (error) {
    if (error instanceof LoanCalculationError) {
      return { ok: false, error: ERROR_MESSAGES[error.code] };
    }
    throw error;
  }
}

function dispatch(input: LoanInput): CalculationResult {
  switch (input.loanType) {
    case "FIXED_INSTALLMENT":
      return {
        loanType: input.loanType,
        schedule: buildSchedule({ ...scheduled(input, input.principal), extraPayments: extraPayments(input) }),
      };
    case "INTEREST_ONLY_BALLOON":
      return { loanType: input.loanType, schedule: buildInterestOnlySchedule(scheduled(input, input.principal)) };
    case "REVOLVING":
      return {
        loanType: input.loanType,
        schedule: buildRevolvingSchedule({
          balanceCents: toCents(input.balance),
          aprPercent: input.aprPercent,
          minimumPaymentPercent: input.minimumPaymentPercent,
          startDate: input.startDate,
        }),
      };
    case "TERM_SBA":
      return {
        loanType: input.loanType,
        schedule: buildTermLoan({ ...scheduled(input, input.principal), fees: fees(input.fees) }),
      };
    case "EQUIPMENT":
      return {
        loanType: input.loanType,
        schedule: buildEquipmentLoan({
          purchasePriceCents: toCents(input.purchasePrice),
          downPayment: amount(input.downPayment),
          residualCents: toCents(input.residualValue),
          aprPercent: input.aprPercent,
          periods: periodsForTerm(termMonths(input.term), input.frequency),
          frequency: input.frequency,
          startDate: input.startDate,
          fees: fees(input.fees),
        }),
      };
    case "MCA":
      return {
        loanType: input.loanType,
        schedule: buildMerchantCashAdvance({
          advanceCents: toCents(input.advance),
          factorRate: input.factorRate,
          frequency: input.frequency,
          repayment:
            input.repayment.kind === "fixedTerm"
              ? input.repayment
              : {
                  kind: "revenueShare",
                  holdbackPercent: input.repayment.holdbackPercent,
                  revenueCentsPerPeriod: toCents(input.repayment.revenuePerPeriod),
                },
          startDate: input.startDate,
          fees: fees(input.fees),
        }),
      };
    case "GRACE_PERIOD":
      return {
        loanType: input.loanType,
        schedule: buildGracePeriodLoan({
          ...scheduled(input, input.principal),
          gracePeriods: monthsToPeriods(input.gracePeriodMonths, input.frequency),
          fees: fees(input.fees),
        }),
      };
    default:
      return assertNever(input);
  }
}

type ScheduledInput = LoanInputOf<"FIXED_INSTALLMENT" | "INTEREST_ONLY_BALLOON" | "TERM_SBA" | "GRACE_PERIOD">;

function scheduled(input: ScheduledInput, principal: number): ScheduleInput {
  return {
    principalCents: toCents(principal),
    aprPercent: input.aprPercent,
    periods: periodsForTerm(termMonths(input.term), input.frequency),
    frequency: input.frequency,
    startDate: input.startDate,
  };
}

function extraPayments({ extraPayments: extras }: LoanInputOf<"FIXED_INSTALLMENT">) {
  if (!extras) return undefined;
  return {
    recurringCents: extras.recurring === undefined ? undefined : toCents(extras.recurring),
    oneTime: extras.oneTime?.map(({ period, amount }) => ({ period, amountCents: toCents(amount) })),
  };
}

function amount(value: AmountInput): Amount {
  return value.kind === "flat"
    ? { kind: "flat", amountCents: toCents(value.value) }
    : { kind: "percent", percent: value.value };
}

function fees(list: readonly { label: string; amount: AmountInput }[] | undefined): UpfrontFee[] | undefined {
  return list?.map((fee) => ({ label: fee.label, amount: amount(fee.amount) }));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled loan type: ${JSON.stringify(value)}`);
}
