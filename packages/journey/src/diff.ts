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
  // Reserve useful space for each displayed hunk, including both edit sides.
  const count = Math.min(ranges.length, Math.floor(budget / 100));
  if (!count) return { text: clip("Delta omitted: excerpt budget too small; no absence inference.", budget),
    truncated: true, format: "unified_hunks", omitted_hunks: ranges.length };
  let remaining = budget, truncated = count < ranges.length;
  const rendered: string[] = [];
  for (let r = 0; r < count; r++) {
    const range = ranges[r]!, selected = lines.slice(range.start, range.end), first = selected[0]!;
    const oldCount = selected.filter(line => line.kind !== "+").length, newCount = selected.filter(line => line.kind !== "-").length;
    const header = `@@ -${oldCount ? first.old : first.old - 1},${oldCount} +${newCount ? first.next : first.next - 1},${newCount} @@\n`;
    const hunkBudget = Math.floor(remaining / (count - r));
    let available = Math.max(0, hunkBudget - Buffer.byteLength(header));
    let hunk = header;
    const capacity = Math.max(2, Math.floor((available - 50) / 24));
    let shown = selected;
    if (selected.length > capacity) {
      const kinds = (["-", "+"] as const).filter(kind => selected.some(line => line.kind === kind));
      const keep = new Set<Line>();
      for (const kind of kinds) {
        const candidates = selected.filter(line => line.kind === kind);
        const quota = Math.max(1, Math.floor(capacity / kinds.length));
        for (const line of [...candidates.slice(0, Math.ceil(quota / 2)), ...candidates.slice(-Math.floor(quota / 2) || candidates.length)]) keep.add(line);
      }
      for (const line of selected) if (keep.size < capacity) keep.add(line);
      shown = selected.filter(line => keep.has(line));
      const notice = `[${selected.length - shown.length} hunk lines omitted by budget]\n`;
      hunk += notice; available -= Buffer.byteLength(notice); truncated = true;
    }
    for (let i = 0; i < shown.length; i++) {
      const line = shown[i]!;
      let allowance = Math.max(0, Math.floor(available / (shown.length - i)));
      if (line.kind === " ") allowance = Math.min(allowance, 100);
      const full = line.kind + line.text + "\n";
      let part = full;
      if (Buffer.byteLength(full) > allowance) {
        truncated = true;
        const ending = " …[line clipped]\n";
        part = allowance >= Buffer.byteLength(ending) + 2
          ? line.kind + clip(line.text, allowance - Buffer.byteLength(ending) - 1) + ending
          : clip(line.kind + "[clipped]\n", allowance);
      }
      hunk += part; available -= Buffer.byteLength(part);
    }
    rendered.push(hunk); remaining -= Buffer.byteLength(hunk);
  }
  return { text: rendered.join(""), truncated, format: "unified_hunks", omitted_hunks: ranges.length - count };
}
