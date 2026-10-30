# Commercial offers

The software in this repository is free under [AGPL-3.0](LICENSE). The business around it has three paid offers. None of them are implemented as checkout in this repo.

## Expert services

A marketing specialist works with you to connect your stack, define KPIs, and build the skills, prompts and workflows your team actually repeats. This can be on your self-hosted install or on the cloud.

This is the main reason the company exists. The code distributes the cockpit. The specialist absorbs the recurring work.

## Marketing OS Cloud

We run Marketing OS. You buy AI credits and, if you want, specialist capacity. There is no public signup and no self-service checkout. A workspace is provisioned after a conversation.

Credit purchase, invoices and the platform model key live in a private package. This repository defines the interfaces (`BillingProvider`, usage ledger, budget caps) and ships a no-op billing implementation so self-hosters are not blocked.

## Enterprise licence

Some organisations cannot accept the AGPL for a deployment they modify or combine with proprietary software. A commercial licence is available. It requires the contributor licence agreement described in [docs/cla.md](docs/cla.md) so the maintainer has the rights to grant it.

The enterprise offer can include SSO and an SLA. Those are contracts, not features hidden in this tree.

## What stays in this repository

If a self-hoster needs it to run the product, it belongs here: the cockpit, Ask Marketing, connectors, the specialist console, multi-tenancy, approvals, the model gateway, and bring-your-own-key.

## How to talk to us

Open a lead with the intent "expert services", "cloud workspace", or "enterprise licence" once the lead form exists (task S1-T21). Until that form is deployed, contact the GitHub account that owns this repository.

Do not send marketing data, credentials or production exports in a first email.
