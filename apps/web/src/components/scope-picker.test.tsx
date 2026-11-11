/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScopePicker, groupResources, type ResourceOption } from "./scope-picker";

const options: ResourceOption[] = [
  { resourceType: "account", resourceId: "mock-account-1", resourceName: "Demo Ads Account", parentId: null, selected: false },
  { resourceType: "account", resourceId: "mock-account-2", resourceName: "Demo Analytics Property", parentId: null, selected: false },
  { resourceType: "campaign", resourceId: "campaigns", resourceName: "Mock campaigns", parentId: "mock-account-1", selected: false },
  { resourceType: "lead", resourceId: "leads", resourceName: "Mock leads", parentId: "mock-account-2", selected: false },
];

describe("ScopePicker", () => {
  it("groups child resources under their account and filters by search", () => {
    const grouped = groupResources(options, "campaigns");
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.root.resourceId).toBe("mock-account-1");
    expect(grouped[0]?.children.map((child) => child.resourceId)).toEqual(["campaigns"]);
  });

  it("renders nothing selected by default and filters down to an empty state", () => {
    const onToggle = vi.fn();
    const onSave = vi.fn();
    render(<ScopePicker options={options} chosen={new Set()} onToggle={onToggle} onSave={onSave} />);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.every((box) => !box.checked)).toBe(true);

    fireEvent.click(boxes[0]!);
    expect(onToggle).toHaveBeenCalledWith("account:mock-account-1", true);

    fireEvent.change(screen.getByLabelText(/Search accounts/), { target: { value: "not-a-match" } });
    expect(screen.getByText(/No matching resources/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /save and test/i }));
    expect(onSave).toHaveBeenCalledOnce();
  });
});
