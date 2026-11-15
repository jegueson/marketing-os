/** Creative studio — briefs, jobs and assets for the investor demo. */

export type CreativeTool = "Runway" | "Higgsfield" | "ComfyUI";

export type Brief = {
  id: string;
  title: string;
  channel: string;
  owner: string;
  status: "Draft" | "Ready" | "In generation" | "In approval";
  objective: string;
};

export const BRIEFS: readonly Brief[] = [
  {
    id: "br1",
    title: "Workflow automation pillar — hero video",
    channel: "YouTube + LinkedIn",
    owner: "Sofia Berg",
    status: "Ready",
    objective: "Explain time-to-value in 20 seconds for EU mid-market ops leads",
  },
  {
    id: "br2",
    title: "Meta retargeting — carousel refresh",
    channel: "Meta Ads",
    owner: "Sofia Berg",
    status: "In approval",
    objective: "Replace fatigued creative; keep brand colours and claim",
  },
  {
    id: "br3",
    title: "Product UI stills for webinar",
    channel: "Email + Notion",
    owner: "Content",
    status: "Draft",
    objective: "Six screens with captions for the Nov 20 webinar",
  },
];

export type StudioAsset = {
  id: string;
  title: string;
  tool: CreativeTool;
  format: string;
  status: "Ready" | "Brand check" | "Approved" | "Published";
  score: number;
};

export const ASSETS: readonly StudioAsset[] = [
  { id: "as1", title: "Hero cut A — desk to done", tool: "Runway", format: "16:9 video", status: "Ready", score: 92 },
  { id: "as2", title: "Hero cut B — before / after", tool: "Runway", format: "16:9 video", status: "Ready", score: 88 },
  { id: "as3", title: "Square loop — product UI", tool: "Higgsfield", format: "1:1 video", status: "Brand check", score: 81 },
  { id: "as4", title: "Still set — feature grid", tool: "ComfyUI", format: "4 stills", status: "Approved", score: 95 },
];

export const STUDIO_TOOLS: readonly { name: CreativeTool; status: string; detail: string }[] = [
  { name: "Runway", status: "Connected", detail: "BYOK · video gen" },
  { name: "Higgsfield", status: "Connected", detail: "BYOK · motion" },
  { name: "ComfyUI", status: "Self-hosted", detail: "Workflow connector" },
];

export const VARIANT_LABELS = ["Cut A · desk to done", "Cut B · before / after", "Cut C · customer quote", "Cut D · product UI"] as const;
