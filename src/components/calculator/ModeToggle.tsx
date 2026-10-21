"use client";

import { useRef, type KeyboardEvent } from "react";
import type { LoanCategory } from "@/schemas/loanInput";

const MODES: readonly { value: LoanCategory; label: string }[] = [
  { value: "PERSONAL", label: "Personal Loan" },
  { value: "BUSINESS", label: "Business Loan" },
];

interface ModeToggleProps {
  mode: LoanCategory;
  onChange: (mode: LoanCategory) => void;
}

/** Personal / Business calculation mode switch (REQ-UI-003), an ARIA radio group. */
export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (index + step + MODES.length) % MODES.length;
    buttons.current[next]?.focus();
    onChange(MODES[next]!.value);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Calculation mode"
      className="inline-flex rounded-lg border border-zinc-300 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-900"
    >
      {MODES.map((option, index) => {
        const checked = option.value === mode;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              checked
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
