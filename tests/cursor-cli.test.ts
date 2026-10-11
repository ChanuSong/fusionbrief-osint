import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCursor } from '../server/cursor-cli.ts';
import { parseCursorSearchStream } from '../server/cursor-search.ts';

test('native search metadata is consumed from split stream chunks without waiting for final synthesis', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trace-cli-test-'));
  const binary = join(dir, 'agent');
  const old = process.env.FUSIONBRIEF_CURSOR_BIN;
  const query = { language: 'ko' as const, module: 'news' as const, query: '검증용 질의' };
  const record = JSON.stringify({ type: 'tool_call', subtype: 'completed', tool_call: { webSearchToolCall: {
    args: { searchTerm: query.query }, result: { success: { references: [{ url: 'https://example.gov/source', title: '검증 원문' }] } },
  } } });
  try {
    await writeFile(binary, `#!${process.execPath}\nconst line=${JSON.stringify(record)};\nprocess.stdout.write(line.slice(0,30));\nsetTimeout(()=>process.stdout.write(line.slice(30)+'\\n'+'{"partial":'),20);\nsetTimeout(()=>process.exit(0),5000);\n`);
    await chmod(binary, 0o700); process.env.FUSIONBRIEF_CURSOR_BIN = binary;
    const began = performance.now();
    const output = await runCursor('fixture', { webSearch: true, timeout: 6000, finishOnLine: line => {
      try { parseCursorSearchStream(line, query); return true; } catch { return false; }
    } });
    assert.ok(performance.now() - began < 2500);
    assert.equal(parseCursorSearchStream(output, query)[0].url, 'https://example.gov/source');
    assert.ok(!output.includes('partial'));
  } finally {
    if (old === undefined) delete process.env.FUSIONBRIEF_CURSOR_BIN; else process.env.FUSIONBRIEF_CURSOR_BIN = old;
    await rm(dir, { recursive: true, force: true });
  }
});

test('changing the analysis model does not silently switch the native search model', async () => {
  const { cursorModelName, cursorSearchModelName } = await import('../server/cursor-cli.ts');
  const previousModel=process.env.FUSIONBRIEF_CURSOR_MODEL, previousSearch=process.env.FUSIONBRIEF_SEARCH_MODEL;
  try {
    process.env.FUSIONBRIEF_CURSOR_MODEL='test-fast-analysis';delete process.env.FUSIONBRIEF_SEARCH_MODEL;
    assert.equal(cursorModelName(),'test-fast-analysis');assert.equal(cursorSearchModelName(),'auto');
    process.env.FUSIONBRIEF_SEARCH_MODEL='test-search';assert.equal(cursorSearchModelName(),'test-search');
  } finally {
    if(previousModel===undefined)delete process.env.FUSIONBRIEF_CURSOR_MODEL;else process.env.FUSIONBRIEF_CURSOR_MODEL=previousModel;
    if(previousSearch===undefined)delete process.env.FUSIONBRIEF_SEARCH_MODEL;else process.env.FUSIONBRIEF_SEARCH_MODEL=previousSearch;
  }
});
