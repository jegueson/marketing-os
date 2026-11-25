/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkloadAbsorbed } from "./workload-absorbed";

const fixture = {
  category: "reporting",
  baselineHours: 40,
  hoursAbsorbed: 12,
};

afterEach(() => cleanup());

describe("workload absorbed", () => {
  it("renders the stored hours and no savings figure", () => {
    render(<WorkloadAbsorbed rows={[fixture]} />);
    expect(screen.getByText("reporting")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.queryByText(/saving/i)).toBeNull();
  });

  it("renders an empty list as no recorded workload", () => {
    render(<WorkloadAbsorbed rows={[]} />);
    expect(screen.getByText("No workload recorded.")).toBeTruthy();
  });
});
