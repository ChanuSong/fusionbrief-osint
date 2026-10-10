/** Verify explicit decimal or hemisphere-qualified DMS coordinates; never geocode a place name. */
export function coordinatesMatchQuote(quote: string, latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  const values = new Map<string, number[]>();
  const pattern = /([NSEW])\s*(\d{1,3})\s*[°º]\s*(\d{1,2}(?:\.\d+)?)\s*['′’](?:\s*(\d{1,2}(?:\.\d+)?)\s*["″”])?/gi;
  for (const match of quote.matchAll(pattern)) {
    const direction = match[1].toUpperCase();
    const degrees = Number(match[2]), minutes = Number(match[3]), seconds = Number(match[4] ?? 0);
    if (minutes >= 60 || seconds >= 60) return false;
    const value = (degrees + minutes / 60 + seconds / 3600) * ('SW'.includes(direction) ? -1 : 1);
    const axis = 'NS'.includes(direction) ? 'lat' : 'lon';
    values.set(axis, [...(values.get(axis) ?? []), value]);
  }
  const close = (a: number, b: number) => Math.abs(a - b) <= 0.000001;
  if (values.size) return values.get('lat')?.length === 1 && values.get('lon')?.length === 1
    && close(values.get('lat')![0], latitude) && close(values.get('lon')![0], longitude);
  if (/[°ºNSEW]/i.test(quote)) return false;
  const decimals = [...quote.matchAll(/-?\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
  return decimals.length === 2 && close(decimals[0], latitude) && close(decimals[1], longitude);
}
