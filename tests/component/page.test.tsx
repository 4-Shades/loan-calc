import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "@/app/page";

// Slice 0 smoke test: proves the jsdom + RTL + path-alias toolchain works.
describe("Home page shell", () => {
  it("renders the application heading", () => {
    render(<Page />);
    expect(
      screen.getByRole("heading", { level: 1, name: /loan calculator/i }),
    ).toBeInTheDocument();
  });
});
