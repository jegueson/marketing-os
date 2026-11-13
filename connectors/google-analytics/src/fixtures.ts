/** Recorded GA4 Admin and Data API payloads. Tests never call Google. */

export const SANDBOX_ACCOUNT = "accounts/100";
export const SANDBOX_PROPERTY = "properties/456";

export const accountSummariesFixture = {
  accountSummaries: [
    {
      name: "accountSummaries/100",
      account: SANDBOX_ACCOUNT,
      displayName: "Sandbox account",
      propertySummaries: [
        {
          property: SANDBOX_PROPERTY,
          displayName: "Sandbox property",
          propertyType: "PROPERTY_TYPE_ORDINARY",
        },
      ],
    },
  ],
};

export const sessionsReportFixture = {
  metricHeaders: [{ name: "sessions", type: "TYPE_INTEGER" }],
  rows: [{ metricValues: [{ value: "120" }] }],
  rowCount: 1,
  kind: "analyticsData#runReport",
};

export const keyEventsReportFixture = {
  metricHeaders: [{ name: "keyEvents", type: "TYPE_INTEGER" }],
  rows: [{ metricValues: [{ value: "4" }] }],
  rowCount: 1,
  kind: "analyticsData#runReport",
};

export function recordedGa4Fetch(): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";
    if (url.includes("/accountSummaries")) {
      return Response.json(accountSummariesFixture);
    }
    if (url.includes(":runReport")) {
      const metric = (JSON.parse(body) as { metrics?: { name?: string }[] }).metrics?.[0]?.name;
      if (metric === "keyEvents") return Response.json(keyEventsReportFixture);
      if (metric === "sessions") return Response.json(sessionsReportFixture);
    }
    return new Response("not found", { status: 404 });
  };
}
