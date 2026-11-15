/** Recorded Marketing API payloads. Tests never call Meta. */

export const META_ACCOUNT = "act_1111111111";

export const adAccountsFixture = {
  data: [{ id: META_ACCOUNT, name: "Test ad account", account_status: 1 }],
};

export const insightsFixture = {
  data: [{ spend: "42.5", impressions: "1000", date_start: "2026-10-01", date_stop: "2026-10-30" }],
};

export function recordedMetaFetch(): typeof fetch {
  return async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/me/adaccounts")) return Response.json(adAccountsFixture);
    if (url.pathname.endsWith("/insights")) return Response.json(insightsFixture);
    return new Response("not found", { status: 404 });
  };
}
