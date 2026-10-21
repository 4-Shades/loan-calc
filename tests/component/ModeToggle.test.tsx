import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModeToggle } from "@/components/calculator/ModeToggle";

describe("ModeToggle (REQ-UI-003)", () => {
  it("offers Personal Loan and Business Loan modes and marks the active one", () => {
    render(<ModeToggle mode="PERSONAL" onChange={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: "Calculation mode" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Personal Loan" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Business Loan" })).toHaveAttribute("aria-checked", "false");
  });

  it("switches mode on click", async () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="PERSONAL" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Business Loan" }));
    expect(onChange).toHaveBeenCalledWith("BUSINESS");
  });

  it("supports arrow keys and keeps only the active option in the tab order", async () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="PERSONAL" onChange={onChange} />);
    const personal = screen.getByRole("radio", { name: "Personal Loan" });
    expect(personal).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Business Loan" })).toHaveAttribute("tabindex", "-1");

    personal.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("BUSINESS");
  });
});
