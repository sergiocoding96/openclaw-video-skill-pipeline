#!/usr/bin/env node
/**
 * End-to-end: Screenpipe (last N minutes) → SKILL.md (Gemini) → MiniMax SOP compile → skills/export/<slug>/
 *
 * Prereqs:
 *   - Screenpipe running and recording (this uses the *last* N minutes of captured data, not a future 5‑minute wait).
 *   - GEMINI_API_KEY, MINIMAX_API_KEY in .env (MiniMax optional with --no-compile)
 *
 * After success, commit skills/export/<slug> and run the "Publish skill to badass-skills" GitHub Action
 * (or push to badass-skills manually).
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');

function getArg(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
}

function parseArgs(argv) {
  const mFlag = getArg(argv, '--minutes');
  let minutes = NaN;
  if (mFlag != null && mFlag !== '') {
    minutes = Number(mFlag);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      console.error('ERROR: --minutes must be a positive number.');
      process.exit(1);
    }
  } else if (
    argv[0] &&
    !argv[0].startsWith('-') &&
    Number.isFinite(Number(argv[0])) &&
    Number(argv[0]) > 0
  ) {
    minutes = Number(argv[0]);
  } else {
    minutes = 5;
  }
  const exportSlug = getArg(argv, '--export-slug');
  const noCompile = argv.includes('--no-compile');
  return { minutes, exportSlug, noCompile };
}

function findLatestScreenpipeLiveDir() {
  const base = path.join(repoRoot, 'pipeline-output');
  if (!fs.existsSync(base)) return null;
  const dirs = fs
    .readdirSync(base, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('screenpipe-live_'))
    .map(d => {
      const full = path.join(base, d.name);
      return { name: d.name, full, mtime: fs.statSync(full).mtimeMs };
    });
  dirs.sort((a, b) => b.mtime - a.mtime);
  return dirs[0] || null;
}

function findSkillSubdir(liveDir) {
  const skillRoot = path.join(liveDir, 'skill');
  if (!fs.existsSync(skillRoot)) return null;
  const subs = fs.readdirSync(skillRoot, { withFileTypes: true }).filter(d => d.isDirectory());
  if (subs.length === 0) return null;
  subs.sort((a, b) => a.name.localeCompare(b.name));
  return path.join(skillRoot, subs[0].name);
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, name.name);
    const d = path.join(dest, name.name);
    if (name.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function findLatestManifest() {
  const dir = path.join(repoRoot, 'results', 'manifests');
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter(f => f.endsWith('-workflow.json'))
    .map(f => ({ f, full: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }));
  files.sort((a, b) => b.mtime - a.mtime);
  return files[0] || null;
}

function main() {
  const argv = process.argv.slice(2);
  const { minutes, exportSlug, noCompile } = parseArgs(argv);

  console.log('');
  console.log('═'.repeat(60));
  console.log('  E2E: Screenpipe → SKILL.md → MiniMax → skills/export');
  console.log('═'.repeat(60));
  console.log(`  Minutes window: ${minutes} (last ${minutes} min of Screenpipe data)`);
  console.log('  Start Screenpipe first (default API http://127.0.0.1:3030; set SCREENPIPE_URL if needed).');
  console.log('');

  const liveScript = path.join(repoRoot, 'screenpipe', 'live-to-skill.js');
  try {
    execSync(`node "${liveScript}" --minutes ${minutes}`, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    });
  } catch (e) {
    console.error('');
    console.error('  live-to-skill failed. Is Screenpipe running and recording? Check SCREENPIPE_URL in .env.');
    process.exit(e.status || 1);
  }

  const latest = findLatestScreenpipeLiveDir();
  if (!latest) {
    console.error('ERROR: No pipeline-output/screenpipe-live_* directory found after live-to-skill.');
    process.exit(1);
  }

  const liveDir = latest.full;
  const searchJson = path.join(liveDir, 'search.json');
  if (!fs.existsSync(searchJson)) {
    console.error(`ERROR: Missing ${searchJson}`);
    process.exit(1);
  }

  const skillSub = findSkillSubdir(liveDir);
  if (!skillSub || !fs.existsSync(path.join(skillSub, 'SKILL.md'))) {
    console.error('ERROR: No skill/<slug>/SKILL.md under live output.');
    process.exit(1);
  }

  const slugFromPipeline = path.basename(skillSub);
  const slug = exportSlug || slugFromPipeline;
  const safe = String(slug)
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^-+|-+$/g, '') || 'screenpipe-skill';
  const exportDir = path.join(repoRoot, 'skills', 'export', safe);

  if (!noCompile) {
    if (!process.env.MINIMAX_API_KEY) {
      console.error('ERROR: MINIMAX_API_KEY not set. Add to .env or use --no-compile to skip compilation.');
      process.exit(1);
    }
    const compileCli = path.join(repoRoot, 'src', 'cli', 'run-screenpipe-compile.js');
    try {
      execSync(`node "${compileCli}" --input "${searchJson}"`, {
        cwd: repoRoot,
        stdio: 'inherit',
        env: process.env,
      });
    } catch (e) {
      console.error('');
      console.error('  MiniMax compile failed. Check MINIMAX_API_KEY and API limits. Re-run with --no-compile to export SKILL only.');
      process.exit(e.status || 1);
    }
  } else {
    console.log('  (--no-compile: skipping MiniMax)');
  }

  fs.mkdirSync(exportDir, { recursive: true });
  copyDirRecursive(skillSub, exportDir);

  fs.mkdirSync(path.join(exportDir, 'artifacts'), { recursive: true });
  fs.copyFileSync(searchJson, path.join(exportDir, 'artifacts', 'screenpipe-search.json'));
  if (!noCompile) {
    const manifest = findLatestManifest();
    if (!manifest) {
      console.error('ERROR: No results/manifests/*-workflow.json after compile.');
      process.exit(1);
    }
    fs.copyFileSync(manifest.full, path.join(exportDir, 'artifacts', 'minimax-compilation.json'));
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log('  E2E export ready');
  console.log('═'.repeat(60));
  console.log(`  Live output:     ${liveDir}`);
  console.log(`  Exported skill:  ${exportDir}`);
  console.log(`  SKILL.md:        ${path.join(exportDir, 'SKILL.md')}`);
  console.log('');
  console.log('  Next: commit and push, then GitHub → Actions → Publish skill to badass-skills');
  console.log(`        skill_slug: ${safe}`);
  console.log(`        source_path: skills/export/${safe}`);
  console.log('═'.repeat(60));
  console.log('');
}

main();
