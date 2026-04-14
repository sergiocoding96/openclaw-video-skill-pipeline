/**
 * Phase 2 — MiniMax Text Chat API client (workflow JSON from events).
 * @see https://platform.minimax.io/docs/api-reference/text-chat
 */

'use strict';

const DEFAULT_API_BASE = 'https://api.minimax.io';
const CHAT_PATH = '/v1/text/chatcompletion_v2';

/**
 * @param {object} opts
 * @param {Array<object>} opts.events — normalized events
 * @param {string} opts.systemPrompt — full SOP compiler instructions
 * @returns {Promise<string>} raw assistant text (expected to be JSON)
 */
async function compileWorkflowWithMiniMax({ events, systemPrompt }) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error(
      'MINIMAX_API_KEY is missing. Set it in .env or the environment before running Phase 2.'
    );
  }

  if (!systemPrompt || typeof systemPrompt !== 'string') {
    throw new Error('compileWorkflowWithMiniMax: systemPrompt is required');
  }
  if (!Array.isArray(events)) {
    throw new Error('compileWorkflowWithMiniMax: events must be an array');
  }

  const base = (process.env.MINIMAX_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
  const url = `${base}${CHAT_PATH}`;
  const model = process.env.MINIMAX_MODEL || 'MiniMax-M2.5';

  const body = {
    model,
    stream: false,
    temperature: Number(process.env.MINIMAX_TEMPERATURE) || 0.2,
    max_completion_tokens: Number(process.env.MINIMAX_MAX_TOKENS) || 4096,
    messages: [
      {
        role: 'system',
        name: 'SOPCompiler',
        content: systemPrompt,
      },
      {
        role: 'user',
        name: 'User',
        content:
          'Here is the normalized timeline as JSON. Reply with ONLY a single JSON object (no markdown fences, no commentary).\n\n' +
          JSON.stringify({ events }, null, 2),
      },
    ],
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`MiniMax network error: ${e.message || e}`);
  }

  const rawText = await res.text();
  let json;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new Error(
      `MiniMax returned non-JSON HTTP body (status ${res.status}): ${rawText.slice(0, 500)}`
    );
  }

  if (!res.ok) {
    const msg =
      json?.base_resp?.status_msg ||
      json?.message ||
      json?.error ||
      rawText.slice(0, 400);
    throw new Error(`MiniMax HTTP ${res.status}: ${msg}`);
  }

  const br = json?.base_resp;
  if (br && Number(br.status_code) !== 0) {
    throw new Error(
      `MiniMax base_resp error ${br.status_code}: ${br.status_msg || 'unknown'}`
    );
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(
      `MiniMax returned empty content. Raw: ${JSON.stringify(json).slice(0, 600)}`
    );
  }

  return content.trim();
}

module.exports = {
  compileWorkflowWithMiniMax,
  DEFAULT_API_BASE,
  CHAT_PATH,
};
