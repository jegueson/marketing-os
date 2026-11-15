/** Recorded HubSpot CRM payloads. Tests never call HubSpot. */

export const HUBSPOT_PORTAL = "portals/12345678";

export const accountDetailsFixture = {
  portalId: 12345678,
  accountType: "SANDBOX",
  companyCurrency: "EUR",
  uiDomain: "app-eu1.hubspot.com",
};

export const contactsSearchFixture = {
  total: 4,
  results: [{ id: "101", properties: { createdate: "2026-10-02T00:00:00.000Z" } }],
};

export const qualifiedDealsSearchFixture = {
  total: 1,
  results: [{ id: "501", properties: { dealstage: "qualifiedtobuy" } }],
};

export function recordedHubSpotFetch(): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";
    if (url.endsWith("/account-info/v3/details")) return Response.json(accountDetailsFixture);
    if (url.endsWith("/contacts/search")) return Response.json(contactsSearchFixture);
    if (url.endsWith("/deals/search") && body.includes("qualifiedtobuy")) return Response.json(qualifiedDealsSearchFixture);
    return new Response("not found", { status: 404 });
  };
}
