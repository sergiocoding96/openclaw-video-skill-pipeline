/**
 * Smoke checks for the GitHub Actions workflow that publishes to badass-skills.
 * Does not run the action — validates the workflow file is present and wired.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const workflowPath = path.join(
  repoRoot,
  '.github',
  'workflows',
  'publish-skill-to-badass-skills.yml'
);

test('publish-skill-to-badass-skills workflow exists and references badass-skills', () => {
  const yml = fs.readFileSync(workflowPath, 'utf8');
  assert.ok(yml.includes('workflow_dispatch'), 'expected manual trigger');
  assert.ok(yml.includes('BADASS_SKILLS_PUBLISH_TOKEN'), 'expected PAT secret name');
  assert.ok(yml.includes('sergiocoding96/badass-skills'), 'expected target repo');
  assert.ok(yml.includes('skill_slug'), 'expected skill_slug input');
  assert.ok(yml.includes('source_path'), 'expected source_path input');
  assert.ok(yml.includes('SKILL.md'), 'expected SKILL.md check');
});
