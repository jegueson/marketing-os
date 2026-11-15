# Building a read connector

A connector is a package under `connectors/` that implements `Connector` from `@marketing-os/connector-sdk`. The API calls it. Business modules do not import a provider SDK. If a provider needs an HTTP client, keep that client inside the connector package and call it with `fetch`.

Copy `connectors/mock` for the shape of the package, and `connectors/google-analytics` for a real read connector. The mock package shows injected failures. The GA4 package shows OAuth, recorded fixtures, resources, and metric lineage.

Do not call a provider from tests. Record a fixture response and pass it as the `fetch` option. Do not put client secrets, access tokens, or refresh tokens in git, logs, error messages, or URLs.

Production sync stays off until the provider row in [approvals.md](approvals.md) is `approved` (or an explicit test-mode equivalent). Ship the connector behind its feature flag, which defaults to off.

## Package

```text
connectors/<slug>/
  package.json          name @marketing-os/connector-<slug>
  tsconfig.json         extends ../../tsconfig.base.json, types node and vitest/globals
  src/index.ts          public exports
  src/<slug>.ts         Connector class
  src/oauth.ts          token exchange, when the provider uses OAuth
  src/fixtures.ts       recorded responses and a fetch double
  src/<slug>.test.ts    contract kit and fixture tests
```

`pnpm-workspace.yaml` already includes `connectors/*`. Root Vitest already runs `connectors/**/*.test.ts`. Add the package to `apps/api` dependencies and run `pnpm install`.

Export three things the API needs:

- the connector class and a default instance
- the metric keys the sync engine should query, for example `GA4_METRICS`
- the OAuth constants and the token function, when the provider uses OAuth

## Methods

| Method | What it must do |
| --- | --- |
| `metadata` | Stable `slug`, display `name`, `version`, and `capabilities`. Read connectors use `["read"]` plus `"oauth"` when they have a provider. |
| `authSpec` | `none`, `api_key`, or `oauth2`. OAuth includes the authorization URL, token URL, and the exact scopes the consent screen will request. |
| `listResources` | Accounts, properties, or other selectable resources. Use `parentId` when a child belongs to an account. |
| `describeSchema` | Field names and types for one resource. This can be static. Throw `not_found` for an unknown resource. |
| `queryMetrics` | One number for the requested metric and window, with lineage. |
| `health` | `{ status, checkedAt, message }`. Return `error` when the check fails. Do not throw. |
| `listTools` | Read-only tools for a later Ask Marketing surface. |
| `listActions` | Write actions. A read connector returns `[]`. |

`ConnectorContext.credentials` is a string map. The stored OAuth bundle uses `access_token` and `refresh_token`. Read those keys. Do not log the map.

## OAuth and scopes

The shared start, callback, and refresh routes live in `apps/api`. A connector does not add its own callback. It supplies an `OAuthProvider`:

- `authorizationUrl`, `clientId`, and `scopes`
- `exchangeCode` and `refresh`, both implemented in the connector package

Build the provider from Worker env in `apps/api/src/lib/<slug>-oauth.ts`, and select it from `providerFor` in `apps/api/src/routes/oauth.ts`. If the client id or secret is missing, throw `ValidationError` with a message that says the client is not configured. The start route then returns 422.

`beginOAuth` adds PKCE (`code_challenge`, `code_verifier`) and never returns the verifier to the browser. The token function must send `code_verifier` when the provider supports PKCE. The callback stores the token bundle encrypted. The refresh token must not appear in the redirect or the JSON body.

Request only the read scopes the connector uses. The shipped providers are:

| Connector | Scopes | Extra configuration |
| --- | --- | --- |
| GA4 | `https://www.googleapis.com/auth/analytics.readonly` | Shared `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` |
| Google Ads | `https://www.googleapis.com/auth/adwords` | Same Google client, plus `GOOGLE_ADS_DEVELOPER_TOKEN` on each request. The developer token is not stored in the tenant credential row. |
| HubSpot | `crm.objects.contacts.read`, `crm.objects.deals.read` | `HUBSPOT_CLIENT_ID` and `HUBSPOT_CLIENT_SECRET` |
| Meta | `ads_read` | `META_APP_ID` and `META_APP_SECRET`. Exchange the code, then exchange that token with `fb_exchange_token`. Store the long-lived token. |

Add new secret names to `apps/api/worker-configuration.d.ts` and `apps/api/.dev.vars.example`. Leave the example values empty.

## Scopes the user selects

Nothing syncs until the user selects at least one resource. The API refuses an empty selection with `no_scopes_selected`. `listResources` is how the picker knows what may be selected.

The sync engine passes the selected resource ids as `query.dimensions`. Ignore ids that are not yours. If none of them can be queried, throw `invalid_input` with a message that tells the user what to select. If the token cannot read a selected id, throw `permission_changed`.

A parent resource may stand for its children. Google Ads does this: selecting an MCC queries the client accounts under it, once each.

## Pagination

Follow the provider's cursor until it is empty. Stop after a small fixed number of pages, and stop if the same cursor appears twice. If a next-page URL contains an access token, delete that parameter and send the token in the `Authorization` header instead.

## Windows, backfill, and the daily run

The engine owns the schedule. The connector only answers one window.

- The first sync, when there is no cursor, is a 90-day backfill split into three 30-day windows.
- After a window succeeds, the cursor is that window's end.
- A later scheduled run asks for the open window since the cursor. The same connection is not queued again the same day.

`query.from` and `query.to` are ISO timestamps. Treat `to` as exclusive. The shipped connectors use the UTC date of `from` as the inclusive start and the UTC date of `to` minus one millisecond as the inclusive end. Return one `MetricResult` for the whole window. The engine stores that number. It does not ask the connector to split the window by day.

## Rate limits

Map the provider's rate-limit response to:

```ts
throw new ConnectorError("Provider rate limit reached", "rate_limited", true);
```

The third argument marks the error retryable. The sync consumer leaves the run `queued`, increments the attempt, and returns `retry`. Any other `ConnectorError` fails the run and writes a `data_health` row. Build the error message yourself. Do not copy the provider body into it. Provider bodies often echo the token.

## Lineage

Every `MetricResult` needs:

```ts
lineage: {
  source: "ga4",
  fetchedAt: new Date().toISOString(),
  definitionVersion: "1",
}
```

`definitionVersion` must be non-empty. The engine rejects a result without one, and the cockpit drops a point that has none. `source` is the metric namespace (`ga4`, `google_ads`, `hubspot`, `meta`, `mock`), not the formula name. `metric` is the catalog key, such as `ga4.sessions`.

Add that key to `customer-configs/_templates/metrics.yaml` as a source definition with `version: "1"`. `mos setup` seeds platform rows from that file. A second setup run does not duplicate them. Do not change the eight cockpit formulas unless the product owner changes the catalog.

## Error mapping

Throw `ConnectorError`. Catch network failures and map HTTP status before you parse a success body.

| Situation | Code | Retryable |
| --- | --- | --- |
| Missing or blank token | `auth_failed` | no |
| HTTP 401, or the provider says the token expired | `auth_expired` | no |
| The provider revoked the grant | `access_revoked` | no |
| HTTP 403, or the token cannot read the selected resource | `permission_changed` | no |
| The provider's response shape is not the one you recorded | `api_version_error` or `provider_error` | no, unless the provider status is 5xx |
| HTTP 429 or the provider's quota error | `rate_limited` | yes |
| Unknown metric or resource | `not_found` | no |
| The query has no usable selection, or a required app setting is missing | `invalid_input` | no |
| HTTP 5xx, or `fetch` threw | `provider_error` | yes |
| The connector cannot do the operation | `unsupported` | no |

Check required configuration before calling `fetch`. A missing developer token or client secret is `invalid_input` or a `ValidationError` on the OAuth route, not a provider outage.

## Wire it into the API

1. Register the instance in `apps/api/src/deps.ts`.
2. Add the slug to `comingSoon` in `apps/api/src/routes/integrations.ts` if it is not already there.
3. Return the connector's metric keys from `metricsFor` in `apps/api/src/sync/engine.ts`. An unknown slug currently falls through to the mock metric list.
4. Insert an active `connectors` row in a new file under `supabase/migrations/`. Include `slug`, `name`, `category`, `auth_type`, and `supported_scopes`.
5. Keep `connector.<slug>` false. Several flags already exist in `supabase/migrations/20261105102231_0006_sprint1_hardening.sql`. The catalog stays `coming_soon` while the flag is off, and creating a connection returns 422. Turn the flag on only for a sandbox test, not as the default.
6. Update [approvals.md](approvals.md) in the same change when a provider application moves status.

## Contract-test checklist

Write these tests before treating the connector as done. `connectors/google-analytics/src/ga4.test.ts` and `apps/api/src/sync/ga4-sync.test.ts` are the pattern.

- [ ] `runConnectorContract(connector, { metric, dimensions, credentials })` passes against the recorded `fetch`. The default metric is `impressions`, which only the mock connector answers. Pass the catalog key your connector actually serves.
- [ ] `listResources` returns the account and any child the user must be able to select.
- [ ] The same recorded report produces the same number, and the request URL or body matches the provider's documented shape.
- [ ] A result with an empty `definitionVersion` is not returned.
- [ ] HTTP 401 maps to `auth_expired`, 403 to `permission_changed`, and 429 to `rate_limited` with `retryable: true`.
- [ ] The error message does not contain the access token, refresh token, client secret, or developer token. Put the secret in the fixture error body and assert it is absent.
- [ ] A query with no selected resource fails with `invalid_input` and does not call `fetch`.
- [ ] Token exchange uses a recorded token response. The function returns the access token and refresh token the API will store.
- [ ] With the feature flag off, the catalog status is `coming_soon` and creating a connection returns 422.
- [ ] With the flag on, a connection, one explicit scope, and a stored token, the sync consumer writes one `metric_values` row per window and metric. `definitionVersion` is `1`. The ciphertext does not contain the token. A second schedule pass the same day does not queue that connection again.

Run the connector tests and the existing mock sync test. The mock path must keep working.

## References

| Path | Use it for |
| --- | --- |
| `connectors/mock` | Package layout, contract kit, and injected failures |
| `connectors/google-analytics` | Recorded GA4 Admin and Data API calls, OAuth, and lineage |
| `apps/api/src/sync/ga4-sync.test.ts` | Flag, scope gate, and sandbox sync |
| `packages/connector-sdk/src/contract.ts` | What `runConnectorContract` checks |
| [approvals.md](approvals.md) | Whether a provider may sync outside local fixtures |
| [contract.md](contract.md) | Pointer back to this guide |
