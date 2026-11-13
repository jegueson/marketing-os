/** Pure filter for the Influencer marketing demo table. */

export type CreatorFilterable = {
  name: string;
  niche: string;
  platform: string;
  minFollowers: number;
  country: string;
};

export type CreatorFilter = {
  query?: string;
  niche?: string;
  platform?: string;
  minFollowers?: number;
  country?: string;
};

export function filterCreators<T extends CreatorFilterable>(
  creators: readonly T[],
  filter: CreatorFilter,
): T[] {
  const q = filter.query?.trim().toLowerCase() ?? "";
  const niche = filter.niche?.trim().toLowerCase() ?? "";
  const platform = filter.platform?.trim().toLowerCase() ?? "";
  const country = filter.country?.trim().toLowerCase() ?? "";
  const minFollowers = filter.minFollowers ?? 0;

  return creators.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q) && !c.niche.toLowerCase().includes(q)) return false;
    if (niche && niche !== "all" && c.niche.toLowerCase() !== niche) return false;
    if (platform && platform !== "all" && c.platform.toLowerCase() !== platform) return false;
    if (country && country !== "all" && c.country.toLowerCase() !== country) return false;
    if (c.minFollowers < minFollowers) return false;
    return true;
  });
}
