import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export const cursorBinary = () => (process.env.FUSIONBRIEF_CURSOR_BIN ?? process.env.TRACE_CURSOR_BIN) || 'agent';
export const cursorModelName = () => (process.env.FUSIONBRIEF_CURSOR_MODEL ?? process.env.TRACE_CURSOR_MODEL) || 'auto';
export const cursorSearchModelName = () => (process.env.FUSIONBRIEF_SEARCH_MODEL ?? process.env.TRACE_SEARCH_MODEL) || 'auto';

/** Only this child process gets its own CLI config. Existing login credentials stay with Cursor. */
export async function runCursor(prompt: string, options: { webSearch?: boolean; timeout?: number; finishOnLine?: (line: string) => boolean;
  images?: { body: Buffer; contentType: string }[] } = {}): Promise<string> {
  if (Buffer.byteLength(prompt) > 200_000) throw new Error('Cursor 입력 크기 제한 초과');
  const workspace = await mkdtemp(join(tmpdir(), 'fusionbrief-cursor-'));
  const profile = join(workspace, 'config');
  const imageFiles=(options.images ?? []).slice(0,3).map((image,i)=>`public-image-${i+1}.${image.contentType==='image/png' ? 'png' : image.contentType==='image/webp' ? 'webp' : 'jpg'}`);
  const permissions = { allow: imageFiles.map(file=>`Read(${file})`), deny: ['Shell(*)', ...(imageFiles.length ? ['Read(config/**)','Read(.cursor/**)','Read(/Users/**)','Read(/home/**)','Read(/etc/**)','Read(/proc/**)'] : ['Read(**)','Read(/**)']), 'Write(**)', 'Write(/**)', 'Mcp(*:*)', 'WebFetch(*)'] };
  try {
    await mkdir(profile);
    await mkdir(join(workspace, '.cursor'));
    await writeFile(join(profile, 'cli-config.json'), JSON.stringify({ version: 1, editor: { vimMode: false },
      approvalMode: 'allowlist', sandbox:{readBoundary:'workspace'}, autoAcceptWebSearch: options.webSearch === true, permissions }), { mode: 0o600 });
    await writeFile(join(workspace, '.cursor', 'cli.json'), JSON.stringify({ permissions }), { mode: 0o600 });
    for (const [i,file] of imageFiles.entries()) await writeFile(join(workspace,file),options.images![i].body);
    if (imageFiles.length) prompt+='\nRead each of these supplied PUBLIC images using the native Read tool, then answer from the actual pixels. Do not read any other file. If image reading fails, report that failure; never infer pixels from captions. FILES: '+imageFiles.join(', ');
    return await new Promise<string>((resolve, reject) => {
      let completeOutput: string | undefined;
      let stream = '';
      let consumed = 0;
      const child = execFile(cursorBinary(), ['--print', '--mode', 'ask', '--output-format',
      options.webSearch || imageFiles.length ? 'stream-json' : 'json', '--workspace', workspace, '--trust', '--model', options.webSearch ? cursorSearchModelName() : cursorModelName(), prompt], {
      cwd: workspace, env: { ...process.env, CURSOR_CONFIG_DIR: profile, CURSOR_DATA_DIR: join(workspace, 'data') },
      timeout: options.timeout ?? (Buffer.byteLength(prompt) > 100_000 ? 600000 : 300000), maxBuffer: 4_000_000,
      }, (error, stdout) => {
        // Wait for process shutdown before removing its isolated profile.
        if (completeOutput !== undefined) resolve(completeOutput);
        else if (error) reject(error);
        else resolve(stdout);
      });
      if (options.finishOnLine) {
        child.stdout?.setEncoding('utf8');
        child.stdout?.on('data', (chunk: string) => {
          if (completeOutput !== undefined) return;
          stream += chunk;
          let end: number;
          while ((end = stream.indexOf('\n', consumed)) !== -1) {
            const line = stream.slice(consumed, end);
            consumed = end + 1;
            if (options.finishOnLine!(line)) {
              completeOutput = stream.slice(0, consumed);
              child.kill('SIGTERM');
              break;
            }
          }
        });
      }
    });
  } finally { await rm(workspace, { recursive: true, force: true }); }
}
