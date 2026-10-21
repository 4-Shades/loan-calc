"use client";

import { useState, type FormEvent } from "react";
import type { LoanInput } from "@/schemas/loanInput";

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; id: string; title: string }
  | { kind: "error"; message: string };

/**
 * Saves the current calculation to PostgreSQL via POST /api/calculations
 * (REQ-FUNC-DB01) without leaving the page. Only the title and the validated
 * input are sent; the server recomputes the results it stores.
 */
export function SaveCalculation({ input, onSaved }: { input: LoanInput; onSaved?: () => void }) {
  const [title, setTitle] = useState("");
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setState({ kind: "saving" });
    try {
      const response = await fetch("/api/calculations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, input }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok && isSaved(body)) {
        setState({ kind: "saved", id: body.id, title: body.title });
        setTitle("");
        onSaved?.();
      } else {
        setState({ kind: "error", message: errorMessage(body) ?? `Saving failed (HTTP ${response.status}).` });
      }
    } catch {
      setState({ kind: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <label htmlFor="calculation-title" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Calculation title
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="calculation-title"
          type="text"
          value={title}
          maxLength={150}
          placeholder="e.g. Option A - Local Bank SBA"
          onChange={(event) => setTitle(event.target.value)}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={title.trim() === "" || state.kind === "saving"}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save Calculation
        </button>
      </div>
      {state.kind === "saved" && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          Saved “{state.title}” as <code className="font-mono">{state.id}</code>
        </p>
      )}
      {state.kind === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
    </form>
  );
}

function isSaved(body: unknown): body is { id: string; title: string } {
  return typeof body === "object" && body !== null && typeof (body as { id?: unknown }).id === "string";
}

function errorMessage(body: unknown): string | undefined {
  const error = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
  return typeof error === "string" ? error : undefined;
}
