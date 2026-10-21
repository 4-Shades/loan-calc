import { Calculator } from "@/components/calculator/Calculator";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Loan Calculator</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Amortization schedules for personal and business loans, recalculated as you type.
        </p>
      </header>
      <Calculator />
    </main>
  );
}
