"use client";

import type { LoanType } from "@/schemas/loanInput";
import { DateField, FlatOrPercentField, NumberField, SelectField, SliderField } from "./fields";
import { FEE_SLOTS, type FormValues } from "./formModel";

const PERSONAL_MAX = 500_000;
const BUSINESS_MAX = 10_000_000;

const PAYMENT_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "annually", label: "Annually" },
] as const;

function Amount({ name, label, max }: { name: string; label: string; max: number }) {
  return <SliderField name={name} label={label} prefix="$" min={100} max={max} step={100} />;
}

function Apr() {
  return <SliderField name="aprPercent" label="APR (%)" suffix="%" min={0.01} max={100} step={0.01} />;
}

/** Term, frequency and start date shared by installment-style loans. */
function Schedule() {
  return (
    <>
      <div className="grid grid-cols-[1fr_auto] items-start gap-2">
        <NumberField name="term.value" label="Term" />
        <SelectField
          name="term.unit"
          label="Term unit"
          options={[
            { value: "months", label: "Months" },
            { value: "years", label: "Years" },
          ]}
        />
      </div>
      <SelectField name="frequency" label="Payment frequency" options={PAYMENT_FREQUENCIES} />
      <DateField name="startDate" label="Start date" />
    </>
  );
}

function Fees({ loanType, percentOf }: { loanType: LoanType; percentOf: string }) {
  const slots = FEE_SLOTS[loanType] ?? [];
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <legend className="px-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Upfront fees</legend>
      {slots.map((label, slot) => (
        <FlatOrPercentField key={label} name={`fees.${slot}.amount`} label={`${label} fee`} percentOf={percentOf} />
      ))}
    </fieldset>
  );
}

/** The inputs for one loan type (REQ-FUNC-PL02, BL02). */
export function LoanFields({ loanType, values }: { loanType: LoanType; values: FormValues }) {
  switch (loanType) {
    case "FIXED_INSTALLMENT":
      return (
        <>
          <Amount name="principal" label="Loan amount" max={PERSONAL_MAX} />
          <Apr />
          <Schedule />
          <fieldset className="flex flex-col gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <legend className="px-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Extra payments</legend>
            <NumberField name="extraPayments.recurring" label="Extra payment per period" prefix="$" placeholder="0" />
            <div className="grid grid-cols-2 items-start gap-2">
              <NumberField name="extraPayments.oneTime.0.amount" label="One-time extra payment" prefix="$" placeholder="0" />
              <NumberField name="extraPayments.oneTime.0.period" label="Paid with payment #" />
            </div>
          </fieldset>
        </>
      );
    case "INTEREST_ONLY_BALLOON":
      return (
        <>
          <Amount name="principal" label="Loan amount" max={PERSONAL_MAX} />
          <Apr />
          <Schedule />
        </>
      );
    case "REVOLVING":
      return (
        <>
          <Amount name="balance" label="Outstanding balance" max={PERSONAL_MAX} />
          <Apr />
          <NumberField name="minimumPaymentPercent" label="Minimum payment (% of balance)" suffix="%" />
          <DateField name="startDate" label="Start date" />
        </>
      );
    case "TERM_SBA":
      return (
        <>
          <Amount name="principal" label="Loan amount" max={BUSINESS_MAX} />
          <Apr />
          <Schedule />
          <Fees loanType={loanType} percentOf="loan" />
        </>
      );
    case "EQUIPMENT":
      return (
        <>
          <Amount name="purchasePrice" label="Purchase price" max={BUSINESS_MAX} />
          <FlatOrPercentField name="downPayment" label="Down payment" percentOf="price" />
          <NumberField name="residualValue" label="Residual value" prefix="$" />
          <Apr />
          <Schedule />
          <Fees loanType={loanType} percentOf="financed" />
        </>
      );
    case "MCA":
      return (
        <>
          <Amount name="advance" label="Advance amount" max={BUSINESS_MAX} />
          <SliderField name="factorRate" label="Factor rate" min={1.05} max={1.5} step={0.01} />
          <SelectField
            name="frequency"
            label="Withholding frequency"
            options={[
              { value: "daily", label: "Daily (business days)" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
          <SelectField
            name="repayment.kind"
            label="Repayment"
            options={[
              { value: "fixedTerm", label: "Fixed term" },
              { value: "revenueShare", label: "Share of revenue" },
            ]}
          />
          {values["repayment.kind"] === "revenueShare" ? (
            <>
              <NumberField name="repayment.holdbackPercent" label="Holdback (% of revenue)" suffix="%" />
              <NumberField name="repayment.revenuePerPeriod" label="Revenue per withholding" prefix="$" />
            </>
          ) : (
            <NumberField name="repayment.termMonths" label="Term (months)" />
          )}
          <DateField name="startDate" label="Start date" />
          <Fees loanType={loanType} percentOf="advance" />
        </>
      );
    case "GRACE_PERIOD":
      return (
        <>
          <Amount name="principal" label="Loan amount" max={BUSINESS_MAX} />
          <Apr />
          <NumberField name="gracePeriodMonths" label="Grace period (months)" />
          <Schedule />
          <Fees loanType={loanType} percentOf="loan" />
        </>
      );
  }
}
