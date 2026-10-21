import { PERIODS_PER_YEAR } from "../payment";
import { buildSchedule, type ScheduleInput } from "../schedule";
import { withUpfrontFees, type BusinessSchedule, type UpfrontFee } from "./fees";

export interface TermLoanInput extends ScheduleInput {
  /** Origination, processing and SBA guarantee fees, withheld at closing (D12). */
  fees?: readonly UpfrontFee[];
}

/** Traditional term / SBA loan (REQ-FUNC-BL01 #1): a fixed-rate loan with upfront fees. */
export function buildTermLoan({ fees, ...loan }: TermLoanInput): BusinessSchedule {
  return withUpfrontFees(buildSchedule(loan), {
    principalCents: loan.principalCents,
    fees,
    startDate: loan.startDate,
    periodsPerYear: PERIODS_PER_YEAR[loan.frequency],
  });
}
