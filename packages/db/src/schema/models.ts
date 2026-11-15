import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenancy";

export const modelProviders = ["openrouter", "openai_compatible", "openai", "anthropic"] as const;
export type ModelProvider = (typeof modelProviders)[number];

/** Non-secret tenant model settings. Ciphertext lives in `model_credentials`. */
export const tenantModelConfig = pgTable(
  "tenant_model_config",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    baseUrl: text("base_url"),
    defaultModel: text("default_model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("tenant_model_config_tenant_unique").on(table.tenantId),
    index("idx_tenant_model_config_tenant").on(table.tenantId),
    check(
      "tenant_model_config_provider_check",
      sql`${table.provider} in ('openrouter','openai_compatible','openai','anthropic')`,
    ),
    check(
      "tenant_model_config_base_url_check",
      sql`${table.provider} <> 'openai_compatible' or (${table.baseUrl} is not null and length(trim(${table.baseUrl})) > 0)`,
    ),
  ],
);

/** Sealed model API key. Keep out of selects that only need provider/model. */
export const modelCredentials = pgTable(
  "model_credentials",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    configId: uuid("config_id")
      .notNull()
      .references(() => tenantModelConfig.id, { onDelete: "cascade" }),
    ciphertext: text("ciphertext").notNull(),
    nonce: text("nonce").notNull(),
    keyVersion: text("key_version").notNull(),
    fingerprint: text("fingerprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("model_credentials_tenant_unique").on(table.tenantId),
    unique("model_credentials_config_unique").on(table.configId),
    index("idx_model_credentials_tenant").on(table.tenantId),
  ],
);
