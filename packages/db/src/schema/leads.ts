import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { profiles, tenants } from "./tenancy";

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    companyName: text("company_name").notNull(),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    jobTitle: text("job_title"),
    country: text("country"),
    industry: text("industry"),
    teamSizeRange: text("team_size_range"),
    channels: text("channels").array().notNull().default(sql`'{}'`),
    techStack: text("tech_stack").array().notNull().default(sql`'{}'`),
    majorProblem: text("major_problem"),
    objectives: text("objectives"),
    spendRange: text("spend_range"),
    agencyUsage: text("agency_usage"),
    intent: text("intent").notNull().default("expert_services"),
    status: text("status").notNull().default("new"),
    assignedTo: uuid("assigned_to").references(() => profiles.id),
    convertedTenantId: uuid("converted_tenant_id").references(() => tenants.id),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_leads_status").on(table.status),
    index("idx_leads_email").on(table.email),
    check(
      "leads_status_check",
      sql`${table.status} in ('new','contacted','discovery','qualified','converted','disqualified','archived')`,
    ),
    check(
      "leads_intent_check",
      sql`${table.intent} in ('expert_services','cloud_workspace','enterprise_licence')`,
    ),
  ],
);

export const leadBriefs = pgTable(
  "lead_briefs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    freeText: text("free_text"),
    structuredData: jsonb("structured_data"),
    source: text("source").notNull().default("lead_form"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_lead_briefs_lead_id").on(table.leadId)],
);

export const leadSources = pgTable(
  "lead_sources",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    referrerUrl: text("referrer_url"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_lead_sources_lead_id").on(table.leadId)],
);

export const successManagerNotes = pgTable(
  "success_manager_notes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id),
    noteType: text("note_type").notNull().default("general"),
    body: text("body").notNull(),
    isPinned: boolean("is_pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_sm_notes_lead_id").on(table.leadId),
    index("idx_sm_notes_tenant_id").on(table.tenantId),
  ],
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    stage: text("stage").notNull().default("discovery"),
    businessProblems: text("business_problems"),
    stackMap: jsonb("stack_map"),
    pilotObjectives: text("pilot_objectives"),
    desiredOutcomes: text("desired_outcomes"),
    recommendedIntegrations: text("recommended_integrations")
      .array()
      .default(sql`'{}'`),
    ownerId: uuid("owner_id").references(() => profiles.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_opportunities_lead_id").on(table.leadId)],
);
