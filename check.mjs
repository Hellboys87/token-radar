// Validates out/board.json + out/dossier.json against the gate's rows.
// Usage: node check.mjs <out-dir>   (run from the repo root)
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'out';
const snap = JSON.parse(readFileSync('../token-radar-kit/input/snapshot.json', 'utf8'));
const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'));
const rows = board.rows;
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails.push(msg); };

ok(Array.isArray(rows) && rows.length >= 100 && rows.length <= 4000, `rows ${rows.length} in 100..4000`);
const slugs = new Set(snap.protocols.map((p) => p.slug));
ok(rows.every((r) => slugs.has(r.slug)), 'every slug is a snapshot protocol');
ok(new Set(rows.map((r) => r.slug)).size === rows.length, 'no duplicate slugs');
const missing = snap.watchlist.filter((s) => !rows.some((r) => r.slug === s));
ok(missing.length === 0, `watchlist coverage: ${snap.watchlist.length - missing.length}/${snap.watchlist.length}${missing.length ? ` (missing ${missing.join(', ')})` : ''}`);
ok(rows.every((r, i) => r.rank === i + 1), 'ranks are exactly 1..N in row order');
ok(rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd), 'implied_value_usd never rises with rank');
ok(!(rows.length >= 2 && rows[0].implied_value_usd === rows[rows.length - 1].implied_value_usd), 'implied values are not all equal');
ok(rows.every((r) => Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd <= 1e14), 'implied values are positive safe integers');
ok(rows.every((r) => Array.isArray(r.farm_steps) && r.farm_steps.length >= 3 && r.farm_steps.length <= 12), 'farm_steps 3..12 per row');
ok(rows.every((r) => r.farm_steps.every((s) => { const t = s.trim(); return t.length >= 20 && t.length <= 600; })), 'every farm step 20..600 chars trimmed');
ok(rows.every((r) => typeof r.name === 'string' && r.name.length > 0), 'every row has a non-empty name');
const dSize = statSync(join(out, 'dossier.json')).size;
ok(dSize <= 1_572_864, `dossier.json ${dSize} bytes <= 1.5 MiB`);
const bSize = statSync(join(out, 'board.json')).size;
ok(bSize <= 8_388_608, `board.json ${bSize} bytes <= 8 MiB`);
console.log(`top 5: ${rows.slice(0, 5).map((r) => `#${r.rank} ${r.slug} $${r.implied_value_usd.toLocaleString('en-US')}`).join(' | ')}`);
console.log(fails.length === 0 ? 'ALL CHECKS PASSED' : `${fails.length} CHECK(S) FAILED`);
process.exit(fails.length === 0 ? 0 : 1);
