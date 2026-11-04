# Building a connector

Connectors implement `@marketing-os/connector-sdk` `Connector`. They must not import provider SDKs into business modules; keep SDKs inside the connector package.

## Contract

1. Export a class implementing `Connector`.
2. Pass `runConnectorContract(connector)` in your package tests.
3. Register the slug in the `connectors` table / seed.

## Methods

| Method | Purpose |
| --- | --- |
| `metadata` | slug, name, version, capabilities |
| `authSpec` | none / api_key / oauth2 |
| `listResources` | discoverable resources |
| `describeSchema` | field types for a resource |
| `queryMetrics` | metric values with lineage |
| `health` | ok / degraded / error |
| `listTools` | read tools for Ask Marketing |
| `listActions` | write actions with risk/approval |

## Failure modes

Throw `ConnectorError` with a typed code. Mark retryable errors for queue backoff.

## Sprint 1 reference

See `connectors/mock` for deterministic fixtures and injected failure modes.
