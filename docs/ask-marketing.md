# Ask Marketing

Ask answers a question from metrics this workspace has already synced. The server reads the numbers. The model does not receive another tenant's data, and it does not write the digits. The visible observation line is filled from the tool result.

The `ask_marketing` flag ships **off**. A new install has no Ask link until you enable the flag. That is the v0.1.0-alpha default. Do not turn it on in the migration.

## Before you ask

1. Finish [self-hosting.md](self-hosting.md), including a model that passes **Test connection**.
2. Sign in as a workspace admin (`customer_admin`).
3. Open **Integrations**. Connect **Mock**. Select the demo account. Choose **Step 3: save and test connection**. The cockpit should show live data.
4. Enable Ask:

```bash
psql "$DATABASE_URL" -c "update feature_flags set is_enabled = true where key = 'ask_marketing';"
```

5. Reload the portal. **Ask** appears in the nav for roles with `ask:use` (`customer_admin` and `customer_user`).

## First answer

1. Open **Ask**.
2. Choose **New conversation**. Title it `Spend`.
3. In **Question**, type `How much did we spend?` and choose **Ask**.
4. The panel shows three stages: Query plan, Validation, Answer.
5. **Observed** shows a line from the tool result, such as `mock.spend: 2550`, when the model plans the mock spend metric and the latest sync window covers the last 30 days.
6. **Evidence** shows the metric key, definition version, freshness, and any warning such as `partial coverage`.
7. **Interpretation** is the model's sentence. It does not introduce a second number.
8. Reload the thread. The question and the assistant line are still there.

A refusal (out of scope, missing data, campaign or channel breakout) is a normal result. The page shows the refusal and its suggestion. It does not invent a figure.

## What the model sees

The plan call receives the question. The server checks the plan against this tenant's metric keys, then runs the tools. The answer call receives the question and ref labels such as `o1 mock.spend`. It does not receive the numeric value. The server writes that value into the observation.

Do not paste every metric label into the question. Labels from other tenants must not enter the prompt. The cross-tenant check is `apps/api/src/routes/ask-tenant-isolation.test.ts`.

## Limits in this alpha

- One hard or warn monthly budget per tenant, in micro-USD, on **Models**. A hard cap of `0` returns HTTP 402 before the provider is called.
- Ask is limited to 30 requests per minute per user when `ASK_RATE_LIMITER` is bound. Without the binding, the API uses the same limit in memory.
- No text-to-SQL. A question about campaign, channel, or creative is refused before a model call.
- No live eval gate. `pnpm eval:ask` replays 31 scripted questions. A nightly live run only prints a pass rate.
- Cockpit recommendations are not generated yet.

## Check the install

```bash
pnpm test
pnpm test:e2e
pnpm eval:ask
```

`pnpm test:e2e` includes `e2e/tests/sprint3.api.test.ts`, which is the stub-model journey. The browser spec only checks that Ask is hidden while the flag is off.
