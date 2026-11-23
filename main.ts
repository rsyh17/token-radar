// Token launch radar: the entry program.
//
// It reads the sealed DefiLlama snapshot (at /input/snapshot.json, or wherever
// --input points: a snapshot file, or a directory holding one), scores every
// pre-token protocol with the model in lib/model.ts, and writes the handover
// into the output directory: board.json (the ranked board), data.js (the same
// radar as a script the dashboard reads), the dashboard/ page and screenshots/
// copied from beside this file, and dossier.json, the summary the judge
// reads, written with the vendored make.fun library.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && process.argv[at + 1]) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : fallback;
}

const inputArg = flag('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile} — pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}
const out = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const radar = buildRadar(snapshot);
const issue = boardIssue(radar.rows, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: radar.rows })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy a directory tree of regular files, skipping dot names. */
function copyTree(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    const dst = join(to, name);
    if (statSync(src).isDirectory()) {
      copied.push(...copyTree(src, dst));
    } else if (statSync(src).isFile()) {
      copyFileSync(src, dst);
      copied.push(name);
    }
  }
  return copied;
}

copyTree(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyTree(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} images; hand in 3 or 4\n`);
  process.exit(1);
}

// The dossier goes last: the scorer rebuilds it from this output and compares.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 65_536,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols read, ${radar.watchlist_size} on the watchlist, ` +
    `${radar.rows.length} pre-token protocols ranked (${radar.traded_set_aside} already trade a token, ` +
    `${radar.products_set_aside} are products of traded tokens — both set aside)\n`,
);
