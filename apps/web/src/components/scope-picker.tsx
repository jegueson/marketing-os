"use client";

import { useState } from "react";
import { Button, Input } from "@marketing-os/ui";

export type ResourceOption = {
  resourceType: string;
  resourceId: string;
  resourceName: string;
  parentId: string | null;
  selected: boolean;
};

export function resourceKey(option: ResourceOption): string {
  return `${option.resourceType}:${option.resourceId}`;
}

export type ResourceGroup = {
  root: ResourceOption;
  children: ResourceOption[];
};

export function groupResources(options: ResourceOption[], query: string): ResourceGroup[] {
  const needle = query.trim().toLowerCase();
  const matches = (option: ResourceOption) =>
    !needle ||
    option.resourceName.toLowerCase().includes(needle) ||
    option.resourceId.toLowerCase().includes(needle);

  const byId = new Map(options.map((option) => [option.resourceId, option]));
  const roots = options.filter((option) => !option.parentId || !byId.has(option.parentId));
  const groups: ResourceGroup[] = [];
  for (const root of roots) {
    const children = options.filter((option) => option.parentId === root.resourceId);
    const matchingChildren = matches(root) ? children : children.filter(matches);
    if (matches(root) || matchingChildren.length > 0) {
      groups.push({ root, children: matchingChildren });
    }
  }
  return groups;
}

export function ScopePicker({
  options,
  chosen,
  onToggle,
  onSave,
}: {
  options: ResourceOption[];
  chosen: Set<string>;
  onToggle: (key: string, checked: boolean) => void;
  onSave: () => void;
}) {
  const [query, setQuery] = useState("");
  const groups = groupResources(options, query);

  return (
    <>
      <p>Step 2: choose what Marketing OS may read. Nothing is selected by default.</p>
      <Input
        label="Search accounts and resources"
        name="scopeSearch"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {groups.length === 0 ? <p>No matching resources.</p> : null}
      {groups.map(({ root, children }) => {
        const rootKey = resourceKey(root);
        return (
          <div key={rootKey}>
            <label style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={chosen.has(rootKey)}
                onChange={(event) => onToggle(rootKey, event.target.checked)}
              />{" "}
              {root.resourceName} ({root.resourceType})
            </label>
            {children.map((child) => {
              const childKey = resourceKey(child);
              return (
                <label key={childKey} style={{ display: "block", paddingLeft: "1.5rem" }}>
                  <input
                    type="checkbox"
                    checked={chosen.has(childKey)}
                    onChange={(event) => onToggle(childKey, event.target.checked)}
                  />{" "}
                  {child.resourceName} ({child.resourceType})
                </label>
              );
            })}
          </div>
        );
      })}
      <Button onClick={onSave}>Step 3: save and test connection</Button>
    </>
  );
}
