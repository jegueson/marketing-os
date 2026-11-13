# Investor demo script

A 12–15 minute walkthrough that follows the built-in tour (17 steps). Start at `/demo` and press **Start the investor tour**. Use **Next** or → to advance, ← to go back, Esc to leave. The page stays clickable while the tour is open.

The step titles below match the tour cards (`apps/web/src/demo/tour/steps.ts`).

## Before the meeting

- Run the app on branch `demo/investor` and open `/demo` once so the first page load is warm.
- Pick the theme. Dark suits a projector; light suits a bright room.
- Reload before the meeting. Every click is local and resets on reload.
- Say early that the company and numbers are fictional.

## Opening (landing page, 1 minute)

> Marketing OS is the daily place every marketer opens. It connects the stack they already have, shows work in Today and the cockpit, answers questions, tracks competitors, creates with AI tools they already use, runs influencer programmes, and automates recurring work — with human approval when the action is risky. Teams keep n8n, Zapier or Make; Marketing OS integrates with them instead of replacing them.

Point at the thesis chain and the four offers (Community, Expert Services, Cloud, Enterprise).

## The tour

| # | Screen | Tour card | Talking point | Optional action |
| --- | --- | --- | --- | --- |
| 1 | Onboarding | Start from the stack the team already uses | No migration. Sources connect read-only. | Toggle a source tile. |
| 2 | Today | Every marketer opens Today | Role switcher: CMO, Performance, Creative, CRM, Specialist. Queue is personal. | Switch to Creative. |
| 3 | Cockpit | One cockpit for the whole marketing function | €1.24M pipeline, 842 SQLs, €212 blended CAC, 4.2× ROAS. | — |
| 4 | Cockpit | Meaningful change, not every metric | This period against the last. | Switch 30d / 14d / 7d. |
| 5 | Cockpit | The attention queue does the watching | Anomalies ranked by impact. | — |
| 6 | Cockpit | Recommendations with evidence and confidence | Shift €18K Meta → Search: +€64K pipeline / month. | Press **Approve**. |
| 7 | Ask Marketing | Ask Marketing: answers from your own data | Scripted answers from tenant data. | Ask "Which campaigns are inefficient?" |
| 8 | Ask Marketing | Every answer shows its working | Intent, definitions, sources, SQL, validation. | — |
| 9 | Performance | Deep modules for each marketing area | One metric layer across modules. | Sort the campaign table. |
| 10 | Intelligence | Market intelligence and competitors | Flowly, Orbit, Pulseboard vs Acme. Official / licensed data only. | — |
| 11 | Studio | Creative studio with AI tools you already use | Runway / Higgsfield / ComfyUI as connectors. BYOK. | Press **Generate with Runway**. |
| 12 | Influencers | Influencer marketing in the same OS | Skeepers-shaped discovery and EUR attributed results. | Filter niche to B2B SaaS. |
| 13 | Automations | Recurring work becomes governed workflows | Weekly paid-media review stops at approval. | Press **Run now**. |
| 14 | Automations | Keep n8n, Zapier or Make | Signed events out, scoped actions in. No embedded editor. | — |
| 15 | Approvals | Risky actions wait for an approval | Default autonomy is observe. | Press **Approve** or **Reject**. |
| 16 | Integrations | Connectors with health you can see | Freshness and reconnect states. | Press **Reconnect**. |
| 17 | Console | Specialists tailor skills, agents and prompts | Expert Services land here. | Change an agent's autonomy. |

## Close (1 minute)

> The core is open source. Revenue comes from hosted cloud credits, specialist configuration, and enterprise licences. After the pilot, Workspace expansion builds the integration API, Today, intelligence, studio and influencer connectors in that order — without changing Sprint 2–5.

## Likely questions

| Question | Where to show it |
| --- | --- |
| Is this only a CMO dashboard? | Today + role switcher. |
| Do you rebuild Zapier? | Automations external panel; ADR-0022. |
| How do creatives use Runway? | Studio; BYOK connectors; ADR-0023. |
| Competitor data — scraped? | Intelligence: official APIs and licensed providers only. |
| Influencer payouts? | Influencers: deep-link to the source platform; MOS is not a payout system. |
