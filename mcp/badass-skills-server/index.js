#!/usr/bin/env node
/**
 * MCP server: list and read skills from a local clone of badass-skills (folders with SKILL.md).
 *
 * Env:
 *   BADASS_SKILLS_ROOT — absolute path to repo root (parent of gemini-video/, pdf/, etc.)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolveRoot, listSkillSlugs, readSkillMarkdown } from './skill-store.js';

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
      const rootResolved = resolveRoot();
      const result = readSkillMarkdown(rootResolved, skill_slug);
      if (!result.ok) {
        return toolError(result.error);
      }
      return {
        content: [{ type: 'text', text: result.text }],
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
