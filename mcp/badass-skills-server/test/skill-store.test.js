import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  resolveRoot,
  listSkillSlugs,
  readSkillMarkdown,
  SLUG_RE,
} from '../skill-store.js';

test('resolveRoot rejects missing or relative BADASS_SKILLS_ROOT', () => {
  assert.throws(() => resolveRoot({}), /BADASS_SKILLS_ROOT/);
  assert.throws(() => resolveRoot({ BADASS_SKILLS_ROOT: 'relative/path' }), /absolute/);
});

test('resolveRoot resolves existing directory', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'badass-skills-test-'));
  try {
    const root = resolveRoot({ BADASS_SKILLS_ROOT: tmp });
    assert.strictEqual(root, path.resolve(tmp));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('listSkillSlugs lists only dirs with SKILL.md', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'badass-skills-test-'));
  try {
    fs.mkdirSync(path.join(tmp, 'alpha'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'alpha', 'SKILL.md'), '# a', 'utf8');
    fs.mkdirSync(path.join(tmp, 'no-md'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'readme.txt'), 'x', 'utf8');
    const slugs = listSkillSlugs(tmp);
    assert.deepStrictEqual(slugs, ['alpha']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('readSkillMarkdown reads file and rejects traversal', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'badass-skills-test-'));
  try {
    fs.mkdirSync(path.join(tmp, 'good'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'good', 'SKILL.md'), 'hello', 'utf8');
    const root = path.resolve(tmp);
    assert.deepStrictEqual(readSkillMarkdown(root, 'good'), { ok: true, text: 'hello' });
    assert.strictEqual(readSkillMarkdown(root, '../x').ok, false);
    assert.strictEqual(readSkillMarkdown(root, 'nope').ok, false);
    assert.strictEqual(readSkillMarkdown(root, 'a/b').ok, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('SLUG_RE allows expected slugs', () => {
  assert.strictEqual(SLUG_RE.test('gemini-video'), true);
  assert.strictEqual(SLUG_RE.test('a'), true);
  assert.strictEqual(SLUG_RE.test('../x'), false);
});
