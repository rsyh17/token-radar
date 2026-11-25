// Token Launch Radar — entry point.
//
// Reads a DefiLlama snapshot, ranks the protocols that record no token yet
// with the valuation model in lib/model.ts, and assembles everything the
// scorer needs in the output directory: the board as JSON, the dashboard
// with its data file, the screenshots, and the dossier written last, once
// every other file is in place.

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const entryDir = dirname(fileURLToPath(import.meta.url));

// The snapshot comes from --input when the caller passes one; the harness
// mounts it at /input/snapshot.json when it does not.
function snapshotPath(args: string[]): string {
  const flag = args.indexOf('--input');
  if (flag >= 0 && args[flag + 1]) return args[flag + 1]!;
  return '/input/snapshot.json';
}

function main(): void {
  const snapshot = parseSnapshot(readFileSync(snapshotPath(process.argv.slice(2)), 'utf8'));
  const radar = buildRadar(snapshot);

  // Refuse to ship a board the gate would turn away; failing here, loudly,
  // beats a silent rejection after submission.
  const issue = boardIssue(radar.rows, snapshot);
  if (issue !== null) throw new Error(`board is not fit to submit: ${issue}`);

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify(radar)}\n`);
  writeFileSync(join(outDir, 'data.js'), dataScript(radar));
  cpSync(join(entryDir, 'dashboard'), join(outDir, 'dashboard'), { recursive: true });
  cpSync(join(entryDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

  // The dossier goes last: it catalogues the directory, so it is only
  // written once the directory is final.
  const dossier = buildDossier(outDir, {
    text_max_bytes: 65_536,
    screenshots: { max: 4, max_bytes: 512 * 1024 },
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  console.log(
    `token radar: ${radar.rows.length} protocols ranked, ` +
      `${radar.rows.filter((r) => r.on_watchlist).length}/${radar.watchlist_size} watchlist covered, ` +
      `board + dashboard + dossier written to ${outDir}`,
  );
}

main();
