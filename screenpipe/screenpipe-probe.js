#!/usr/bin/env node
/**
 * Phase 1: pull health + search + a few frames/context samples from local Screenpipe.
 *
 * Usage:
 *   node screenpipe/screenpipe-probe.js --minutes 5
 *   node screenpipe/screenpipe-probe.js --since 2026-04-11T10:00:00Z --until 2026-04-11T10:05:00Z
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const {
  createScreenpipeClient,
  ScreenpipeApiError,
} = require('./screenpipe-client.js');

const MAX_FRAMES = 5;

function usage() {
  console.log(`
Screenpipe probe — save samples under screenpipe-samples/<timestamp>/

Usage:
  node screenpipe/screenpipe-probe.js --minutes <N>
  node screenpipe/screenpipe-probe.js --since <ISO8601> --until <ISO8601>

Options:
  --minutes N     Search from (now - N minutes) through now
  --since ISO     Start of time window (use with --until)
  --until ISO     End of time window
  --limit N       Max search hits (default: 40)
  --base-url URL  Override SCREENPIPE_URL for this run

Environment:
  SCREENPIPE_URL   Default http://127.0.0.1:3030
`);
}

function getArg(argv, flag) {
  const i = argv.indexOf(flag);
  if (i === -1 || i + 1 >= argv.length) return null;
  return argv[i + 1];
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function parseArgs(argv) {
  if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
    usage();
    process.exit(0);
  }

  const minutesRaw = getArg(argv, '--minutes');
  const since = getArg(argv, '--since');
  const until = getArg(argv, '--until');
  const limitRaw = getArg(argv, '--limit');
  const baseUrlOverride = getArg(argv, '--base-url');

  // Allow bare number as positional arg: `node probe.js 5` == `--minutes 5`
  const firstArg = argv[0];
  const bareMinutes =
    minutesRaw == null && since == null && until == null &&
    firstArg && !firstArg.startsWith('-') && Number.isFinite(Number(firstArg))
      ? firstArg
      : null;

  if (bareMinutes != null || minutesRaw != null) {
    const raw = bareMinutes || minutesRaw;
    if (since != null || until != null) {
      console.error('ERROR: Use either --minutes or --since/--until, not both.');
      process.exit(1);
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      console.error('ERROR: --minutes must be a positive number.');
      process.exit(1);
    }
    const end = new Date();
    const start = new Date(end.getTime() - n * 60 * 1000);
    return {
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      limit: limitRaw != null ? Number(limitRaw) : 40,
      baseUrlOverride,
    };
  }

  if (since != null && until != null) {
    return {
      start_time: since,
      end_time: until,
      limit: limitRaw != null ? Number(limitRaw) : 40,
      baseUrlOverride,
    };
  }

  console.error('ERROR: Provide --minutes <N> or both --since and --until (ISO 8601).');
  console.error('       Run with --help for examples.');
  process.exit(1);
}

/**
 * Collect frame ids from /search response (OCR items expose content.frame_id).
 * @param {object} searchBody
 * @returns {number[]}
 */
function extractFrameIds(searchBody) {
  const ids = new Set();
  const items = Array.isArray(searchBody?.data) ? searchBody.data : [];
  for (const item of items) {
    const c = item?.content;
    const fid = c?.frame_id;
    if (fid != null && (typeof fid === 'number' || typeof fid === 'string')) {
      const n = typeof fid === 'string' ? Number(fid) : fid;
      if (Number.isFinite(n)) ids.add(n);
    }
  }
  return [...ids].slice(0, MAX_FRAMES);
}

function writeJson(dir, name, obj) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
  return p;
}

async function main() {
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);

  const client = createScreenpipeClient(
    parsed.baseUrlOverride ? { baseUrl: parsed.baseUrlOverride } : {}
  );

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const outDir = path.join(__dirname, '..', 'screenpipe-samples', stamp);

  console.log('═'.repeat(56));
  console.log('  Screenpipe probe');
  console.log('═'.repeat(56));
  console.log(`  Base URL: ${client.baseUrl}`);
  console.log(`  Output:   ${outDir}`);
  console.log('');

  console.log('  [1/4] GET /health ...');
  let healthBody;
  try {
    healthBody = await client.health();
    fs.mkdirSync(outDir, { recursive: true });
    writeJson(outDir, 'health.json', healthBody);
    console.log('        OK — wrote health.json');
  } catch (e) {
    const msg =
      e instanceof ScreenpipeApiError
        ? `${e.message} (${e.url})`
        : e.message || String(e);
    console.error(`        FAILED: ${msg}`);
    console.error('');
    console.error(
      '  Is Screenpipe running? Example: npx screenpipe@latest record'
    );
    console.error(`  Expected API at ${client.baseUrl}`);
    process.exit(1);
  }

  const searchParams = {
    start_time: parsed.start_time,
    end_time: parsed.end_time,
    limit: parsed.limit,
    offset: 0,
    content_type: 'all',
  };

  console.log('  [2/4] GET /search ...');
  console.log(
    `        window: ${searchParams.start_time} → ${searchParams.end_time}`
  );
  let searchBody;
  try {
    searchBody = await client.search(searchParams);
    writeJson(outDir, 'search.json', searchBody);
    const total = searchBody?.pagination?.total;
    const n = Array.isArray(searchBody?.data) ? searchBody.data.length : 0;
    console.log(`        OK — ${n} items in page${total != null ? ` (total ~${total})` : ''} — wrote search.json`);
  } catch (e) {
    const msg = e instanceof ScreenpipeApiError ? e.message : e.message || String(e);
    console.error(`        FAILED: ${msg}`);
    writeJson(outDir, 'search.json', { error: msg, params: searchParams });
    process.exit(1);
  }

  const frameIds = extractFrameIds(searchBody);
  console.log('');
  console.log(`  [3/4] GET /frames/{id} (up to ${MAX_FRAMES}) ...`);
  const frameRecords = { fetched: [], errors: [] };

  if (frameIds.length === 0) {
    console.log('        No frame_id values in search hits — skipping frame downloads.');
    console.log('        Tip: capture OCR/screen activity in the time window, or widen --minutes.');
  } else {
    console.log(`        frame ids: ${frameIds.join(', ')}`);
    for (const fid of frameIds) {
      try {
        const r = await client.getFrame(fid);
        const ext = r.contentType.includes('png') ? 'png' : 'jpg';
        const fname = `frame_${fid}.${ext}`;
        const fpath = path.join(outDir, fname);
        fs.writeFileSync(fpath, r.data);
        frameRecords.fetched.push({
          frame_id: fid,
          savedAs: fname,
          contentType: r.contentType,
          byteLength: r.byteLength,
        });
        console.log(`        OK frame ${fid} → ${fname} (${r.byteLength} bytes)`);
      } catch (e) {
        const entry = {
          frame_id: fid,
          error: e instanceof ScreenpipeApiError ? e.message : e.message || String(e),
          status: e instanceof ScreenpipeApiError ? e.status : undefined,
        };
        frameRecords.errors.push(entry);
        console.log(`        ✗ frame ${fid}: ${entry.error}`);
      }
    }
  }
  writeJson(outDir, 'frames.json', frameRecords);

  console.log('');
  console.log('  [4/4] GET /frames/{id}/context ...');
  const contextPayload = { contexts: [] };

  if (frameIds.length === 0) {
    contextPayload.note =
      'No frame ids extracted; see search.json and widen time range or capture more screen data.';
  } else {
    for (const fid of frameIds) {
      try {
        const ctx = await client.getFrameContext(fid);
        contextPayload.contexts.push({ frame_id: fid, data: ctx });
        console.log(`        OK context for frame ${fid}`);
      } catch (e) {
        const errMsg = e instanceof ScreenpipeApiError ? e.message : e.message || String(e);
        contextPayload.contexts.push({
          frame_id: fid,
          error: errMsg,
          status: e instanceof ScreenpipeApiError ? e.status : undefined,
        });
        console.log(`        ✗ context ${fid}: ${errMsg}`);
      }
    }
  }
  writeJson(outDir, 'context.json', contextPayload);

  console.log('');
  console.log('═'.repeat(56));
  console.log('  Probe complete');
  console.log('═'.repeat(56));
  console.log(`  Samples: ${outDir}`);
  console.log('  Files: health.json, search.json, frames.json, context.json (+ frame_*.jpg/png if any)');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
