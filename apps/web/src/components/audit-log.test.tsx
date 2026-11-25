/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AuditLog, type AuditLogRow } from "./audit-log";

const rows: AuditLogRow[] = [
  {
    id: 1,
    eventType: "approval.decided",
    actorRole: "customer_admin",
    createdAt: "2026-11-25T09:00:00.000Z",
    payload: { status: "approved", prompt: "SECRET-PROMPT-BODY" },
  },
  {
    id: 2,
    eventType: "action.executed",
    actorRole: "ai_specialist",
    createdAt: "2026-11-25T09:05:00.000Z",
    payload: { externalId: "lin-1" },
  },
];

afterEach(() => cleanup());

describe("audit log", () => {
  it("renders the API payload and no prompt body", () => {
    render(<AuditLog rows={rows} />);
    expect(screen.getByText("approval.decided")).toBeTruthy();
    expect(screen.getByText("approved")).toBeTruthy();
    expect(screen.getByText("action.executed")).toBeTruthy();
    expect(screen.getByText("lin-1")).toBeTruthy();
    expect(screen.getByText("2026-11-25T09:00:00.000Z")).toBeTruthy();
    expect(screen.queryByText("SECRET-PROMPT-BODY")).toBeNull();
  });
});
