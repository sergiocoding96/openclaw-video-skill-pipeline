#!/usr/bin/env node
/**
 * MCP server: list and read skills from a local clone of badass-skills (folders with SKILL.md).
 *
 * Env:
 *   BADASS_SKILLS_ROOT — absolute path to repo root (parent of gemini-video/, pdf/, etc.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function resolveRoot() {
  const r = process.env.BADASS_SKILLS_ROOT;
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

function listSkillSlugs(root) {
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

function toolError(message) {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

const mcpServer = new McpServer({
  name: 'badass-skills',
  version: '1.0.0',
});

mcpServer.registerTool(
  'list_skills',
  {
    description:
      'List skill folder names under BADASS_SKILLS_ROOT that contain SKILL.md (badass-skills layout).',
  },
  async () => {
    try {
      const root = resolveRoot();
      const skills = listSkillSlugs(root);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ badass_skills_root: root, skills }, null, 2),
          },
        ],
      };
    } catch (err) {
      return toolError(err instanceof Error ? err.message : String(err));
    }
  }
);

mcpServer.registerTool(
  'get_skill',
  {
    description: 'Read the full SKILL.md file for one skill slug.',
    inputSchema: {
      skill_slug: z.string().describe('Folder name, e.g. gemini-video'),
    },
  },
  async ({ skill_slug }) => {
    try {
      if (!SLUG_RE.test(skill_slug)) {
        return toolError('Invalid skill_slug');
      }
      const rootResolved = resolveRoot();
      const resolved = path.resolve(path.join(rootResolved, skill_slug, 'SKILL.md'));
      const rel = path.relative(rootResolved, resolved);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return toolError('Invalid path');
      }
      if (!fs.existsSync(resolved)) {
        return toolError(`No SKILL.md at ${resolved}`);
      }
      const text = fs.readFileSync(resolved, 'utf8');
      return {
        content: [{ type: 'text', text }],
      };
    } catch (err) {
      return toolError(err instanceof Error ? err.message : String(err));
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
