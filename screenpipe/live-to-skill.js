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

// ─── Gemini analysis ────────────────────────────────────────────────────────

async function analyzeWithGemini(ocrData, frames, modelName) {
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

  const prompt = `You are analyzing screen recordings captured by Screenpipe to extract a replayable workflow.

Below is OCR text captured from ${ocrData.length} screen frames, in chronological order.
Each frame shows what was on screen at that moment — the app, window title, and all visible text (OCR).

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

=== CAPTURED SCREEN DATA ===

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

function groundStepsWithOCR(analysis, ocrData, contexts) {
  for (const step of (analysis.steps || [])) {
    if (step.step_type !== 'action') continue;

    const el = step.target_element || {};
    const textContent = el.text_content || '';

    // Find matching OCR frame
    const matchingOcr = ocrData.find(item =>
      item.content.text && item.content.text.includes(textContent)
    );

    if (matchingOcr) {
      const fid = matchingOcr.content.frame_id;
      const ctx = contexts.find(c => c.frame_id === fid);

      step._grounding_frame = `frame_${fid}.jpg`;
      step._grounding_frame_path = matchingOcr.content.file_path;

      // Build grounded selector based on role
      const role = el.aria_role || 'generic';
      const escapedText = textContent.replace(/"/g, '\\"');

      if (role === 'button') {
        el._grounded_selector = `openclaw browser find role button --name "${escapedText}" click`;
      } else if (role === 'tab') {
        el._grounded_selector = `openclaw browser find role tab --name "${escapedText}" click`;
      } else if (role === 'textbox') {
        el._grounded_selector = `openclaw browser find role textbox --name "${escapedText}" fill "${step.input_data || ''}"`;
      } else if (role === 'link') {
        el._grounded_selector = `openclaw browser find role link --name "${escapedText}" click`;
      } else if (role === 'menuitem') {
        el._grounded_selector = `openclaw browser find role menuitem --name "${escapedText}" click`;
      } else {
        el._grounded_selector = `openclaw browser find text "${escapedText}" click`;
      }

      el._grounded_alt_selector = 'openclaw browser snapshot --interactive';
      el._grounding_confidence = 0.85;

      if (ctx) {
        step._context = {
          app: ctx.app_name,
          window: ctx.window_name,
          url: ctx.browser_url,
        };
      }
    } else {
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
  const modelName = parsed.modelOverride || 'gemini-2.5-flash';

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

  // Step 2: Search screen data
  console.log('  [2/5] Searching screen data ...');
  const search = await client.search({
    start_time: parsed.start_time,
    end_time: parsed.end_time,
    limit: 50,
    content_type: 'all',
  });

  const ocrItems = search.data.filter(d => d.type === 'OCR');
  const audioItems = search.data.filter(d => d.type === 'Audio');
  console.log(`        Found ${ocrItems.length} screen captures, ${audioItems.length} audio chunks`);

  if (ocrItems.length === 0) {
    console.error('        No screen data found in this time window.');
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
  console.log(`        Sending ${ocrItems.length} OCR captures + ${frames.length} frame images to ${modelName} ...`);

  let analysis;
  try {
    analysis = await analyzeWithGemini(ocrItems, frames, modelName);
    console.log(`        Workflow: "${analysis.workflow_title}"`);
    console.log(`        Steps: ${analysis.steps?.length || 0}`);
  } catch (e) {
    console.error(`        Gemini analysis failed: ${e.message}`);
    process.exit(1);
  }

  // Ground steps with OCR data
  analysis = groundStepsWithOCR(analysis, ocrItems, contexts);
  const grounded = analysis.steps?.filter(s => s.target_element?._grounding_confidence >= 0.7).length || 0;
  console.log(`        Grounded: ${grounded} steps`);

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
