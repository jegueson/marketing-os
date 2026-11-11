/**
 * Web API access goes through the generated OpenAPI client package.
 * Keep this file as a thin re-export so app imports stay stable.
 */
export {
  apiBaseUrl,
  createApiClient,
  publicApi,
  type ApiClient,
  type Envelope,
  type RequestOptions,
  type paths,
  type components,
  type operations,
} from "@marketing-os/api-client";
