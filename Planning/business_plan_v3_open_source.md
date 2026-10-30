# Marketing OS
## Business Plan v3 — Open-core distribution
### October 2026

This revision changes **how the product is distributed and sold**. The company thesis, category, ICP, delivery roles and the marketing problem in [agentic_marketing_os_business_plan_v2.md](agentic_marketing_os_business_plan_v2.md) stay in force unless this document says otherwise.

---

# 1. What changed

Version 2 sold a managed service with no public signup. Version 3 keeps that commercial motion and adds an open-source distribution layer in front of it.

The software is published on GitHub under **AGPL-3.0**. A team can install it, connect its own model, and build its own skills. Revenue comes from specialist work and from a hosted cloud that sells AI usage, not from locking the product.

Positioning line:

> Connect your marketing stack. Run the operating system yourself, or let us run it and shape the skills for you.

The company is still an **AI Marketing Operating Company**. The product is still **Marketing OS**. Open source is the distribution channel, not a change of category.

---

# 2. Offers

## Community (free)

The full product: cockpit, connectors, Ask Marketing, skills, agents, workflows, automations, approvals and audit.

The user:

- hosts it (own Cloudflare account, or locally on their machine),
- writes or adapts skills,
- brings a model key (OpenRouter, or any OpenAI-compatible endpoint, OpenAI, or Anthropic).

Support is GitHub Discussions and the docs. There is no SLA.

## Expert Services (paid)

The v2 delivery model, sold as a service on top of the software.

A Success Manager and an AI Marketing Specialist:

- run discovery and a Marketing Operating Audit,
- connect the stack,
- design skills, prompts, agents, workflows and automations,
- keep improving them.

This works on the customer's self-hosted install or on Marketing OS Cloud.

Indicative transformation engagement: **€15k–€75k+**, then specialist capacity on a recurring contract. These remain hypotheses to validate with the first ten customers (same ranges as v2 section 12).

## Marketing OS Cloud (paid)

Managed hosting by the company. Multi-tenant. The customer buys **AI agent credits** (packs or a monthly commitment) instead of bringing a key. Optional managed specialist capacity sits on the same contract.

Indicative platform plus capacity: **€50k–€300k+ ARR**, enterprise **€250k–€1M+**, as in v2. Credit price is set as a margin over model cost and is not the headline. The headline stays business complexity: systems connected, markets, use cases, specialist capacity.

There is still **no public checkout and no self-service signup**. A cloud workspace is provisioned after a lead and a commercial step.

## Enterprise

A commercial licence that exempts the buyer from AGPL obligations for their deployment, plus SSO, an SLA and priority support. This exists so companies that will not accept AGPL can still buy the product. It requires a contributor licence agreement on the public repo so the company can grant that exemption.

---

# 3. Why open source

- The cockpit and the connector layer get more useful as more people run them and contribute connectors and skills.
- Self-hosting removes the "our data cannot leave our cloud" objection that blocks the first enterprise conversations.
- The moat in v2 section 28 does not depend on hiding the code. It depends on the marketing graph, the ontology, the skill library, specialist know-how and outcome history. Those still accumulate fastest where specialists operate the system.
- GitHub is the top of the funnel. The lead form stays the door into paid work.

## What must stay true

The business does not become a low-touch SaaS company. The economic goal is still **customer value delivered per specialist** (v2 section 27). Self-hosters who never buy anything are a distribution cost, accepted because some of them become services or cloud customers and because their connectors and skills improve the product.

---

# 4. Sales motion

```text
GitHub / content / referral
        ↓
Reads the docs, self-hosts, or asks for help
        ↓
Lead form: expert help, cloud workspace, or enterprise licence
        ↓
Success Manager discovery
        ↓
Marketing Operating Audit
        ↓
Proposal: services, cloud, or both
        ↓
Connect stack → cockpit → tailored skills → managed operation
        ↓
Expansion by use case
```

Self-hosters skip the lead form until they want a human. The in-product path for them is the setup wizard, not a signup.

Do not sell "agents". Sell the same outcomes as v2 section 24: less recurring reporting, faster decisions, less agency dependency, more output per marketer.

---

# 5. Open-core boundary

| In the public AGPL repo | In the private cloud package |
| --- | --- |
| Product: cockpit, Ask Marketing, connectors, skills, agents, workflows, automations, policies, approvals, audit, multi-tenancy, specialist console, lead intake, Success Manager workspace | Stripe (or equivalent) credit purchase |
| Model gateway and bring-your-own-key | Platform model key and credit balance enforcement |
| Usage ledger and per-tenant budget caps | Invoices, tax, dunning |
| `BillingProvider` interface with a no-op implementation | The billing implementation |
| `ProvisioningHooks` for "tenant created" | Automated cloud provisioning and ops dashboards |
| Starter skill library and docs | Hosted marketing site |

Rule: if a self-hoster needs it to run Marketing OS, it is public. If it only exists to charge for the hosted service, it is private.

The public repo never imports the private package. The private package depends on the public interfaces.

---

# 6. Pricing architecture

Unchanged from v2 section 13, with one addition.

**Platform fee (cloud only) + transformation fee + managed specialist capacity + AI credits.**

Credits are prepaid usage of the platform model gateway. They are not the primary message. A self-hoster who brings their own key pays the model vendor directly and pays the company nothing unless they buy services or a commercial licence.

Avoid token pricing as the story. Use credits as the meter inside the cloud contract.

---

# 7. Delivery organisation

Unchanged from v2 section 11.

- Success Manager: relationship, discovery, adoption, value.
- AI Marketing Specialist: skills, workflows, QA, optimisation. This role is the paid product for self-hosters.
- Platform engineering: the open-source core plus the private cloud package.

Year-1 shape in v2 section 30 still applies. Add "open-source maintainer time" inside the engineering line. Community support is docs-first. Paid support is a contract, not a GitHub issue.

---

# 8. 36-month roadmap (replaces v2 section 33 timing for distribution)

Product phases stay aligned with the PRD. Distribution milestones:

| When | Distribution |
| --- | --- |
| Sprint 1 | Repo exists. Private until the skeleton journey works, then public as pre-alpha. |
| Sprint 3 | `v0.1.0-alpha`: cockpit plus Ask Marketing with bring-your-own-key. Announce. |
| After Sprint 3 | Private cloud: credit packs, provisioning from the lead flow, billing UI. |
| Sprint 4 | Starter skill library and a public "writing skills" guide. |
| Sprint 5 | `v0.2.0`: first governed automations. First design partner on services or cloud. |
| Months 12–36 | Industry skill packs, more connectors from the community, enterprise licence, geographic expansion. Same ambition as v2. |

The v2 revenue table (section 29) stays an illustration, not a forecast. Self-host installs are not counted as customers. Customers are organisations on a services or cloud contract.

---

# 9. Metrics added to v2 section 34

- GitHub stars, contributors, merged external pull requests.
- Documented self-host installs (opt-in ping only; off by default).
- Self-host to services or cloud conversion.
- Credits sold, credits consumed, credit gross margin.
- Time from lead to first paid contract.

Unchanged: time-to-cockpit, hours absorbed, ARR, NRR, revenue per specialist.

---

# 10. Risks added to v2 section 32

| Risk | Mitigation |
| --- | --- |
| Cloud revenue is cannibalised by self-hosting | The paid product is specialist judgment and operated reliability, not a licence key. |
| Enterprises refuse AGPL | Commercial licence. CLA so the company can grant it. |
| Community support consumes the founder | `SUPPORT.md` draws the line. Bugs and docs in GitHub. Design and SLAs are paid. |
| A fork offers a competing host | AGPL obliges them to publish modifications. Trademark policy stops them using the name and logo. |
| Credit pricing is wrong | Validate margin with the first cloud customers before publishing a price list. |

---

# 11. Investor narrative change

Slides 1–8 and 10–12 of v2 section 35 stay. Replace slide 9:

> Open core. The operating system is free to run (AGPL). We sell specialist capacity, a managed cloud with AI credits, and an enterprise licence. The code distributes itself. The operating know-how is the company.

---

# 12. Principle

Version 2 said: do not say "we provide AI marketing agents."

Version 3 adds: do not say "we are an open-source project" as the whole story.

Say:

> We published the marketing operating system. You can run it. When you want it shaped around your business, we do that with you. When you do not want to run it, we run it and you buy the usage.
