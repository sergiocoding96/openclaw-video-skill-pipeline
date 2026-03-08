#!/usr/bin/env node
/**
 * Record Replay Feedback
 *
 * Logs replay outcomes (success/failure per step) for a generated skill.
 * Accumulated feedback improves future skill generation for the same application.
 *
 * Usage:
 *   node record-feedback.js <skill-dir> --step <N> --status success|fail [--fix "corrected selector"] [--note "what happened"]
 *   node record-feedback.js <skill-dir> --replay success|partial|fail [--note "overall notes"]
 *   node record-feedback.js <skill-dir> --show
 *
 * Examples:
 *   node record-feedback.js pipeline-output/.../skill/my-workflow --step 3 --status fail --fix 'find role button --name "Save"' --note "text selector matched wrong element"
 *   node record-feedback.js pipeline-output/.../skill/my-workflow --replay success
 *   node record-feedback.js pipeline-output/.../skill/my-workflow --show
 */

const fs = require('fs');
const path = require('path');

const FEEDBACK_FILE = 'feedback.json';
const APP_PATTERNS_DIR = path.join(__dirname, 'app-patterns');

function loadFeedback(skillDir) {
  const feedbackPath = path.join(skillDir, FEEDBACK_FILE);
  if (fs.existsSync(feedbackPath)) {
    return JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
  }
  return {
    skill_name: path.basename(skillDir),
    created: new Date().toISOString(),
    replays: [],
    step_feedback: [],
    corrections: [],
  };
}

function saveFeedback(skillDir, feedback) {
  feedback.last_updated = new Date().toISOString();
  fs.writeFileSync(
    path.join(skillDir, FEEDBACK_FILE),
    JSON.stringify(feedback, null, 2)
  );
}

function loadSkillMeta(skillDir) {
  const skillPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return {};
  const content = fs.readFileSync(skillPath, 'utf8');
  // Extract application from SKILL.md
  const appMatch = content.match(/\*\*Application\*\*:\s*(.+)/);
  const urlMatch = content.match(/\*\*URL Pattern\*\*:\s*`(.+)`/);
  return {
    application: appMatch ? appMatch[1].trim() : 'unknown',
    url_pattern: urlMatch ? urlMatch[1].trim() : '',
  };
}

function updateAppPatterns(skillDir, feedback) {
  const meta = loadSkillMeta(skillDir);
  if (!meta.application || meta.application === 'unknown') return;

  fs.mkdirSync(APP_PATTERNS_DIR, { recursive: true });
  const appSlug = meta.application.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const patternsPath = path.join(APP_PATTERNS_DIR, `${appSlug}.json`);

  let patterns = { application: meta.application, url_pattern: meta.url_pattern, learned_patterns: [], total_replays: 0, success_rate: 0 };
  if (fs.existsSync(patternsPath)) {
    patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
  }

  // Aggregate replay stats
  const allReplays = feedback.replays || [];
  patterns.total_replays = allReplays.length;
  patterns.success_rate = allReplays.length > 0
    ? allReplays.filter(r => r.status === 'success').length / allReplays.length
    : 0;

  // Extract correction patterns (selector fixes)
  for (const correction of (feedback.corrections || [])) {
    const existing = patterns.learned_patterns.find(p =>
      p.original_selector === correction.original_selector
    );
    if (existing) {
      existing.occurrences++;
      existing.last_seen = correction.timestamp;
    } else {
      patterns.learned_patterns.push({
        type: 'selector_fix',
        original_selector: correction.original_selector,
        corrected_selector: correction.corrected_selector,
        element_context: correction.element_context,
        note: correction.note,
        occurrences: 1,
        first_seen: correction.timestamp,
        last_seen: correction.timestamp,
      });
    }
  }

  // Extract step failure patterns
  const stepFailures = (feedback.step_feedback || []).filter(s => s.status === 'fail');
  for (const sf of stepFailures) {
    const patternKey = `step_fail:${sf.failure_type || 'unknown'}`;
    const existing = patterns.learned_patterns.find(p => p.type === patternKey);
    if (existing) {
      existing.occurrences++;
    } else {
      patterns.learned_patterns.push({
        type: patternKey,
        description: sf.note || `Step ${sf.step_number} failed`,
        failure_type: sf.failure_type,
        occurrences: 1,
        first_seen: sf.timestamp,
      });
    }
  }

  patterns.last_updated = new Date().toISOString();
  fs.writeFileSync(patternsPath, JSON.stringify(patterns, null, 2));
  console.log(`  App patterns updated: ${patternsPath}`);
}

function recordStepFeedback(skillDir, stepNum, status, fix, note) {
  const feedback = loadFeedback(skillDir);

  const entry = {
    step_number: stepNum,
    status,
    timestamp: new Date().toISOString(),
  };

  if (note) entry.note = note;

  if (status === 'fail') {
    entry.failure_type = guessFailureType(note || '');
  }

  feedback.step_feedback.push(entry);

  // If there's a fix, record it as a correction
  if (fix) {
    // Try to extract the original selector from SKILL.md
    const skillPath = path.join(skillDir, 'SKILL.md');
    let originalSelector = '';
    if (fs.existsSync(skillPath)) {
      const content = fs.readFileSync(skillPath, 'utf8');
      // Find the step's execute block
      const stepRegex = new RegExp(`### ${stepNum}\\..*?\\n\\n[\\s\\S]*?\`\`\`\\n([\\s\\S]*?)\`\`\``, 'm');
      const match = content.match(stepRegex);
      if (match) {
        const lines = match[1].split('\n').filter(l => l.trim() && !l.startsWith('#'));
        originalSelector = lines[0]?.trim() || '';
      }
    }

    feedback.corrections.push({
      step_number: stepNum,
      original_selector: originalSelector,
      corrected_selector: fix,
      element_context: note || '',
      note: note || '',
      timestamp: new Date().toISOString(),
    });
  }

  saveFeedback(skillDir, feedback);
  updateAppPatterns(skillDir, feedback);

  console.log(`  Recorded: step ${stepNum} → ${status}${fix ? ' (with correction)' : ''}`);
}

function recordReplay(skillDir, status, note) {
  const feedback = loadFeedback(skillDir);

  feedback.replays.push({
    status,
    timestamp: new Date().toISOString(),
    note: note || '',
    steps_succeeded: feedback.step_feedback.filter(s => s.status === 'success').length,
    steps_failed: feedback.step_feedback.filter(s => s.status === 'fail').length,
  });

  saveFeedback(skillDir, feedback);
  updateAppPatterns(skillDir, feedback);

  const total = feedback.replays.length;
  const successes = feedback.replays.filter(r => r.status === 'success').length;
  console.log(`  Replay recorded: ${status} (${successes}/${total} successful replays)`);
}

function showFeedback(skillDir) {
  const feedback = loadFeedback(skillDir);

  console.log(`\n  Feedback for: ${feedback.skill_name}`);
  console.log('─'.repeat(50));

  // Replay summary
  const replays = feedback.replays || [];
  if (replays.length) {
    const successes = replays.filter(r => r.status === 'success').length;
    console.log(`  Replays: ${replays.length} total, ${successes} successful (${(successes / replays.length * 100).toFixed(0)}%)`);
  } else {
    console.log('  Replays: none recorded');
  }

  // Step failures
  const failures = (feedback.step_feedback || []).filter(s => s.status === 'fail');
  if (failures.length) {
    console.log(`\n  Step failures (${failures.length}):`);
    for (const f of failures) {
      console.log(`    Step ${f.step_number}: ${f.note || f.failure_type || 'failed'}${f.timestamp ? ` (${f.timestamp.substring(0, 10)})` : ''}`);
    }
  }

  // Corrections
  const corrections = feedback.corrections || [];
  if (corrections.length) {
    console.log(`\n  Corrections (${corrections.length}):`);
    for (const c of corrections) {
      console.log(`    Step ${c.step_number}: "${c.original_selector}" → "${c.corrected_selector}"`);
      if (c.note) console.log(`      Note: ${c.note}`);
    }
  }

  // App patterns
  const meta = loadSkillMeta(skillDir);
  if (meta.application) {
    const appSlug = meta.application.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const patternsPath = path.join(APP_PATTERNS_DIR, `${appSlug}.json`);
    if (fs.existsSync(patternsPath)) {
      const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
      if (patterns.learned_patterns?.length) {
        console.log(`\n  Learned patterns for ${meta.application} (${patterns.learned_patterns.length}):`);
        for (const p of patterns.learned_patterns) {
          if (p.type === 'selector_fix') {
            console.log(`    FIX: "${p.original_selector}" → "${p.corrected_selector}" (${p.occurrences}x)`);
          } else {
            console.log(`    ${p.type}: ${p.description} (${p.occurrences}x)`);
          }
        }
      }
    }
  }

  console.log('');
}

function guessFailureType(note) {
  const lower = note.toLowerCase();
  if (lower.includes('not found') || lower.includes('no element')) return 'element_not_found';
  if (lower.includes('timeout') || lower.includes('timed out')) return 'timeout';
  if (lower.includes('wrong') || lower.includes('incorrect')) return 'wrong_element';
  if (lower.includes('multiple') || lower.includes('ambiguous')) return 'ambiguous_selector';
  if (lower.includes('stale') || lower.includes('detach')) return 'stale_reference';
  if (lower.includes('login') || lower.includes('auth')) return 'auth_required';
  return 'unknown';
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Record Replay Feedback
=======================
Usage:
  node record-feedback.js <skill-dir> --step <N> --status success|fail [--fix "selector"] [--note "text"]
  node record-feedback.js <skill-dir> --replay success|partial|fail [--note "text"]
  node record-feedback.js <skill-dir> --show

Examples:
  node record-feedback.js ./skill/my-workflow --step 3 --status fail --fix 'find role button --name "Save"' --note "text matched wrong element"
  node record-feedback.js ./skill/my-workflow --replay success --note "all steps completed"
  node record-feedback.js ./skill/my-workflow --show
    `);
    process.exit(0);
  }

  const skillDir = path.resolve(args[0]);
  if (!fs.existsSync(skillDir)) {
    console.error(`ERROR: Skill directory not found: ${skillDir}`);
    process.exit(1);
  }

  const getArg = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : null;
  };

  if (args.includes('--show')) {
    showFeedback(skillDir);
    return;
  }

  if (args.includes('--replay')) {
    const status = getArg('--replay');
    const note = getArg('--note');
    recordReplay(skillDir, status, note);
    return;
  }

  if (args.includes('--step')) {
    const stepNum = parseInt(getArg('--step'));
    const status = getArg('--status');
    const fix = getArg('--fix');
    const note = getArg('--note');

    if (!stepNum || !status) {
      console.error('ERROR: --step requires a number and --status requires success|fail');
      process.exit(1);
    }

    recordStepFeedback(skillDir, stepNum, status, fix, note);
    return;
  }

  console.error('ERROR: Specify --step, --replay, or --show');
  process.exit(1);
}

main();
