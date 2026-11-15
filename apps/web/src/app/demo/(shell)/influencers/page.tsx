"use client";

import { Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/demo/components/ui/badges";
import { Card } from "@/demo/components/ui/card";
import { PageHeader } from "@/demo/components/ui/page-header";
import { Stagger } from "@/demo/components/ui/reveal";
import {
  CREATOR_COUNTRIES,
  CREATOR_NICHES,
  CREATOR_PLATFORMS,
  CREATORS,
  INFLUENCER_CAMPAIGNS,
  INFLUENCER_RESULTS,
} from "@/demo/data/influencers";
import { filterCreators } from "@/demo/lib/filter-creators";
import { formatCompactEur, formatNumber } from "@/demo/lib/format";

const STAGE_TONE = {
  Discovery: "neutral",
  Briefed: "primary",
  Live: "success",
  Reporting: "violet",
} as const;

export default function InfluencersPage() {
  const [query, setQuery] = useState("");
  const [niche, setNiche] = useState<string>("All");
  const [platform, setPlatform] = useState<string>("All");
  const [country, setCountry] = useState<string>("All");
  const [minFollowers, setMinFollowers] = useState(0);

  const filtered = useMemo(
    () => filterCreators(CREATORS, { query, niche, platform, country, minFollowers }),
    [query, niche, platform, country, minFollowers],
  );

  return (
    <>
      <PageHeader
        title="Influencer marketing"
        subtitle="Discover creators, run campaigns and read performance from Skeepers and similar platforms — in the shared metric layer."
      />
      <Stagger className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {INFLUENCER_CAMPAIGNS.map((c) => (
            <Card key={c.id} bodyClassName="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{c.name}</p>
                <Badge tone={STAGE_TONE[c.stage]}>{c.stage}</Badge>
              </div>
              <p className="text-xs text-muted">{c.platform} · {c.creators} creators</p>
              <p className="text-sm">
                Budget <span className="font-semibold tabular">{formatCompactEur(c.budgetEur)}</span>
              </p>
              <p className="text-xs text-muted">
                Attributed pipeline <span className="font-medium text-fg tabular">{formatCompactEur(c.pipelineEur)}</span>
              </p>
            </Card>
          ))}
        </div>

        <Card
          tour="influencers-search"
          title="Creator discovery"
          icon={<Users />}
          bodyClassName="space-y-4"
        >
          <div className="flex flex-wrap gap-2">
            <label className="relative min-w-[200px] flex-1">
              <span className="sr-only">Search creators</span>
              <Search aria-hidden="true" className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or niche"
                className="focus-ring w-full rounded-lg border border-border bg-surface-2/60 py-2 pr-3 pl-9 text-sm"
              />
            </label>
            <Select label="Niche" value={niche} onChange={setNiche} options={CREATOR_NICHES} />
            <Select label="Platform" value={platform} onChange={setPlatform} options={CREATOR_PLATFORMS} />
            <Select label="Country" value={country} onChange={setCountry} options={CREATOR_COUNTRIES} />
            <label className="text-xs text-muted">
              Min followers
              <input
                type="number"
                min={0}
                step={1000}
                value={minFollowers || ""}
                onChange={(e) => setMinFollowers(Number(e.target.value) || 0)}
                className="focus-ring mt-1 block w-28 rounded-lg border border-border bg-surface-2/60 px-2 py-2 text-sm tabular"
              />
            </label>
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {filtered.length} creator{filtered.length === 1 ? "" : "s"} match the filters.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="py-2.5 pr-3 font-medium">Creator</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Niche</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Platform</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Followers</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Engagement</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Fit</th>
                  <th scope="col" className="py-2.5 pl-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
                    <td className="py-3 pr-3 font-medium">{c.name}</td>
                    <td className="px-3 py-3 text-muted">{c.niche}</td>
                    <td className="px-3 py-3 text-muted">{c.platform}</td>
                    <td className="px-3 py-3 tabular">{formatNumber(c.minFollowers)}</td>
                    <td className="px-3 py-3 tabular">{c.engagement}%</td>
                    <td className="px-3 py-3 font-semibold tabular">{c.fit}</td>
                    <td className="py-3 pl-3"><Badge tone="violet">{c.source}</Badge></td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-muted">No creators match these filters.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Campaign results · EUR attributed" icon={<Users />} bodyClassName="px-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-2.5 font-medium">Creator</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Deliverable</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Reach</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Engagement</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Attributed</th>
                </tr>
              </thead>
              <tbody>
                {INFLUENCER_RESULTS.map((r) => (
                  <tr key={r.creator} className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
                    <td className="px-5 py-3 font-medium">{r.creator}</td>
                    <td className="px-3 py-3 text-muted">{r.deliverable}</td>
                    <td className="px-3 py-3 tabular">{formatNumber(r.reach)}</td>
                    <td className="px-3 py-3 tabular">{r.engagement}%</td>
                    <td className="px-5 py-3 font-semibold text-accent tabular">{formatCompactEur(r.attributedEur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Stagger>
    </>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="text-xs text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring mt-1 block rounded-lg border border-border bg-surface-2/60 px-2 py-2 text-sm text-fg"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
