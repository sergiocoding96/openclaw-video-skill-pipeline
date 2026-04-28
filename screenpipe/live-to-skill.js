#!/usr/bin/env node
/**
 * Screenpipe Live → SKILL.md pipeline.
 *
 * Queries the local Screenpipe API for recent screen activity,
 * sends the captured OCR data + frames to Gemini for workflow analysis,
 * then generates a verified SKILL.md.
 *
 * Usage:
 *   node screenpipe/live-to-skill.js --minutes 5
 *   node screenpipe/live-to-skill.js 5
 *   node screenpipe/live-to-skill.js --since <ISO> --until <ISO>
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { createScreenpipeClient, ScreenpipeApiError } = require('./screenpipe-client');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.error('ERROR: GEMINI_API_KEY not set in .env');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_KEY);

// Apps that are almost always "the editor in which the user was preparing
// to do something" rather than the workflow target. Filtered out of the
// Gemini context unless every capture is from one of them.
const EXCLUDED_APPS = new Set([
  'Cursor.exe', 'Code.exe', 'Code - Insiders.exe', 'devenv.exe',
  'idea64.exe', 'pycharm64.exe', 'webstorm64.exe', 'rubymine64.exe',
  'clion64.exe', 'goland64.exe', 'rider64.exe', 'phpstorm64.exe',
  'sublime_text.exe', 'notepad++.exe', 'atom.exe',
  'WindowsTerminal.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe',
  'explorer.exe',
]);

function isExcludedApp(item) {
  const app = item?.content?.app_name;
  return app && EXCLUDED_APPS.has(app);
}

function filterOutEditors(items) {
  if (!items.length) return items;
  const kept = items.filter(it => !isExcludedApp(it));
  // If everything came from editors, we'd rather have something than nothing.
  return kept.length ? kept : items;
}

// Single-line UI snapshot longer than this is almost certainly a flattened
// screen dump (Windows UIA fallback when the target window isn't cleanly
// focused — e.g. mid task-switch), not a real a11y tree. These are OCR-grade
// noise: they crowd Gemini's context and produce zero useful element labels
// after the ≤80-char filter in buildA11yInventory.
const FLATTENED_BLOB_MIN_LEN = 200;

function isFlattenedBlob(item) {
  const text = item?.content?.text || '';
  if (!text) return false;
  if (text.includes('\n') || text.includes('\r')) return false;
  return text.length >= FLATTENED_BLOB_MIN_LEN;
}

function filterFlattenedBlobs(items) {
  if (!items.length) return items;
  const kept = items.filter(i => !isFlattenedBlob(i));
  return kept.length ? kept : items;
}

const MAX_TEXT_CONTENT_LEN = 80;

function compactText(s) {
  if (!s) return '';
  const first = String(s).split(/\r?\n/)[0].trim();
  if (first.length <= MAX_TEXT_CONTENT_LEN) return first;
  return first.slice(0, MAX_TEXT_CONTENT_LEN - 1) + '…';
}

// ─── Arg parsing (same logic as screenpipe-probe.js) ────────────────────────

function getArg(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
}

function parseArgs(argv) {
  const minutesRaw = getArg(argv, '--minutes');
  const since = getArg(argv, '--since');
  const until = getArg(argv, '--until');
  const baseUrlOverride = getArg(argv, '--base-url');
  const modelOverride = getArg(argv, '--model');

  // Bare number shorthand
  const firstArg = argv[0];
  const bareMinutes =
    minutesRaw == null && since == null && until == null &&
    firstArg && !firstArg.startsWith('-') && Number.isFinite(Number(firstArg))
      ? firstArg : null;

  if (bareMinutes != null || minutesRaw != null) {
    const n = Number(bareMinutes || minutesRaw);
    if (!Number.isFinite(n) || n <= 0) {
      console.error('ERROR: minutes must be a positive number.');
      process.exit(1);
    }
    const end = new Date();
    const start = new Date(end.getTime() - n * 60 * 1000);
    return { start_time: start.toISOString(), end_time: end.toISOString(), baseUrlOverride, modelOverride };
  }

  if (since && until) {
    return { start_time: since, end_time: until, baseUrlOverride, modelOverride };
  }

  console.error('Usage: node screenpipe/live-to-skill.js --minutes <N>');
  console.error('       node screenpipe/live-to-skill.js <N>');
  process.exit(1);
}

// ─── UI (accessibility tree) normalization ──────────────────────────────────

// Screenpipe v0.3.x emits a11y as { app_name, window_name, text, ... } where
// `text` is a newline-separated dump of element labels from the OS a11y tree.
// Some lines follow "Role: Name" pattern (e.g. "Button: Contactar",
// "Explorer Section: openclaw"), others are plain names (".env", "Mute").
// We parse each line into { role, name } pseudo-elements.

const A11Y_ROLE_PREFIXES = new Set([
  'button', 'link', 'heading', 'image', 'list', 'listitem', 'menu', 'menuitem',
  'tab', 'tabpanel', 'checkbox', 'radio', 'textbox', 'combobox', 'searchbox',
  'group', 'region', 'section', 'navigation', 'main', 'banner', 'dialog',
  'toolbar', 'tree', 'treeitem', 'row', 'cell', 'columnheader', 'rowheader',
  'explorer section', 'tab group', 'tool bar', 'status bar',
]);

// UIA attaches state suffixes to element names on Windows desktop apps:
//   "Hi Lili,. Modified."  → dirty-flag on a Notepad tab
//   "Bold (Ctrl+B)"        → keyboard shortcut on a toolbar button
// These are stateful metadata, not part of the element's identity. Strip them
// so the inventory dedupes cleanly and Gemini sees "Bold", not "Bold (Ctrl+B)".
const MODIFIED_SUFFIX_RE = /\.\s*Modified\.?\s*$/;
const SHORTCUT_SUFFIX_RE = /\s*\((?:Ctrl|Control|Alt|Shift|Cmd|Command|Meta|Win)\s*\+[^)]+\)\s*$/i;

function parseA11yLine(line) {
  const s0 = (line || '').trim();
  if (!s0) return null;
  // Skip URLs and pure punctuation
  if (/^https?:\/\//i.test(s0)) return { role: 'link', name: s0 };

  const stripped = s0.replace(MODIFIED_SUFFIX_RE, '').replace(SHORTCUT_SUFFIX_RE, '').trim();
  const s = stripped || s0;

  const colonIdx = s.indexOf(':');
  if (colonIdx > 0 && colonIdx < 40) {
    const maybeRole = s.slice(0, colonIdx).trim().toLowerCase();
    const rest = s.slice(colonIdx + 1).trim();
    if (rest && A11Y_ROLE_PREFIXES.has(maybeRole)) {
      return { role: maybeRole.replace(/\s+/g, '_'), name: rest };
    }
  }
  return { role: null, name: s };
}

function normalizeUiEvent(item) {
  const c = item.content || {};
  const rawText = (c.text || '').toString();

  // If the server ever returns a structured elements array, prefer it.
  let elements = Array.isArray(c.elements)
    ? c.elements.map(el => ({
        role: el.role || el.aria_role || el.element_type || null,
        name: el.name || el.label || el.text || null,
        value: el.value != null ? el.value : null,
      }))
    : null;

  // Fall back: parse the text dump line-by-line.
  if (!elements && rawText) {
    elements = rawText
      .split(/\r?\n/)
      .map(parseA11yLine)
      .filter(Boolean);
  }

  return {
    app: c.app_name || c.app || null,
    window: c.window_name || c.window_title || c.window || null,
    url: c.browser_url || c.url || null,
    role: c.role || c.aria_role || null,
    name: c.name || c.label || null,
    value: c.value != null ? c.value : null,
    text: rawText,
    timestamp: c.timestamp || null,
    frame_id: c.frame_id != null ? Number(c.frame_id) : (c.id != null ? Number(c.id) : null),
    elements: elements && elements.length ? elements : null,
  };
}

function uiEventToLines(ui) {
  const lines = [];
  if (ui.role || ui.name) {
    const role = ui.role || 'element';
    const name = ui.name || '';
    const value = ui.value != null && ui.value !== '' ? ` = "${ui.value}"` : '';
    lines.push(`  - ${role}: "${name}"${value}`);
  }
  if (ui.elements) {
    for (const el of ui.elements.slice(0, 80)) {
      const role = el.role || 'element';
      const name = el.name || '';
      const value = el.value != null && el.value !== '' ? ` = "${el.value}"` : '';
      if (!name && !value) continue;
      lines.push(`  - ${role}: "${name}"${value}`);
    }
  }
  if (!lines.length && ui.text) {
    lines.push(`  - text: "${ui.text.slice(0, 200)}"`);
  }
  return lines;
}

// ─── Gemini analysis ────────────────────────────────────────────────────────

// Labels that look like browser-tab metadata rather than clickable elements.
const TAB_NOISE_PATTERNS = [
  / - Memory usage - /i,
  / - Google Chrome$/i,
  / - Microsoft​? Edge$/i,
  / - Mozilla Firefox$/i,
  /^https?:\/\//i,
  /^chrome:\/\//i,
  /^about:/i,
];

function isTabNoise(name) {
  for (const p of TAB_NOISE_PATTERNS) {
    if (p.test(name)) return true;
  }
  // Heavy metadata strings (multiple " | " separators + dashes) are usually tab titles.
  const pipeCount = (name.match(/\s\|\s/g) || []).length;
  const dashCount = (name.match(/\s-\s/g) || []).length;
  if (pipeCount + dashCount >= 3) return true;
  return false;
}

function buildA11yInventory(uiData) {
  const seen = new Set();
  const entries = [];
  for (const raw of uiData) {
    const ui = normalizeUiEvent(raw);
    if (!ui.elements) continue;
    for (const el of ui.elements) {
      const name = (el.name || '').trim();
      if (!name || name.length > MAX_TEXT_CONTENT_LEN) continue;
      if (isTabNoise(name)) continue;
      const key = `${el.role || ''}|${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ role: el.role || null, name });
    }
  }
  return entries;
}

async function analyzeWithGemini(ocrData, uiData, frames, modelName) {
  const model = genAI.getGenerativeModel({ model: modelName });

  // Build context from OCR data
  const ocrContext = ocrData.map((item, i) => {
    const c = item.content;
    return `--- Frame ${i + 1} (frame_id: ${c.frame_id}) ---
App: ${c.app_name}
Window: ${c.window_name}
Time: ${c.timestamp}
OCR Text:
${c.text}
`;
  }).join('\n');

  // Build context from UI (accessibility-tree) events — this is the app itself
  // telling the OS what each element is (role + name + value), not pixel text.
  const uiContext = uiData.map((raw, i) => {
    const ui = normalizeUiEvent(raw);
    const header = `--- UI Snapshot ${i + 1}${ui.frame_id != null ? ` (frame_id: ${ui.frame_id})` : ''} ---
App: ${ui.app || 'unknown'}
Window: ${ui.window || 'unknown'}
${ui.url ? `URL: ${ui.url}\n` : ''}Time: ${ui.timestamp || 'unknown'}
Elements (role: name = value):`;
    const body = uiEventToLines(ui).join('\n') || '  (no structured elements in this snapshot)';
    return `${header}\n${body}`;
  }).join('\n\n');

  // Deduped inventory of real element labels from the a11y tree. Gemini should
  // pick text_content from this list rather than inventing or dumping OCR.
  const inventory = buildA11yInventory(uiData);
  const inventoryLines = inventory
    .slice(0, 300)
    .map(e => `  - ${e.role ? e.role + ': ' : ''}"${e.name}"`)
    .join('\n');

  const prompt = `You are analyzing screen recordings captured by Screenpipe to extract a replayable workflow.

You are given two signals per time window:
  1. OCR text (pixel text read from screenshots — unreliable, no semantics).
  2. UI accessibility-tree labels (${uiData.length} snapshots available) — the app's real element NAMES on Windows UIA. These are authoritative for element names but on this platform the ROLE is NOT reliably present in the dump. Some lines come with a role prefix (e.g. "Button: Save", "Explorer Section: src") but most do NOT.

Rules for combining these signals:
  - For target_element.text_content, use the label exactly as it appears in the a11y inventory below.
  - For target_element.aria_role, INFER it yourself from the screenshot + context. Do NOT default to "generic". Use one of: button / link / tab / menuitem / textbox / searchbox / combobox / checkbox / radio / heading / image. Example: an element named "Reload" on a Chrome toolbar is a button; "Back" on a browser is a button; an underlined label that navigates is a link; a tab in the browser's tab strip is a tab; a form input is a textbox.
  - Fall back to OCR only when no a11y label plausibly matches the element the user interacted with.

HARD CONSTRAINTS on every step's target_element.text_content:
  - Must be ≤ ${MAX_TEXT_CONTENT_LEN} characters.
  - Must be the exact label of a SINGLE UI element (e.g. "Contactar", "Account Name", "New"), NOT a scene description and NOT a dump of OCR.
  - Must be picked from the "Available a11y element labels" list below whenever the step targets a UI element. Only invent a label if the step truly targets something not in the list (e.g. typing into a currently-focused field with no name).
  - For action_type "keyboard_shortcut", set text_content to the shortcut itself (e.g. "Control+A", "Control+S"). Do not include spaces around "+".
  - For action_type "type", text_content is the name of the field being typed into; put the actual typed value in input_data.

Each OCR frame shows what was on screen at that moment — the app, window title, and all visible text (OCR).

Analyze these frames and extract the workflow the user was performing. Identify:
1. What application(s) were being used
2. What specific actions/steps the user took (clicks, typing, navigation)
3. The logical sequence of the workflow
4. What each step accomplishes

IMPORTANT: Focus on the ACTUAL USER ACTIONS, not just what's displayed. Look for changes between frames to infer actions.

Return a JSON object with this structure:
{
  "workflow_title": "Short descriptive title",
  "application": "Main application name",
  "application_url_pattern": "URL pattern if web app, or null",
  "login_required": true/false,
  "workflow_summary": "2-3 sentence summary",
  "steps": [
    {
      "step_number": 1,
      "step_type": "action" or "informational",
      "action_type": "click" | "type" | "navigate" | "scroll" | "select" | "keyboard_shortcut",
      "timestamp_approx": "0:00",
      "target_element": {
        "text_content": "Exact text on the element",
        "visual_description": "Description of what to interact with",
        "aria_role": "button" | "tab" | "textbox" | "link" | "menuitem" | "generic",
        "location_on_screen": "top-left" | "center" | "bottom-right" | etc
      },
      "narration_context": "What this step does in context",
      "why_this_action": "Business reason for this step",
      "expected_result": "What should happen after this action",
      "wait_condition": "networkidle" | null,
      "possible_failure": "What could go wrong and how to recover"
    }
  ],
  "decision_points": [
    {
      "at_step": 1,
      "description": "What decision needs to be made",
      "how_to_decide": "How to make the decision"
    }
  ]
}

Return ONLY the JSON, no markdown fences.

=== AVAILABLE A11Y ELEMENT LABELS (pick text_content from here) ===

${inventoryLines || '(no labeled elements found — may be an editor/terminal with thin UIA tree)'}

=== CAPTURED UI ACCESSIBILITY TREE (authoritative) ===

${uiContext || '(no UI snapshots captured — UI monitoring may be disabled in Screenpipe)'}

=== CAPTURED OCR (fallback, may be noisy) ===

${ocrContext}`;

  // Include actual frame images if available
  const parts = [];

  for (const frame of frames.slice(0, 5)) {
    if (frame.data) {
      parts.push({
        inlineData: {
          data: frame.data.toString('base64'),
          mimeType: frame.contentType || 'image/jpeg',
        },
      });
    }
  }

  parts.push({ text: prompt });

  const result = await model.generateContent(parts);
  const text = result.response.text();

  // Parse JSON from response
  let analysis;
  try {
    analysis = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { analysis = JSON.parse(m[0]); } catch (e) {
        throw new Error(`Failed to parse Gemini response as JSON: ${e.message}\nRaw: ${text.substring(0, 500)}`);
      }
    } else {
      throw new Error(`Gemini response is not JSON:\n${text.substring(0, 500)}`);
    }
  }

  return analysis;
}

// ─── Ground steps with frame data ───────────────────────────────────────────

const ROLE_VERB = {
  button: 'click', tab: 'click', link: 'click', menuitem: 'click',
  checkbox: 'click', radio: 'click', option: 'click', treeitem: 'click',
  textbox: 'fill', searchbox: 'fill', combobox: 'fill', spinbutton: 'fill',
};

const SHORTCUT_MODIFIER_RE = /\b(control|ctrl|shift|alt|meta|cmd|command|win)\b/i;
const SINGLE_KEY_NAMES = new Set([
  'Enter', 'Escape', 'Esc', 'Tab', 'Backspace', 'Delete', 'Del',
  'Home', 'End', 'PageUp', 'PageDown', 'Space',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);
function looksLikeShortcut(s) {
  if (!s) return false;
  const t = String(s).trim();
  if (SHORTCUT_MODIFIER_RE.test(t)) return true;
  if (/^F([1-9]|1[0-2])$/.test(t)) return true;
  if (SINGLE_KEY_NAMES.has(t)) return true;
  return false;
}

function normalizeShortcut(s) {
  return String(s || '')
    .trim()
    .replace(/\s*\+\s*/g, '+')
    .replace(/\bctrl\b/gi, 'Control')
    .replace(/\bcmd\b/gi, 'Meta')
    .replace(/\balt\b/gi, 'Alt')
    .replace(/\bshift\b/gi, 'Shift');
}

function buildSelector(role, name, inputData, actionType) {
  const safeName = String(name || '').replace(/"/g, '\\"');

  if (actionType === 'keyboard_shortcut') {
    return `openclaw browser key "${normalizeShortcut(name)}"`;
  }

  const verb = ROLE_VERB[role] || 'click';
  const knownRoles = new Set([
    'button', 'tab', 'link', 'menuitem', 'checkbox', 'radio', 'option',
    'treeitem', 'textbox', 'searchbox', 'combobox', 'spinbutton', 'heading',
  ]);
  if (!knownRoles.has(role)) {
    return `openclaw browser find text "${safeName}" click`;
  }
  if (verb === 'fill') {
    const val = String(inputData || '').replace(/"/g, '\\"');
    return `openclaw browser find role ${role} --name "${safeName}" fill "${val}"`;
  }
  return `openclaw browser find role ${role} --name "${safeName}" click`;
}

// Search normalized UI snapshots for an element matching the step's target text.
// Returns { ui, match } where match is { role, name, value } of the specific element.
function findUiMatch(uiData, textContent) {
  const needle = (textContent || '').toLowerCase().trim();
  if (!needle) return null;

  for (const raw of uiData) {
    const ui = normalizeUiEvent(raw);

    // Top-level element on this snapshot
    if (ui.name && ui.name.toLowerCase().includes(needle)) {
      return { ui, match: { role: ui.role, name: ui.name, value: ui.value } };
    }
    if (ui.value && String(ui.value).toLowerCase().includes(needle)) {
      return { ui, match: { role: ui.role, name: ui.name, value: ui.value } };
    }

    // Child elements
    if (ui.elements) {
      for (const el of ui.elements) {
        const name = el.name || el.label || el.text || '';
        const val = el.value != null ? String(el.value) : '';
        if (name && name.toLowerCase().includes(needle)) {
          return {
            ui,
            match: {
              role: el.role || el.aria_role || el.element_type || 'generic',
              name,
              value: el.value != null ? el.value : null,
            },
          };
        }
        if (val && val.toLowerCase().includes(needle)) {
          return {
            ui,
            match: {
              role: el.role || el.aria_role || el.element_type || 'generic',
              name,
              value: el.value,
            },
          };
        }
      }
    }
  }
  return null;
}

function groundStepsWithSignals(analysis, ocrData, uiData, contexts) {
  for (const step of (analysis.steps || [])) {
    if (step.step_type !== 'action') continue;

    const el = step.target_element || {};
    // Guard: Gemini occasionally ignores the length constraint and dumps
    // whole-window OCR into text_content. Collapse to the first line and trim.
    if (el.text_content && el.text_content.length > MAX_TEXT_CONTENT_LEN) {
      el.text_content = compactText(el.text_content);
    }
    const textContent = el.text_content || '';

    // Keyboard shortcuts don't need a11y matching — the label IS the shortcut.
    if (step.action_type === 'keyboard_shortcut') {
      if (!looksLikeShortcut(textContent)) {
        // Gemini misused the action type — downgrade to click so a11y grounding runs below.
        step.action_type = 'click';
      } else {
        el._grounded_selector = buildSelector(null, textContent, null, 'keyboard_shortcut');
        el._grounded_alt_selector = 'openclaw browser snapshot --interactive';
        el._grounding_source = 'shortcut';
        el._grounding_confidence = 0.9;
        continue;
      }
    }

    // Prefer UI a11y tree: app told the OS exactly what this element is.
    const uiHit = findUiMatch(uiData, textContent);
    if (uiHit) {
      const role = (uiHit.match.role || el.aria_role || 'generic').toLowerCase();
      const name = uiHit.match.name || textContent;

      // Let the matched real role override whatever Gemini guessed from OCR.
      el.aria_role = role;
      el.text_content = name;
      el._grounded_selector = buildSelector(role, name, step.input_data, step.action_type);
      el._grounded_alt_selector = 'openclaw browser snapshot --interactive';
      el._grounding_source = 'a11y';
      el._grounding_confidence = 0.95;

      if (uiHit.ui.frame_id != null) {
        step._grounding_frame = `frame_${uiHit.ui.frame_id}.jpg`;
      }
      step._context = {
        app: uiHit.ui.app,
        window: uiHit.ui.window,
        url: uiHit.ui.url,
      };
      continue;
    }

    // Fallback: OCR text match (no semantic role — rely on Gemini's guess).
    const matchingOcr = ocrData.find(item =>
      item.content.text && item.content.text.includes(textContent)
    );

    if (matchingOcr) {
      const fid = matchingOcr.content.frame_id;
      const ctx = contexts.find(c => c.frame_id === fid);
      const role = (el.aria_role || 'generic').toLowerCase();

      step._grounding_frame = `frame_${fid}.jpg`;
      step._grounding_frame_path = matchingOcr.content.file_path;
      el._grounded_selector = buildSelector(role, textContent, step.input_data, step.action_type);
      el._grounded_alt_selector = 'openclaw browser snapshot --interactive';
      el._grounding_source = 'ocr';
      el._grounding_confidence = 0.85;

      if (ctx) {
        step._context = {
          app: ctx.app_name,
          window: ctx.window_name,
          url: ctx.browser_url,
        };
      }
    } else {
      el._grounding_source = 'none';
      el._grounding_confidence = 0.4;
      el._grounded_selector = null;
    }
  }

  return analysis;
}

// ─── Generate SKILL.md ──────────────────────────────────────────────────────

function generateSkillMd(analysis, outputDir) {
  const title = analysis.workflow_title || 'Untitled Workflow';
  const app = analysis.application || 'Unknown';
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  let md = '';
  md += `---\nname: ${slug}\n`;
  md += `description: "${title} in ${app}. Generated from live Screenpipe capture."\n`;
  md += `version: 1.0.0\nread_when:\n  - "${title}"\n  - "${app} workflow"\n  - "${app} training"\n`;
  md += `metadata: {"openclaw":{"emoji":"🎬"}}\nallowed-tools: browser(*)\n---\n\n`;

  md += `# ${title}\n\n`;
  md += `- **Application**: ${app}\n`;
  if (analysis.application_url_pattern) {
    md += `- **URL Pattern**: \`${analysis.application_url_pattern}\`\n`;
  }
  md += `- **Login Required**: ${analysis.login_required ? 'Yes' : 'No'}\n`;
  md += `\n## Summary\n\n${analysis.workflow_summary || 'N/A'}\n\n`;

  md += `## Setup\n\n\`\`\`\n`;
  if (analysis.application_url_pattern) {
    md += `openclaw browser open "${analysis.application_url_pattern}"\n`;
  }
  md += `openclaw browser wait --load networkidle\nopenclaw browser snapshot --interactive\n\`\`\`\n\n`;

  md += `## Steps\n\n`;
  const framesToCopy = [];

  for (const step of (analysis.steps || [])) {
    const isAction = step.step_type === 'action';
    const el = step.target_element || {};

    md += `### ${step.step_number}. ${isAction ? (step.action_type || 'ACTION').toUpperCase() : 'INFO'}: ${el.text_content || el.visual_description || 'N/A'}\n\n`;

    if (step.narration_context) md += `> *${step.narration_context}*\n\n`;
    if (step.why_this_action) md += `**Why**: ${step.why_this_action}\n\n`;

    if (isAction) {
      md += `**Execute**:\n\`\`\`\n`;

      const sel = el._grounded_selector;
      const confidence = el._grounding_confidence || 0;

      if (sel && confidence >= 0.7) {
        md += `${sel}\n`;
        if (el._grounded_alt_selector) md += `# Fallback: ${el._grounded_alt_selector}\n`;
      } else {
        md += `openclaw browser snapshot --interactive\n`;
        md += `# Find "${el.text_content || el.visual_description || 'target element'}" and interact\n`;
      }

      if (step.wait_condition) {
        md += `openclaw browser wait --load ${step.wait_condition}\n`;
        md += `openclaw browser snapshot --interactive  # Refresh refs\n`;
      }

      md += `\`\`\`\n\n`;

      if (step.expected_result) md += `**Verify**: ${step.expected_result}\n\n`;

      if (step._grounding_frame) {
        const frameFileName = `step_${step.step_number}.jpg`;
        if (step._grounding_frame_path) {
          framesToCopy.push({ src: step._grounding_frame_path, dest: frameFileName });
        }
        md += `**Visual Reference**: \`references/frames/${frameFileName}\`\n\n`;
      }

      if (step.possible_failure) md += `**If it fails**: ${step.possible_failure}\n\n`;
    } else {
      if (step.expected_result || step.why_this_action) {
        md += `*${step.expected_result || step.why_this_action}*\n\n`;
      }
    }

    md += `---\n\n`;
  }

  if (analysis.decision_points?.length) {
    md += `## Decision Points\n\n`;
    for (const dp of analysis.decision_points) {
      md += `- **Step ${dp.at_step}**: ${dp.description}`;
      if (dp.how_to_decide) md += ` → ${dp.how_to_decide}`;
      md += `\n`;
    }
    md += `\n`;
  }

  md += `## Agent Replay Tips\n\n`;
  md += `1. Always \`openclaw browser snapshot --interactive\` after navigation to get fresh refs\n`;
  md += `2. Refs change on every page load — never reuse refs from a previous snapshot\n`;
  md += `3. If a ref doesn't match, use \`openclaw browser snapshot --labels\` for a visual overlay\n`;
  md += `4. Verify each step using the **Verify** notes before proceeding\n\n`;
  md += `---\n*Generated from live Screenpipe capture via Gemini analysis*\n`;

  const skillDir = path.join(outputDir, 'skill', slug);
  fs.mkdirSync(path.join(skillDir, 'references', 'frames'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), md);
  fs.writeFileSync(path.join(skillDir, 'references', 'analysis.json'), JSON.stringify(analysis, null, 2));

  // Copy frame images
  let copied = 0;
  for (const { src, dest } of framesToCopy) {
    if (src && fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(skillDir, 'references', 'frames', dest));
      copied++;
    }
  }

  return { skillDir, slug, md, framesCopied: copied };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);
  const modelName = parsed.modelOverride || 'gemini-3-flash-preview';

  const client = createScreenpipeClient(
    parsed.baseUrlOverride ? { baseUrl: parsed.baseUrlOverride } : {}
  );

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const outputDir = path.join(__dirname, '..', 'pipeline-output', `screenpipe-live_${stamp}`);

  console.log('');
  console.log('═'.repeat(60));
  console.log('  Screenpipe Live → SKILL.md Pipeline');
  console.log('═'.repeat(60));
  console.log(`  Base URL: ${client.baseUrl}`);
  console.log(`  Model:    ${modelName}`);
  console.log(`  Window:   ${parsed.start_time} → ${parsed.end_time}`);
  console.log('');

  // Step 1: Health check
  console.log('  [1/5] Health check ...');
  const health = await client.health();
  if (health.status !== 'healthy') {
    console.error(`        FAILED: status = ${health.status}`);
    process.exit(1);
  }
  console.log(`        OK — ${health.status}`);
  if (health.ui_status && health.ui_status !== 'ok') {
    console.warn(`        WARN: ui_status = ${health.ui_status}. Accessibility-tree capture is disabled;`);
    console.warn('              grounding will fall back to OCR. Start Screenpipe with UI monitoring enabled');
    console.warn('              (e.g. `screenpipe --enable-ui-monitoring`) to get rich a11y data.');
  } else if (!health.ui_status) {
    console.warn('        WARN: /health did not report ui_status. If accessibility data is missing,');
    console.warn('              restart Screenpipe with UI monitoring enabled.');
  }

  // Step 2: Search screen data
  console.log('  [2/5] Searching screen data ...');
  const search = await client.search({
    start_time: parsed.start_time,
    end_time: parsed.end_time,
    limit: 50,
    content_type: 'all',
  });

  const ocrItemsRaw = search.data.filter(d => d.type === 'OCR');
  const audioItems = search.data.filter(d => d.type === 'Audio');
  const uiItemsRaw = search.data.filter(d => d.type === 'UI');

  // Drop captures from IDEs / terminals / explorer — these aren't the workflow.
  const ocrItems = filterOutEditors(ocrItemsRaw);
  const uiNoEditors = filterOutEditors(uiItemsRaw);
  // Drop flattened single-line screen-dump snapshots (unfocused desktop apps).
  const uiItems = filterFlattenedBlobs(uiNoEditors);
  const ocrDropped = ocrItemsRaw.length - ocrItems.length;
  const uiEditorsDropped = uiItemsRaw.length - uiNoEditors.length;
  const uiBlobsDropped = uiNoEditors.length - uiItems.length;

  console.log(`        Found ${ocrItemsRaw.length} OCR, ${audioItems.length} audio, ${uiItemsRaw.length} UI snapshots`);
  if (ocrDropped || uiEditorsDropped) {
    console.log(`        Filtered out ${ocrDropped} OCR + ${uiEditorsDropped} UI from editors/terminals`);
  }
  if (uiBlobsDropped) {
    console.log(`        Filtered out ${uiBlobsDropped} flattened UI snapshots (unfocused desktop windows)`);
  }

  if (ocrItems.length === 0 && uiItems.length === 0) {
    console.error('        No screen or UI data found in this time window.');
    console.error('        Make sure Screenpipe has been recording. Try a wider --minutes range.');
    process.exit(1);
  }

  // Step 3: Fetch frames + context
  console.log('  [3/5] Fetching frames and context ...');
  const frameIds = ocrItems
    .map(d => d.content.frame_id)
    .filter(id => id != null);

  const frames = [];
  const contexts = [];
  for (const fid of frameIds.slice(0, 10)) {
    try {
      const frame = await client.getFrame(fid);
      frames.push({ ...frame, frame_id: fid });
      console.log(`        Frame ${fid}: ${frame.byteLength} bytes`);
    } catch (e) {
      console.log(`        Frame ${fid}: skip (${e.message?.substring(0, 60)})`);
    }
    try {
      const ctx = await client.getFrameContext(fid);
      contexts.push({ frame_id: fid, ...ctx });
    } catch {}
  }

  // Save raw data
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'search.json'), JSON.stringify(search, null, 2));
  fs.writeFileSync(path.join(outputDir, 'contexts.json'), JSON.stringify(contexts, null, 2));

  // Save frame images
  for (const frame of frames) {
    const ext = (frame.contentType || '').includes('png') ? 'png' : 'jpg';
    fs.writeFileSync(path.join(outputDir, `frame_${frame.frame_id}.${ext}`), frame.data);
  }

  // Step 4: Analyze with Gemini
  console.log('  [4/5] Analyzing with Gemini ...');
  console.log(`        Sending ${ocrItems.length} OCR + ${uiItems.length} a11y snapshots + ${frames.length} frames to ${modelName} ...`);

  let analysis;
  try {
    analysis = await analyzeWithGemini(ocrItems, uiItems, frames, modelName);
    console.log(`        Workflow: "${analysis.workflow_title}"`);
    console.log(`        Steps: ${analysis.steps?.length || 0}`);
  } catch (e) {
    console.error(`        Gemini analysis failed: ${e.message}`);
    process.exit(1);
  }

  // Ground steps: prefer a11y tree, fall back to OCR
  analysis = groundStepsWithSignals(analysis, ocrItems, uiItems, contexts);
  const groundedA11y = analysis.steps?.filter(s => s.target_element?._grounding_source === 'a11y').length || 0;
  const groundedOcr = analysis.steps?.filter(s => s.target_element?._grounding_source === 'ocr').length || 0;
  console.log(`        Grounded: ${groundedA11y} via a11y, ${groundedOcr} via OCR`);
  const grounded = groundedA11y + groundedOcr;

  fs.writeFileSync(path.join(outputDir, 'analysis.json'), JSON.stringify(analysis, null, 2));

  // Step 5: Generate SKILL.md
  console.log('  [5/5] Generating SKILL.md ...');
  const { skillDir, slug, md, framesCopied } = generateSkillMd(analysis, outputDir);
  console.log(`        Skill: ${slug}`);
  console.log(`        Frames copied: ${framesCopied}`);

  console.log('');
  console.log('═'.repeat(60));
  console.log('  Pipeline Complete');
  console.log('═'.repeat(60));
  console.log(`  Skill path: ${path.join(skillDir, 'SKILL.md')}`);
  console.log(`  Raw data:   ${outputDir}`);
  console.log(`  Steps:      ${analysis.steps?.length || 0} (${grounded} grounded)`);
  console.log('═'.repeat(60));
  console.log('');
  console.log('--- SKILL.md ---');
  console.log(md);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
