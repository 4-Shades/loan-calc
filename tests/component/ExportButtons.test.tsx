import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildSchedule } from "@/engine";
import { ExportButtons } from "@/components/results/ExportButtons";

vi.mock("@/lib/pdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pdf")>()),
  buildSchedulePdf: vi.fn(async () => new Blob(["%PDF-1.3"], { type: "application/pdf" })),
}));

const { rows } = buildSchedule({ principalCents: 1_000_000, aprPercent: 5, periods: 36, frequency: "monthly", startDate: "2026-01-15" });

let downloads: { filename: string; blob: Blob }[];

beforeEach(() => {
  downloads = [];
  const blobs = new Map<string, Blob>();
  // jsdom has no object URLs or real downloads; record what would be saved.
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      const url = `blob:test/${blobs.size}`;
      blobs.set(url, blob);
      return url;
    },
    revokeObjectURL: () => {},
  }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ filename: this.download, blob: blobs.get(this.href)! });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ExportButtons (REQ-FUNC-DB03)", () => {
  it("downloads the schedule as loan-amortization-schedule.csv, built in the browser", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<ExportButtons heading="Fixed-Rate Installment Loan" summary={[]} rows={rows} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.filename).toBe("loan-amortization-schedule.csv");
    expect(downloads[0]!.blob.type).toBe("text/csv;charset=utf-8");
    const text = await downloads[0]!.blob.text();
    expect(text.split("\r\n")[0]).toBe("Period,Date,Payment,Principal,Interest,Fees,Remaining Balance");
    expect(text.split("\r\n")).toHaveLength(38);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("downloads a PDF summary report", async () => {
    render(<ExportButtons heading="Fixed-Rate Installment Loan" summary={[{ label: "Total interest", value: "$529.15" }]} rows={rows} />);
    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));
    await vi.waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]!.filename).toBe("loan-amortization-schedule.pdf");
    expect(downloads[0]!.blob.type).toBe("application/pdf");
  });
});
