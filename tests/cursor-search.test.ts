import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResearchQuery } from '../shared/types.ts';
import { parseCursorSearchStream } from '../server/cursor-search.ts';
import { publicSearchLabel } from '../server/public-sources.ts';

const query: ResearchQuery = { module: 'news', language: 'en', query: 'Freedom Edge June 2024' };
function stream(references: { title?: string; url?: string; chunk?: string }[], searchTerm = query.query) {
  return [
    { type: 'tool_call', subtype: 'started', tool_call: { webSearchToolCall: { args: { searchTerm } } } },
    { type: 'tool_call', subtype: 'completed', tool_call: { webSearchToolCall: { args: { searchTerm }, result: { success: { references } } } } },
    { type: 'result', result: '{"hits":[{"url":"https://fabricated.example/","title":"Invented result"}]}' },
  ].map(e => JSON.stringify(e)).join('\n');
}

test('Cursor native search reads aggregate hit metadata, ignores synthesis URLs and generated final URLs', () => {
  const hits = parseCursorSearchStream(stream([{ url: '', title: 'Web search results', chunk:
    'Synthesis: https://invented.example/\n<result id="1"><title>Official &amp; public</title><url>https://example.gov/announcement</url><content>Snippet https://unverified.example/</content></result>' }]), query);
  assert.deepEqual(hits, [{ url: 'https://example.gov/announcement', title: 'Official & public', module: 'news', language: 'en' }]);
});

test('direct references are deduplicated and unsafe result URLs cannot reach collection', () => {
  const refs = [
    { title: 'Announcement', url: 'https://example.gov/announcement' },
    { title: 'Same source', url: 'https://example.gov/announcement#part' },
    ...['http://example.gov/', 'https://127.0.0.1/', 'https://localhost/', 'https://user:pass@example.gov/', 'javascript:alert(1)'].map(url => ({ url })),
  ];
  const hits = parseCursorSearchStream(stream(refs), query);
  assert.equal(hits.length, 1); assert.equal(hits[0].url, 'https://example.gov/announcement');
});

test('Cursor search rejection stays a failure instead of becoming a fabricated or empty search result', () => {
  const rejected = { type: 'tool_call', subtype: 'completed', tool_call: {
    webSearchToolCall: { result: { rejected: { reason: 'User Rejected' } } },
  } };
  assert.throws(() => parseCursorSearchStream(JSON.stringify(rejected), query), /검색 승인 거절/);
  assert.throws(() => parseCursorSearchStream(JSON.stringify({ type: 'result', result: 'https://invented.example/' }), query), /실제 검색 도구 실행 기록 없음/);
});

test('search results for a different query cannot substantiate the requested query', () => {
  assert.throws(() => parseCursorSearchStream(stream([{ url: 'https://example.gov/' }], 'Unrelated query'), query), /실제 검색 도구 실행 기록 없음/);
  assert.throws(() => parseCursorSearchStream('{invalid json}', query), /실행 기록 형식 오류/);
});

test('a successful native search with no references is a genuine zero result', () => {
  assert.deepEqual(parseCursorSearchStream(stream([]), query), []);
  assert.deepEqual(parseCursorSearchStream(stream([{ chunk: 'No search results found.' }]), query), []);
});

test('explicit provider link lists can be read without treating synthesized text as results', () => {
  const hits = parseCursorSearchStream(stream([{ chunk: 'Links:\n1. [Announcement](https://example.gov/announcement)\n\nSynthesis:\n[Invented](https://invented.example/)' }]), query);
  assert.equal(hits.length, 1); assert.equal(hits[0].url, 'https://example.gov/announcement');
});

test('unreadable search metadata fails clearly rather than reporting a false zero-result success', () => {
  assert.throws(() => parseCursorSearchStream(stream([{ chunk: 'A new response format: https://unverified.example/' }]), query), /메타데이터 형식/);
});

test('public search defaults to Cursor and papers retain the public Crossref module', () => {
  const before = process.env.TRACE_SEARCH_PROVIDER;
  try {
    delete process.env.TRACE_SEARCH_PROVIDER;
    assert.equal(publicSearchLabel(query), 'Cursor WebSearch');
    assert.equal(publicSearchLabel({ ...query, module: 'papers' }), 'Crossref');
    process.env.TRACE_SEARCH_PROVIDER = 'typo';
    assert.throws(() => publicSearchLabel(query), /검색 제공자 설정/);
  } finally { if (before === undefined) delete process.env.TRACE_SEARCH_PROVIDER; else process.env.TRACE_SEARCH_PROVIDER = before; }
});
