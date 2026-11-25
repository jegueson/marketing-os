/** Soft ceiling for one chunk before hard-wrapping. */
const DEFAULT_MAX_CHARS = 1_200;

/**
 * Split document text into citation-sized chunks. Blank lines prefer a break;
 * overlong paragraphs are sliced on word boundaries when possible.
 */
export function chunkText(text: string, maxChars = DEFAULT_MAX_CHARS): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (maxChars < 32) {
    throw new Error("maxChars must be at least 32");
  }

  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) {
      chunks.push(buffer);
      buffer = "";
    }
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush();
      for (const piece of hardWrap(paragraph, maxChars)) {
        chunks.push(piece);
      }
      continue;
    }
    if (!buffer) {
      buffer = paragraph;
      continue;
    }
    if (buffer.length + 2 + paragraph.length <= maxChars) {
      buffer = `${buffer}\n\n${paragraph}`;
      continue;
    }
    flush();
    buffer = paragraph;
  }
  flush();
  return chunks;
}

function hardWrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(" ", maxChars);
    if (cut < maxChars / 2) cut = maxChars;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}
