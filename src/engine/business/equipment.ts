import { PERIODS_PER_YEAR, type PaymentFrequency } from "../payment";
import { buildSchedule } from "../schedule";
import {
  resolveAmountCents,
  withUpfrontFees,
  type Amount,
  type BusinessSchedule,
  type BusinessSummary,
  type UpfrontFee,
} from "./fees";

export interface EquipmentLoanInput {
  purchasePriceCents: number;
  /** Flat, or a percentage of the purchase price. */
  downPayment: Amount;
  /** Equipment value at term end, repaid as a balloon with the final payment (D9). */
  residualCents: number;
  aprPercent: number;
  periods: number;
  frequency: PaymentFrequency;
  startDate: string;
  /** Percentages are of the financed amount. */
  fees?: readonly UpfrontFee[];
}

export interface EquipmentSummary extends BusinessSummary {
  downPaymentCents: number;
  financedCents: number;
  balloonCents: number;
}

/**
 * Equipment financing (REQ-FUNC-BL01 #2, D9): the price less the down payment is
 * financed with level payments sized to leave the residual value outstanding,
 * which is repaid as a balloon with the final payment.
 */
export function buildEquipmentLoan(input: EquipmentLoanInput): BusinessSchedule<EquipmentSummary> {
  const { purchasePriceCents, downPayment, residualCents, aprPercent, periods, frequency, startDate, fees } = input;
  if (!Number.isInteger(purchasePriceCents) || purchasePriceCents <= 0) {
    throw new RangeError(`Purchase price must be a positive whole number of cents, got ${purchasePriceCents}`);
  }
  const downPaymentCents = resolveAmountCents(downPayment, purchasePriceCents);
  if (downPaymentCents >= purchasePriceCents) {
    throw new RangeError("Down payment must be less than the purchase price");
  }
  const financedCents = purchasePriceCents - downPaymentCents;

  const schedule = buildSchedule({
    principalCents: financedCents,
    balloonCents: residualCents,
    aprPercent,
    periods,
    frequency,
    startDate,
  });
  const { rows, summary } = withUpfrontFees(schedule, {
    principalCents: financedCents,
    fees,
    startDate,
    periodsPerYear: PERIODS_PER_YEAR[frequency],
  });
  return { rows, summary: { ...summary, downPaymentCents, financedCents, balloonCents: residualCents } };
}
