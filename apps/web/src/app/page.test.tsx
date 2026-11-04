/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

import HomePage from "./page";

describe("HomePage", () => {
  it("renders pitch and primary links", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: "Marketing OS" })).toBeTruthy();
    expect(screen.getByText(/Get started/)).toBeTruthy();
  });
});
