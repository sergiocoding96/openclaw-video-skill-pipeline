#!/usr/bin/env node
/**
 * Phase 2 CLI — Screenpipe search.json → normalized events → SOP JSON (MiniMax).
 *
 * Usage:
 *   node src/cli/run-screenpipe-compile.js --input screenpipe-samples/<timestamp>/search.json
 */

'use strict';

require('dotenv').config({
  path: require('path').join(__dirname, '..', '..', '.env'),
});

const fs = require('fs');
const path = require('path');
const { normalizeEvents } = require('../compiler/normalize-events');
const { compileSOP } = require('../compiler/compile-sop');

function getArg(argv, name) {
  const i = argv.indexOf(name);
  if (i === -1 || i + 1 >= argv.length) return null;
  return argv[i + 1];
}

function usage() {
  console.log(`
Screenpipe → SOP compiler (Phase 2)

Usage:
  node src/cli/run-screenpipe-compile.js --input <path-to-search.json>

Requires:
  MINIMAX_API_KEY in .env (or environment)
Optional:
  MINIMAX_API_BASE   (default https://api.minimax.io)
  MINIMAX_MODEL      (default MiniMax-M2.5)
`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    usage();
    process.exit(0);
  }

  const inputPath = path.resolve(getArg(argv, '--input') || '');
  if (!getArg(argv, '--input') || !inputPath) {
    console.error('ERROR: --input path-to-search.json is required.');
    usage();
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: file not found: ${inputPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const normalized = normalizeEvents(raw);

  console.log(`Loaded: ${inputPath}`);
  console.log(`Normalized events: ${normalized.length}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const outDir = path.join(__dirname, '..', '..', 'results', 'manifests');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${stamp}-workflow.json`);

  try {
    const { sop, rawText } = await compileSOP(normalized);
    const payload = {
      generated_at: new Date().toISOString(),
      input: inputPath,
      event_count: normalized.length,
      sop,
      _model_raw_preview: rawText.slice(0, 2000),
    };
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`Wrote: ${outFile}`);
    console.log(`Workflow: ${sop.title || sop.workflow_id || '(untitled)'}`);
  } catch (e) {
    const errPayload = {
      generated_at: new Date().toISOString(),
      input: inputPath,
      event_count: normalized.length,
      error: e.message || String(e),
      rawText: e.rawText || null,
    };
    fs.writeFileSync(outFile, JSON.stringify(errPayload, null, 2), 'utf8');
    console.error(`FAILED: ${e.message || e}`);
    console.error(`Debug artifact written: ${outFile}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
