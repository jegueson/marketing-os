/** Recorded Google Ads REST payloads. Tests never call Google. */

export const ADS_MCC = "customers/1111111111";
export const ADS_CLIENT = "customers/2222222222";

export const accessibleCustomersFixture = {
  customers: [ADS_MCC],
};

export const customerClientsFixture = {
  results: [
    {
      customerClient: {
        clientCustomer: ADS_MCC,
        descriptiveName: "Test MCC",
        manager: true,
        level: "0",
      },
    },
    {
      customerClient: {
        clientCustomer: ADS_CLIENT,
        descriptiveName: "Test account",
        manager: false,
        level: "1",
      },
    },
  ],
};

export const spendReportFixture = {
  results: [{ metrics: { costMicros: "85500000" } }],
};

export const conversionsReportFixture = {
  results: [{ metrics: { conversions: 12 } }],
};

export function recordedAdsFetch(): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";
    if (url.endsWith("/customers:listAccessibleCustomers")) return Response.json(accessibleCustomersFixture);
    if (url.includes("/googleAds:search") && body.includes("customer_client")) return Response.json(customerClientsFixture);
    if (body.includes("metrics.cost_micros")) return Response.json(spendReportFixture);
    if (body.includes("metrics.conversions")) return Response.json(conversionsReportFixture);
    return new Response("not found", { status: 404 });
  };
}
