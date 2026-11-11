# Investor demo script

A 10–12 minute walkthrough that follows the built-in tour. Start at `/demo` and press **Start the investor tour**. Use **Next** or → to advance, ← to go back, Esc to leave. The page stays clickable while the tour is open, so you can press the highlighted buttons as you talk.

The step titles below match the tour cards (`apps/web/src/demo/tour/steps.ts`). The talking points are suggestions; the screen carries the numbers.

## Before the meeting

- Run the app and open `/demo` once so the first page load is warm.
- Pick the theme. Dark suits a projector; light suits a bright room. The toggle is in the top bar.
- Reload before the meeting. Every click (approvals, toggles, connects) is local and resets on reload.
- Say early that the company and numbers are fictional. Every page footer says so too.

## Opening (landing page, 1 minute)

> Marketing teams run on a dozen tools and a spreadsheet on Monday morning. Marketing OS connects the stack they already have, shows it in one cockpit, answers questions about it, and automates the recurring work, with a human approval when the action is risky.

Point at the thesis chain: Connect → Understand → Display → Ask → Design → Automate → Execute → Measure → Improve. The tour follows that order.

Point at the four offers at the bottom: free self-hosted Community edition, Expert Services, the hosted Cloud with AI credits, and Enterprise.

## The tour

| # | Screen | Tour card | Talking point | Optional action |
| --- | --- | --- | --- | --- |
| 1 | Onboarding | Start from the stack the team already uses | No migration and no new data warehouse. Sources connect read-only. | Toggle a source tile. |
| 2 | Cockpit | One cockpit for the whole marketing function | €1.24M pipeline, 842 SQLs, €212 blended CAC, 4.2× ROAS. Each KPI shows its target, source and freshness. | — |
| 3 | Cockpit | Meaningful change, not every metric | This period against the last, at a glance. | Switch 30d / 14d / 7d. |
| 4 | Cockpit | The attention queue does the watching | Meta CPA up 32%, a delayed GA4 sync, a /pricing drop, an SEO opportunity, ranked by impact. | — |
| 5 | Cockpit | Recommendations with evidence and confidence | "Shift €18K from Meta retargeting to Google Search: +€64K pipeline a month." Problem, evidence, impact, effort, owner. | Press **Approve**. |
| 6 | Ask Marketing | Ask Marketing: answers from your own data | "Why did qualified leads decline last week?" The answer names the cause and quantifies it. | Ask "Which campaigns are inefficient?" |
| 7 | Ask Marketing | Every answer shows its working | Intent, metric definitions, sources, the SQL, validation. This is why a CMO can trust it. | — |
| 8 | Performance | Deep modules for each marketing area | Performance, Organic and Retention read one metric layer, so the numbers agree. | Sort the campaign table. |
| 9 | Automations | Recurring work becomes governed workflows | The weekly paid-media review: schedule, analyst agent, policy check, then a human. | Press **Run now** and watch it stop at the approval. |
| 10 | Approvals | Risky actions wait for an approval | Default autonomy is observe. The reviewer sees evidence, the exact change and the policy. | Press **Approve** or **Reject**. |
| 11 | Integrations | Connectors with health you can see | Freshness, scopes and status per source. Customer.io needs a reconnect, and the product says so. | Press **Reconnect**. |
| 12 | Console | Specialists tailor skills, agents and prompts | Expert Services and the community build here: skills with eval scores, agent autonomy, versioned prompts. | Change an agent's autonomy. |

## Close (1 minute)

> The core is open source, so teams can self-host and trust what runs on their data. Revenue comes from the hosted cloud with AI credits, from specialists who configure it for each customer, and from enterprise licences.

Leave the cockpit on screen for questions.

## Likely questions

| Question | Where to show it |
| --- | --- |
| Is the data real? | No. The footer and landing page say so. The demo shows the planned product on fictional data. |
| What stops an agent from spending money? | Approvals screen: the policy and the default "observe" autonomy. |
| How do you know an answer is right? | Ask Marketing evidence panel: definitions, sources, query, validation. |
| What happens when a connector breaks? | Integrations: the Customer.io "Needs reconnect" card and the data-health table; the cockpit attention queue flags the delayed GA4 sync. |
| How do you make money if it is open source? | Landing page offers, and the AI credits stat on Automations. |

## If something goes wrong

- The tour card is in the way: press Esc. Restart it with **Investor tour** in the top bar.
- A screen looks stuck mid-animation: reload. All data is local.
- Someone asks an unscripted question in Ask Marketing: the reply lists the four supported questions; pick one.
