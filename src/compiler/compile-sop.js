/**
 * Phase 2 — load SOP prompt, call MiniMax, parse structured workflow JSON.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { compileWorkflowWithMiniMax } = require('./minimax-client');

function loadSopCompilerPrompt() {
  const p = path.join(__dirname, 'prompts', 'sop-compiler.txt');
  if (!fs.existsSync(p)) {
    throw new Error(`Missing prompt file: ${p}`);
  }
  return fs.readFileSync(p, 'utf8');
}

/**
 * Extract first JSON object from model text (handles accidental fences).
 * @param {string} text
 * @returns {object}
 */
function parseModelJson(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('parseModelJson: empty text');
  }
  let s = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im;
  const m = s.match(fence);
  if (m) s = m[1].trim();

  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw new Error('No JSON object found in model output');
    }
    return JSON.parse(s.slice(start, end + 1));
  }
}

/**
 * @param {Array<object>} normalizedEvents — from normalizeEvents()
 * @returns {Promise<{ sop: object, rawText: string }>}
 */
async function compileSOP(normalizedEvents) {
  if (!Array.isArray(normalizedEvents)) {
    throw new Error('compileSOP: normalizedEvents must be an array');
  }

  const systemPrompt = loadSopCompilerPrompt();
  const rawText = await compileWorkflowWithMiniMax({
    events: normalizedEvents,
    systemPrompt,
  });

  try {
    const sop = parseModelJson(rawText);
    return { sop, rawText };
  } catch (e) {
    const err = new Error(`Failed to parse SOP JSON from model: ${e.message}`);
    err.cause = e;
    err.rawText = rawText;
    throw err;
  }
}

module.exports = {
  compileSOP,
  loadSopCompilerPrompt,
  parseModelJson,
};
