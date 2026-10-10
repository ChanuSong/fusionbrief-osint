/** Trim only exact excerpt spans, keeping document metadata and archived bodies intact. */
function fitExcerpts(excerpts: string[], budget: number): string[] {
  const bytes = (value: string[]) => Buffer.byteLength(JSON.stringify(value));
  if (bytes(excerpts) <= budget) return excerpts;
  let low = 0, high = Math.max(0, ...excerpts.map(text => text.length));
  let best: string[] = [];
  while (low <= high) {
    const length = Math.floor((low + high) / 2);
    const candidate = excerpts.map(text => {
      let end = Math.min(length, text.length);
      // A selected span must end on a complete Unicode character.
      if (end < text.length && end > 0 && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      return text.slice(0, end);
    }).filter(Boolean);
    if (bytes(candidate) <= budget) { best = candidate; low = length + 1; }
    else high = length - 1;
  }
  return best;
}

/** Leave space for instructions, JSON Schema and the bounded format-repair message.
 * Small contexts remain complete; the remaining budget is shared among larger ones.
 * This never changes quotes, criterion definitions, source IDs or original bodies. */
export function budgetDocumentContext<T extends { sources: { excerpts: string[] }[] }>(input: T, maximumBytes = 145_000): T {
  if (Buffer.byteLength(JSON.stringify(input)) <= maximumBytes) return input;
  const fixed = { ...input, sources: input.sources.map(source => ({ ...source, excerpts: [] as string[] })) };
  let remaining = maximumBytes - Buffer.byteLength(JSON.stringify(fixed));
  if (remaining < 0) throw new Error('판단 기준과 문서 메타데이터가 분석 입력 한도를 넘었습니다.');
  const ordered = input.sources.map((source, index) => ({ index, size: Buffer.byteLength(JSON.stringify(source.excerpts)) - 2 }))
    .sort((a, b) => a.size - b.size);
  for (const [position, entry] of ordered.entries()) {
    const allowance = Math.floor(remaining / (ordered.length - position));
    const excerpts = fitExcerpts(input.sources[entry.index].excerpts, allowance + 2);
    fixed.sources[entry.index].excerpts = excerpts;
    remaining -= Buffer.byteLength(JSON.stringify(excerpts)) - 2;
  }
  return fixed as T;
}
