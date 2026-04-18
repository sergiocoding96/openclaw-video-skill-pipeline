/**
 * Pure skill discovery / read helpers for badass-skills repo layout.
 */

import fs from 'node:fs';
import path from 'node:path';

export const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveRoot(env = process.env) {
  const r = env.BADASS_SKILLS_ROOT;
  if (!r || !path.isAbsolute(r)) {
    throw new Error(
      'BADASS_SKILLS_ROOT must be set to an absolute path (local clone of github.com/sergiocoding96/badass-skills)'
    );
  }
  const resolved = path.resolve(r);
  if (!fs.existsSync(resolved)) {
    throw new Error(`BADASS_SKILLS_ROOT does not exist: ${resolved}`);
  }
  return resolved;
}

export function listSkillSlugs(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const slugs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.')) continue;
    const skillMd = path.join(root, e.name, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      slugs.push(e.name);
    }
  }
  slugs.sort();
  return slugs;
}

/**
 * @returns {{ ok: true, text: string } | { ok: false, error: string }}
 */
export function readSkillMarkdown(rootResolved, skillSlug) {
  if (!SLUG_RE.test(skillSlug)) {
    return { ok: false, error: 'Invalid skill_slug' };
  }
  const resolved = path.resolve(path.join(rootResolved, skillSlug, 'SKILL.md'));
  const rel = path.relative(rootResolved, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'Invalid path' };
  }
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: `No SKILL.md at ${resolved}` };
  }
  const text = fs.readFileSync(resolved, 'utf8');
  return { ok: true, text };
}
