/** Influencer marketing — creators and campaigns for the investor demo. */

import type { CreatorFilterable } from "@/demo/lib/filter-creators";

export type Creator = CreatorFilterable & {
  id: string;
  engagement: number;
  fit: number;
  source: string;
};

export const CREATORS: readonly Creator[] = [
  { id: "cr1", name: "Nora Klein", niche: "B2B SaaS", platform: "LinkedIn", minFollowers: 42_000, country: "DE", engagement: 4.8, fit: 92, source: "Skeepers" },
  { id: "cr2", name: "Jules Martin", niche: "Productivity", platform: "YouTube", minFollowers: 180_000, country: "FR", engagement: 3.1, fit: 84, source: "Skeepers" },
  { id: "cr3", name: "Aya Rahman", niche: "B2B SaaS", platform: "TikTok", minFollowers: 95_000, country: "NL", engagement: 6.4, fit: 88, source: "Modash" },
  { id: "cr4", name: "Sam Ortega", niche: "DevTools", platform: "LinkedIn", minFollowers: 28_000, country: "ES", engagement: 5.2, fit: 79, source: "Upfluence" },
  { id: "cr5", name: "Elena Vogt", niche: "Ops", platform: "Instagram", minFollowers: 61_000, country: "AT", engagement: 4.1, fit: 81, source: "Skeepers" },
  { id: "cr6", name: "Theo Blake", niche: "Productivity", platform: "YouTube", minFollowers: 240_000, country: "IE", engagement: 2.7, fit: 73, source: "Modash" },
];

export const CREATOR_NICHES = ["All", "B2B SaaS", "Productivity", "DevTools", "Ops"] as const;
export const CREATOR_PLATFORMS = ["All", "LinkedIn", "YouTube", "TikTok", "Instagram"] as const;
export const CREATOR_COUNTRIES = ["All", "DE", "FR", "NL", "ES", "AT", "IE"] as const;

export type InfluencerCampaign = {
  id: string;
  name: string;
  stage: "Discovery" | "Briefed" | "Live" | "Reporting";
  creators: number;
  budgetEur: number;
  pipelineEur: number;
  platform: string;
};

export const INFLUENCER_CAMPAIGNS: readonly InfluencerCampaign[] = [
  { id: "ic1", name: "Q4 workflow ambassadors", stage: "Live", creators: 6, budgetEur: 28_000, pipelineEur: 186_000, platform: "Skeepers" },
  { id: "ic2", name: "DevTools holiday shorts", stage: "Briefed", creators: 4, budgetEur: 12_000, pipelineEur: 0, platform: "Modash" },
  { id: "ic3", name: "EU ops leaders LinkedIn", stage: "Reporting", creators: 8, budgetEur: 22_000, pipelineEur: 142_000, platform: "Skeepers" },
  { id: "ic4", name: "Product-led TikTok test", stage: "Discovery", creators: 0, budgetEur: 8_000, pipelineEur: 0, platform: "Upfluence" },
];

export const INFLUENCER_RESULTS = [
  { creator: "Nora Klein", deliverable: "LinkedIn carousel + live", reach: 96_000, engagement: 4.9, attributedEur: 64_000 },
  { creator: "Jules Martin", deliverable: "YouTube integration", reach: 210_000, engagement: 3.2, attributedEur: 48_000 },
  { creator: "Elena Vogt", deliverable: "Instagram Reels ×3", reach: 74_000, engagement: 4.4, attributedEur: 22_000 },
  { creator: "Aya Rahman", deliverable: "TikTok series", reach: 310_000, engagement: 6.1, attributedEur: 31_000 },
] as const;
