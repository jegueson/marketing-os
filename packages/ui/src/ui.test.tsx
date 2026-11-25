/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, EmptyState, ErrorState, Input } from "./index";

describe("ui primitives", () => {
  it("renders a button", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("renders an input label", () => {
    render(<Input label="Email" name="email" required />);
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.getByTitle("required")).toBeTruthy();
  });

  it("renders empty and error states", () => {
    render(<EmptyState title="Nothing yet" />);
    render(<ErrorState title="Failed" />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
