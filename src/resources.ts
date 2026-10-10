/** Local API resources and published, immutable showcase assets. */
export const showcase = import.meta.env.VITE_SHOWCASE === '1';
export const publicResource = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export const mediaURL = (hash: string) => showcase ? publicResource(`media/${hash}`) : `/api/media/${hash}`;
export const reportExportURL = (id: string, format: 'export' | 'ontology') => showcase
  ? publicResource(`exports/${id}.${format === 'export' ? 'md' : 'jsonld'}`)
  : `/api/runs/${id}/${format}`;
