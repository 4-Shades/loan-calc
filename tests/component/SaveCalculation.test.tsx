import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaveCalculation } from "@/components/calculator/SaveCalculation";
import { loanInputSchema } from "@/schemas/loanInput";

const input = loanInputSchema.parse({
  loanType: "TERM_SBA",
  principal: 100_000,
  aprPercent: 7.5,
  term: { value: 10, unit: "years" },
  frequency: "monthly",
  startDate: "2026-01-15",
});

const ID = "3f6c1b2e-8a4d-4f7e-9c2b-1d5e6f7a8b9c";

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SaveCalculation (REQ-FUNC-DB01)", () => {
  it("is disabled until the calculation has a title", async () => {
    render(<SaveCalculation input={input} />);
    const button = screen.getByRole("button", { name: "Save Calculation" });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Calculation title"), "Option A");
    expect(button).toBeEnabled();
  });

  it("posts the title and validated input as JSON and shows the assigned UUID", async () => {
    const fetchMock = mockFetch(201, { id: ID, title: "Option A - Local Bank SBA", loanType: "TERM_SBA" });
    render(<SaveCalculation input={input} />);
    await userEvent.type(screen.getByLabelText("Calculation title"), "Option A - Local Bank SBA");
    await userEvent.click(screen.getByRole("button", { name: "Save Calculation" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/calculations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Option A - Local Bank SBA", input }),
    });
    expect(await screen.findByRole("status")).toHaveTextContent(`Saved “Option A - Local Bank SBA” as ${ID}`);
    expect(screen.getByLabelText("Calculation title")).toHaveValue("");
  });

  it("shows the server's message when saving fails", async () => {
    mockFetch(429, { error: "Rate limit exceeded. Try again in 42 seconds." });
    render(<SaveCalculation input={input} />);
    await userEvent.type(screen.getByLabelText("Calculation title"), "Option A");
    await userEvent.click(screen.getByRole("button", { name: "Save Calculation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Rate limit exceeded. Try again in 42 seconds.");
    expect(screen.getByLabelText("Calculation title")).toHaveValue("Option A");
  });

  it("reports a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<SaveCalculation input={input} />);
    await userEvent.type(screen.getByLabelText("Calculation title"), "Option A");
    await userEvent.click(screen.getByRole("button", { name: "Save Calculation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server. Check your connection and try again.");
  });

  it("limits the title to 150 characters", () => {
    render(<SaveCalculation input={input} />);
    expect(screen.getByLabelText("Calculation title")).toHaveAttribute("maxlength", "150");
  });
});
