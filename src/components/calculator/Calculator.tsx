"use client";

import { useMemo, useState } from "react";
import { AmortizationTable } from "@/components/results/AmortizationTable";
import { BalanceChart } from "@/components/results/BalanceChart";
import { BreakdownChart } from "@/components/results/BreakdownChart";
import { markInput, useRecalcMeasure } from "@/lib/perf";
import { LOAN_CATEGORIES, LOAN_TYPE_LABELS, type LoanCategory, type LoanType } from "@/schemas/loanInput";
import { FormProvider } from "./fields";
import { DEFAULT_VALUES, evaluateForm, type FormValues } from "./formModel";
import { LoanFields } from "./LoanFields";
import { ModeToggle } from "./ModeToggle";
import { ResultSummary } from "./ResultSummary";
import { SaveCalculation } from "./SaveCalculation";
import { useToday } from "./useToday";

/**
 * The single-page calculator (REQ-UI-001): mode toggle, loan-type inputs and live
 * results. Every edit re-validates; only valid input is calculated.
 */
export function Calculator() {
  const [mode, setMode] = useState<LoanCategory>("PERSONAL");
  const [typeByMode, setTypeByMode] = useState<Record<LoanCategory, LoanType>>({
    PERSONAL: LOAN_CATEGORIES.PERSONAL[0],
    BUSINESS: LOAN_CATEGORIES.BUSINESS[0],
  });
  const [valuesByType, setValuesByType] = useState<Record<LoanType, FormValues>>(DEFAULT_VALUES);
  const today = useToday();

  const loanType = typeByMode[mode];
  const values = valuesByType[loanType];
  const evaluation = useMemo(() => evaluateForm(loanType, values, today), [loanType, values, today]);

  useRecalcMeasure(evaluation);

  const setValue = (key: string, value: string) => {
    markInput();
    setValuesByType((current) => ({
      ...current,
      [loanType]: { ...current[loanType], [key]: value },
    }));
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form className="flex flex-col gap-4" noValidate onSubmit={(event) => event.preventDefault()}>
          <ModeToggle mode={mode} onChange={setMode} />
          <div className="flex flex-col gap-1">
            <label htmlFor="loan-type" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Loan type
            </label>
            <select
              id="loan-type"
              value={loanType}
              onChange={(event) =>
                setTypeByMode((current) => ({
                  ...current,
                  [mode]: event.target.value as LoanType,
                }))
              }
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {LOAN_CATEGORIES[mode].map((type) => (
                <option key={type} value={type}>
                  {LOAN_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <FormProvider
            values={values}
            errors={evaluation.status === "pending" ? {} : evaluation.errors}
            setValue={setValue}
            defaultDate={today ?? ""}
          >
            <LoanFields loanType={loanType} values={values} />
          </FormProvider>
        </form>

        <section aria-label="Results" aria-live="polite" className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">{LOAN_TYPE_LABELS[loanType]}</h2>
          {evaluation.status === "ok" && (
            <>
              <ResultSummary result={evaluation.result} />
              <SaveCalculation input={evaluation.input} />
            </>
          )}
          {evaluation.status === "invalid" && (
            <p className="text-zinc-600 dark:text-zinc-400">Fix the highlighted fields to see results.</p>
          )}
          {evaluation.status === "error" && (
            <p
              role="alert"
              className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
            >
              {evaluation.message}
            </p>
          )}
          {evaluation.status === "pending" && <p className="text-zinc-600 dark:text-zinc-400">Calculating…</p>}
        </section>
      </div>
      {evaluation.status === "ok" && (
        <section aria-labelledby="schedule-heading" className="flex flex-col gap-6">
          <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <BalanceChart rows={evaluation.result.schedule.rows} />
            <BreakdownChart rows={evaluation.result.schedule.rows} />
          </div>
          <h2 id="schedule-heading" className="text-xl font-semibold">
            Amortization schedule
          </h2>
          <AmortizationTable rows={evaluation.result.schedule.rows} />
        </section>
      )}
    </div>
  );
}
