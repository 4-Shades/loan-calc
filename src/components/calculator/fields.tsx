"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FieldErrors, FormValues } from "./formModel";

interface FormState {
  values: FormValues;
  errors: FieldErrors;
  setValue: (key: string, value: string) => void;
  /** Shown in empty date inputs, e.g. today's date. */
  defaultDate: string;
}

const FormContext = createContext<FormState | null>(null);

export function FormProvider({ children, ...state }: FormState & { children: ReactNode }) {
  return <FormContext.Provider value={state}>{children}</FormContext.Provider>;
}

function useField(name: string) {
  const form = useContext(FormContext);
  if (!form) throw new Error("Fields must be rendered inside <FormProvider>");
  const id = `field-${name.replace(/\./g, "-")}`;
  const error = form.errors[name];
  return {
    id,
    value: form.values[name] ?? "",
    error,
    set: (value: string) => form.setValue(name, value),
    defaultDate: form.defaultDate,
    /** Props linking an input to its error message for assistive technology. */
    a11y: { "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-error` : undefined },
  };
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm " +
  "focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-300 " +
  "aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

function FieldShell({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

interface NumberFieldProps {
  name: string;
  label: string;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
}

/** Free-text numeric input; the raw string is kept so the form can report what was typed. */
export function NumberField({ name, label, prefix, suffix, placeholder }: NumberFieldProps) {
  const field = useField(name);
  return (
    <FieldShell id={field.id} label={label} error={field.error}>
      <div className="flex items-center gap-2">
        {prefix && <span aria-hidden="true" className="text-sm text-zinc-500 dark:text-zinc-400">{prefix}</span>}
        <input
          id={field.id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={field.value}
          placeholder={placeholder}
          onChange={(event) => field.set(event.target.value)}
          className={inputClass}
          {...field.a11y}
        />
        {suffix && <span aria-hidden="true" className="text-sm text-zinc-500 dark:text-zinc-400">{suffix}</span>}
      </div>
    </FieldShell>
  );
}

interface SliderFieldProps extends NumberFieldProps {
  min: number;
  max: number;
  step: number;
}

/** Numeric input paired with a range slider; both edit the same value (REQ-UI-001). */
export function SliderField({ min, max, step, ...props }: SliderFieldProps) {
  const field = useField(props.name);
  const numeric = Number(field.value.replace(/,/g, ""));
  const sliderValue = Number.isFinite(numeric) && field.value.trim() !== "" ? Math.min(max, Math.max(min, numeric)) : min;
  return (
    <div className="flex flex-col gap-2">
      <NumberField {...props} />
      <input
        type="range"
        aria-label={`${props.label} slider`}
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        onChange={(event) => field.set(event.target.value)}
        className="w-full accent-zinc-800 dark:accent-zinc-200"
      />
    </div>
  );
}

interface SelectFieldProps {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
}

export function SelectField({ name, label, options }: SelectFieldProps) {
  const field = useField(name);
  return (
    <FieldShell id={field.id} label={label} error={field.error}>
      <select
        id={field.id}
        value={field.value}
        onChange={(event) => field.set(event.target.value)}
        className={inputClass}
        {...field.a11y}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function DateField({ name, label }: { name: string; label: string }) {
  const field = useField(name);
  return (
    <FieldShell id={field.id} label={label} error={field.error}>
      <input
        id={field.id}
        type="date"
        value={field.value || field.defaultDate}
        onChange={(event) => field.set(event.target.value)}
        className={inputClass}
        {...field.a11y}
      />
    </FieldShell>
  );
}

/** An amount entered as dollars or as a percentage of some base. */
export function FlatOrPercentField({ name, label, percentOf }: { name: string; label: string; percentOf: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-2">
      <NumberField name={`${name}.value`} label={label} placeholder="0" />
      <SelectField
        name={`${name}.kind`}
        label={`${label} type`}
        options={[
          { value: "flat", label: "$ flat" },
          { value: "percent", label: `% of ${percentOf}` },
        ]}
      />
    </div>
  );
}
