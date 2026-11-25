import { diffConfigDocuments, parseConfigYaml, serializeConfigYaml, type ConfigDiffChange } from "@marketing-os/config";
import type { PolicyDefinition } from "@marketing-os/policy";
import type { SkillDefinition, WorkflowDefinition } from "@marketing-os/schemas";
import type { Database } from "./context";
import {
  findPolicyByName,
  loadActivePolicyDocument,
  publishPolicy,
  savePolicyDraft,
} from "./policies";
import {
  findSkillByName,
  loadActiveSkillDocument,
  publishSkill,
  saveSkillDraft,
  type ToolCatalogEntry,
} from "./skills";
import {
  findWorkflowByName,
  loadActiveWorkflowDocument,
  publishWorkflow,
  saveWorkflowDraft,
} from "./workflows";

type Scope = { tenantId: string; workspaceId: string; publishedBy: string };

export type ConfigImportPreview = {
  activeVersion: number | null;
  changes: ConfigDiffChange[];
} & (
  | { kind: "skill"; name: string; document: SkillDefinition }
  | { kind: "workflow"; name: string; document: WorkflowDefinition }
  | { kind: "policy"; name: string; document: PolicyDefinition }
);

export type ConfigImportResult = {
  kind: "skill" | "workflow" | "policy";
  id: string;
  name: string;
  version: number;
  changes: ConfigDiffChange[];
};

async function previewSkill(tx: Database, scope: Scope, source: string): Promise<ConfigImportPreview> {
  const parsed = parseConfigYaml("skill", source);
  if (parsed.kind !== "skill") {
    throw new Error("expected skill document");
  }
  const document = parsed.document;
  const existing = await findSkillByName(tx, {
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    name: document.name,
  });
  const active =
    existing?.activeVersion != null
      ? await loadActiveSkillDocument(tx, {
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          skillId: existing.id,
        })
      : null;
  return {
    kind: "skill",
    name: document.name,
    document,
    activeVersion: active?.version ?? null,
    changes: diffConfigDocuments(active?.document ?? null, document),
  };
}

async function previewWorkflow(tx: Database, scope: Scope, source: string): Promise<ConfigImportPreview> {
  const parsed = parseConfigYaml("workflow", source);
  if (parsed.kind !== "workflow") {
    throw new Error("expected workflow document");
  }
  const document = parsed.document;
  const existing = await findWorkflowByName(tx, {
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    name: document.name,
  });
  const active =
    existing?.activeVersion != null
      ? await loadActiveWorkflowDocument(tx, {
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          workflowId: existing.id,
        })
      : null;
  return {
    kind: "workflow",
    name: document.name,
    document,
    activeVersion: active?.version ?? null,
    changes: diffConfigDocuments(active?.document ?? null, document),
  };
}

async function previewPolicy(tx: Database, scope: Scope, source: string): Promise<ConfigImportPreview> {
  const parsed = parseConfigYaml("policy", source);
  if (parsed.kind !== "policy") {
    throw new Error("expected policy document");
  }
  const document = parsed.document;
  const existing = await findPolicyByName(tx, {
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    name: document.name,
  });
  const active =
    existing?.activeVersion != null
      ? await loadActivePolicyDocument(tx, {
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          policyId: existing.id,
        })
      : null;
  return {
    kind: "policy",
    name: document.name,
    document,
    activeVersion: active?.version ?? null,
    changes: diffConfigDocuments(active?.document ?? null, document),
  };
}

/** Validate YAML and show the diff against the active published version. Writes nothing. */
export async function previewConfigImport(
  tx: Database,
  input: Scope & { kind: "skill" | "workflow" | "policy"; source: string },
): Promise<ConfigImportPreview> {
  if (input.kind === "skill") return previewSkill(tx, input, input.source);
  if (input.kind === "policy") return previewPolicy(tx, input, input.source);
  return previewWorkflow(tx, input, input.source);
}

/**
 * Validate, save draft, and publish. Invalid YAML throws before any write.
 * Skill imports require a connector tool catalog.
 */
export async function importConfigYaml(
  tx: Database,
  input: Scope & {
    kind: "skill" | "workflow" | "policy";
    source: string;
    catalog?: readonly ToolCatalogEntry[];
  },
): Promise<ConfigImportResult> {
  if (input.kind === "policy") {
    const preview = await previewPolicy(tx, input, input.source);
    if (preview.kind !== "policy") {
      throw new Error("expected policy document");
    }
    const existing = await findPolicyByName(tx, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      name: preview.document.name,
    });
    const saved = await savePolicyDraft(tx, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      ...(existing ? { id: existing.id } : {}),
      draft: preview.document,
    });
    const published = await publishPolicy(tx, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      id: saved.id,
      publishedBy: input.publishedBy,
    });
    return {
      kind: "policy",
      id: published.policyId,
      name: preview.document.name,
      version: published.version,
      changes: preview.changes,
    };
  }

  if (input.kind === "skill") {
    const preview = await previewSkill(tx, input, input.source);
    const existing = await findSkillByName(tx, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      name: preview.document.name,
    });
    const saved = await saveSkillDraft(tx, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      ...(existing ? { id: existing.id } : {}),
      draft: preview.document,
    });
    const published = await publishSkill(tx, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      id: saved.id,
      publishedBy: input.publishedBy,
      catalog: input.catalog ?? [],
    });
    return {
      kind: "skill",
      id: published.skillId,
      name: preview.document.name,
      version: published.version,
      changes: preview.changes,
    };
  }

  const preview = await previewWorkflow(tx, input, input.source);
  const existing = await findWorkflowByName(tx, {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    name: preview.document.name,
  });
  const saved = await saveWorkflowDraft(tx, {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    ...(existing ? { id: existing.id } : {}),
    draft: preview.document,
  });
  const published = await publishWorkflow(tx, {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    id: saved.id,
    publishedBy: input.publishedBy,
  });
  return {
    kind: "workflow",
    id: published.workflowId,
    name: preview.document.name,
    version: published.version,
    changes: preview.changes,
  };
}

/** Active published document only. Draft columns are never exported. */
export async function exportActiveConfigYaml(
  tx: Database,
  input: {
    tenantId: string;
    workspaceId: string;
    kind: "skill" | "workflow" | "policy";
    id: string;
  },
): Promise<string | null> {
  if (input.kind === "policy") {
    const active = await loadActivePolicyDocument(tx, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      policyId: input.id,
    });
    return active ? serializeConfigYaml(active.document) : null;
  }
  if (input.kind === "skill") {
    const active = await loadActiveSkillDocument(tx, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      skillId: input.id,
    });
    return active ? serializeConfigYaml(active.document) : null;
  }
  const active = await loadActiveWorkflowDocument(tx, {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    workflowId: input.id,
  });
  return active ? serializeConfigYaml(active.document) : null;
}
