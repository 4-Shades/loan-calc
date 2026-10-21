"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { SavedItem } from "@/lib/comparison";
import { LOAN_TYPE_LABELS, type LoanType } from "@/schemas/loanInput";
import { storedSummarySchema } from "@/schemas/saveCalculation";
import { ComparisonDialog } from "./ComparisonDialog";

const MAX_SELECTED = 3;

const listSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      loanType: z.string(),
      createdAt: z.string(),
      summary: storedSummarySchema,
    }),
  ),
});

type ListState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; items: SavedItem[] };

/**
 * Recently saved calculations with a 2–3 item comparison matrix (REQ-FUNC-DB02).
 * Reloads whenever `refreshKey` changes, e.g. after a save.
 */
export function SavedCalculations({ refreshKey }: { refreshKey: number }) {
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/calculations?limit=20", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setList({ kind: "ready", items: listSchema.parse(await response.json()).items });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error("Loading saved calculations failed", error);
          setList({ kind: "error" });
        }
      });
    return () => controller.abort();
  }, [refreshKey]);

  const items = list.kind === "ready" ? list.items : [];
  // Compare in the order the user picked, skipping anything no longer listed.
  const chosen = selected.flatMap((id) => items.find((item) => item.id === id) ?? []);
  const full = chosen.length >= MAX_SELECTED;

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const close = useCallback(() => {
    setComparing(false);
    openButtonRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="saved-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="saved-heading" className="text-xl font-semibold">
          Saved calculations
        </h2>
        <button
          ref={openButtonRef}
          type="button"
          disabled={chosen.length < 2}
          onClick={() => setComparing(true)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Open Comparison Matrix{chosen.length > 0 ? ` (${chosen.length})` : ""}
        </button>
      </div>

      {list.kind === "loading" && <p className="text-sm text-zinc-500">Loading saved calculations…</p>}
      {list.kind === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t load saved calculations.
        </p>
      )}
      {list.kind === "ready" && items.length === 0 && (
        <p className="text-sm text-zinc-500">No saved calculations yet.</p>
      )}
      {list.kind === "ready" && items.length > 0 && (
        <>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {full ? "You can compare up to 3 calculations." : "Select 2 or 3 calculations to compare."}
          </p>
          <ul className="flex flex-col divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {items.map((item) => {
              const checked = selected.includes(item.id);
              return (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && full}
                      onChange={() => toggle(item.id)}
                      className="size-4 accent-zinc-900 dark:accent-zinc-100"
                    />
                    <span className="flex-1 font-medium">{item.title}</span>
                    <span className="text-sm text-zinc-500">
                      {LOAN_TYPE_LABELS[item.loanType as LoanType] ?? item.loanType} ·{" "}
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {comparing && <ComparisonDialog items={chosen} onClose={close} />}
    </section>
  );
}
