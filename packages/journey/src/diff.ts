type Line = { kind: " " | "-" | "+"; text: string; old: number; next: number };
export interface DeltaExcerpt {
  text: string; truncated: boolean; format: "unified_hunks" | "bounded_samples_not_diff"; omitted_hunks: number;
}
const CELLS = 2_000_000;
function clip(text: string, bytes: number): string {
  if (Buffer.byteLength(text) <= bytes) return text;
  let result = "", used = 0;
  for (const character of text) {
    used += Buffer.byteLength(character);
    if (used > bytes) break;
    result += character;
  }
  return result;
}
function sample(before: string | null, after: string | null, budget: number): DeltaExcerpt {
  const label = "Diff complexity limit: bounded samples only, NOT added/removed lines.\n";
  const available = Math.max(0, budget - Buffer.byteLength(label + "Before sample:\n\nAfter sample:\n"));
  const text = label + "Before sample:\n" + clip(before ?? "(absent)", Math.floor(available / 2)) +
    "\nAfter sample:\n" + clip(after ?? "(absent)", Math.floor(available / 2));
  return { text: clip(text, budget), truncated: true, format: "bounded_samples_not_diff", omitted_hunks: 0 };
}
/** Bounded exact line LCS; distant edits stay separate. No source-defined diff driver runs. */
export function renderDeltaExcerpt(before: string | null, after: string | null, budget: number): DeltaExcerpt {
  if (!Number.isInteger(budget) || budget < 0 || budget > 131072) throw new Error("invalid_excerpt_budget");
  const a = before === null ? [] : before.split("\n"), b = after === null ? [] : after.split("\n");
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let endA = a.length, endB = b.length;
  while (endA > prefix && endB > prefix && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const n = endA - prefix, m = endB - prefix;
  if ((n + 1) * (m + 1) > CELLS && n !== 0 && m !== 0) return sample(before, after, budget);
  const lines: Line[] = [];
  let old = 1, next = 1;
  const add = (kind: Line["kind"], text: string) => {
    lines.push({ kind, text, old, next });
    if (kind !== "+") old++;
    if (kind !== "-") next++;
  };
  for (let i = 0; i < prefix; i++) add(" ", a[i]!);
  if (n === 0) for (let j = prefix; j < endB; j++) add("+", b[j]!);
  else if (m === 0) for (let i = prefix; i < endA; i++) add("-", a[i]!);
  else {
    const width = m + 1, table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = a[prefix + i] === b[prefix + j]
        ? table[(i + 1) * width + j + 1]! + 1
        : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[prefix + i] === b[prefix + j]) { add(" ", a[prefix + i]!); i++; j++; }
      else if (i < n && (j === m || table[(i + 1) * width + j]! >= table[i * width + j + 1]!)) add("-", a[prefix + i++]!);
      else add("+", b[prefix + j++]!);
    }
  }
  for (let i = endA; i < a.length; i++) add(" ", a[i]!);
  const ranges: { start: number; end: number }[] = [];
  for (let i = 0; i < lines.length; i++) if (lines[i]!.kind !== " ") {
    const start = Math.max(0, i - 2), end = Math.min(lines.length, i + 3);
    const previous = ranges.at(-1);
    if (previous && start <= previous.end) previous.end = end;
    else ranges.push({ start, end });
  }
  if (!ranges.length) return { text: "", truncated: false, format: "unified_hunks", omitted_hunks: 0 };
  const header = (selected: Line[]) => {
    const first = selected[0]!;
    const oldCount = selected.filter(line => line.kind !== "+").length;
    const newCount = selected.filter(line => line.kind !== "-").length;
    return `@@ -${oldCount ? first.old : first.old - 1},${oldCount} +${newCount ? first.next : first.next - 1},${newCount} @@\n`;
  };
  const chunks = ranges.map(range => {
    const selected = lines.slice(range.start, range.end);
    return { lines: selected, header: header(selected), full: header(selected) + selected.map(line => line.kind + line.text + "\n").join("") };
  });
  const full = chunks.map(chunk => chunk.full).join("");
  if (Buffer.byteLength(full) <= budget) return { text: full, truncated: false, format: "unified_hunks", omitted_hunks: 0 };
  const footer = (omitted: number) => `[${omitted} whole hunks omitted. Excerpt incomplete; unseen text is unassessed, not absent.]\n`;
  let remaining = budget - Buffer.byteLength(footer(ranges.length));
  if (remaining < 30) return { text: clip("Delta omitted: excerpt budget too small; no absence inference.", budget),
    truncated: true, format: "unified_hunks", omitted_hunks: ranges.length };
  const rendered = new Map<number, string>();
  // Keep complete hunks first. A large hunk must not turn every smaller change into fragments.
  for (const [index, chunk] of chunks.entries()) {
    const size = Buffer.byteLength(chunk.full);
    if (size <= remaining) { rendered.set(index, chunk.full); remaining -= size; }
  }
  for (const [index, chunk] of chunks.entries()) {
    if (rendered.has(index)) continue;
    const partial = coherentSelection(chunk.lines, chunk.header, remaining);
    if (partial) { rendered.set(index, partial); remaining -= Buffer.byteLength(partial); }
  }
  const omitted = chunks.length - rendered.size;
  const text = [...rendered.entries()].sort(([a], [b]) => a - b).map(([, text]) => text).join("") + footer(omitted);
  return { text, truncated: true, format: "unified_hunks", omitted_hunks: omitted };
}

/** Complete lines only. Paragraphs/top-level closing lines are grouping hints, not a syntax/meaning claim. */
function coherentSelection(lines: Line[], header: string, budget: number): string {
  const gap = (count: number) => `[... ${count} lines omitted ...]\n`;
  const gapBytes = Buffer.byteLength(gap(lines.length));
  const notice = (keep: Set<number>) => {
    const omitted = lines.filter((_, index) => !keep.has(index));
    const count = (kind: Line["kind"]) => omitted.filter(line => line.kind === kind).length;
    return `[${omitted.length} hunk lines omitted by budget (removed ${count("-")}, added ${count("+")}, context ${count(" ")}); unassessed.]\n`;
  };
  const keep = new Set<number>();
  let available = budget - Buffer.byteLength(header + notice(keep)) - gapBytes;
  if (available <= 0) return "";
  const kinds = (["-", "+"] as const).filter(kind => lines.some(line => line.kind === kind && line.text.trim()));
  const blocks = (kind: Line["kind"]) => {
    const result: number[][] = []; let block: number[] = [];
    const flush = () => { if (block.length) result.push(block); block = []; };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.kind !== kind || !line.text.trim()) { flush(); continue; }
      block.push(i);
      if (/^[}\])];?\s*$/.test(line.text)) flush();
    }
    flush();
    // Beginning/end windows retain surrounding intent without distributing bytes over every line.
    const ordered: number[][] = [];
    for (let start = 0, end = result.length - 1; start <= end;) {
      ordered.push(result[end--]!);
      if (start <= end) ordered.push(result[start++]!);
    }
    return ordered;
  };
  const cost = (indices: number[]) => indices.reduce((bytes, i) => bytes + Buffer.byteLength(lines[i]!.kind + lines[i]!.text + "\n"), gapBytes);
  const choose = (indices: number[]) => { indices.forEach(i => keep.add(i)); available -= cost(indices); };
  for (const [side, kind] of kinds.entries()) {
    let sideBudget = Math.floor(available / (kinds.length - side));
    const candidates = blocks(kind);
    let complete = false;
    for (const block of candidates) {
      const bytes = cost(block);
      if (bytes <= sideBudget) { choose(block); sideBudget -= bytes; complete = true; }
    }
    if (complete) continue;
    // No whole block fits: retain one contiguous window of whole lines, never clipped identifiers.
    let best: number[] = [], bestBytes = 0;
    for (const block of candidates) {
      let run: number[] = [], bytes = gapBytes;
      for (const i of [...block].reverse()) {
        const size = Buffer.byteLength(lines[i]!.kind + lines[i]!.text + "\n");
        if (bytes + size > sideBudget) {
          if (bytes > bestBytes && run.length) { best = run; bestBytes = bytes; }
          run = []; bytes = gapBytes;
        }
        if (bytes + size <= sideBudget) { run.push(i); bytes += size; }
      }
      if (bytes > bestBytes && run.length) { best = run; bestBytes = bytes; }
    }
    if (best.length) choose(best);
  }
  if (!keep.size) return "";
  // Add only adjacent complete context lines. The gap marker keeps unselected ranges visible.
  const nearby = new Set<number>();
  for (const i of keep) for (const j of [i - 1, i + 1]) if (lines[j]?.kind === " " || lines[j]?.text === "") nearby.add(j);
  for (const i of nearby) if (!keep.has(i) && cost([i]) <= available) choose([i]);
  let text = header + notice(keep), last = -1;
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (i !== last + 1) text += gap(i - last - 1);
    text += lines[i]!.kind + lines[i]!.text + "\n"; last = i;
  }
  if (last < lines.length - 1) text += gap(lines.length - last - 1);
  // Omission counts cover leading/trailing gaps too; no generated line is a claimed patch.
  return Buffer.byteLength(text) <= budget ? text : "";
}
