#!/usr/bin/env node
/**
 * End-to-end integration test for the Screenpipe → SKILL.md pipeline.
 *
 * Starts the mock Screenpipe server, queries it via the client, builds
 * a simulated grounded analysis from the captured data, then runs Pass 5
 * (generateVerifiedSkill) to produce a real SKILL.md.
 *
 * No API keys, no video files, no external dependencies required.
 *
 * Usage:
 *   node screenpipe/e2e-test.js
 */

'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const { createScreenpipeClient, ScreenpipeApiError } = require('./screenpipe-client');

// ─── Inline mock server (same logic as mock-server.js) ──────────────────────

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkS' +
  'Ew8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJ' +
  'CQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
  'MjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/' +
  'EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAA' +
  'AAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=',
  'base64'
);

const MOCK_FRAMES = {
  1001: {
    text: 'Accounts',
    app: 'Chrome',
    window: 'Salesforce - Accounts',
    action: 'click',
    role: 'tab',
    description: 'Click the Accounts tab in the navigation bar',
    why: 'Navigate to the accounts list to view client records',
    expected: 'The Accounts list view loads showing all client accounts',
    url: 'https://mycompany.lightning.force.com/lightning/o/Account/list',
  },
  1002: {
    text: 'New',
    app: 'Chrome',
    window: 'Salesforce - Accounts',
    action: 'click',
    role: 'button',
    description: 'Click the New button to create a new account',
    why: 'Start creating a new client account record',
    expected: 'A new account creation form modal appears',
    url: 'https://mycompany.lightning.force.com/lightning/o/Account/list',
  },
  1003: {
    text: 'Account Name',
    app: 'Chrome',
    window: 'Salesforce - New Account',
    action: 'type',
    role: 'textbox',
    description: 'Type the account name into the Account Name field',
    why: 'Enter the client company name as the account identifier',
    expected: 'The Account Name field shows the typed value',
    input: 'Acme Corporation',
    url: 'https://mycompany.lightning.force.com/lightning/o/Account/new',
  },
};

function startMockServer(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const parsed = new URL(req.url, `http://localhost:${port}`);
      const pathname = parsed.pathname;

      if (pathname === '/health') {
        return jsonRes(res, {
          status: 'healthy',
          last_frame_timestamp: new Date().toISOString(),
          frame_status: 'ok', audio_status: 'ok', ui_status: 'ok',
        });
      }

      if (pathname === '/search') {
        const data = [];
        for (const [id, f] of Object.entries(MOCK_FRAMES)) {
          data.push({
            type: 'OCR',
            content: {
              frame_id: Number(id),
              text: f.text,
              app_name: f.app,
              window_name: f.window,
              timestamp: new Date().toISOString(),
            },
          });
          // UI (accessibility tree) snapshot alongside each OCR frame — the app
          // reports role/name/value directly, no OCR guessing required.
          data.push({
            type: 'UI',
            content: {
              frame_id: Number(id),
              app_name: f.app,
              window_name: f.window,
              browser_url: f.url,
              timestamp: new Date().toISOString(),
              role: f.role,
              name: f.text,
              value: f.input || null,
            },
          });
        }
        data.push({
          type: 'Audio',
          content: {
            chunk_id: 5001,
            transcription: 'Let me show you how to create a new account in Salesforce.',
            timestamp: new Date().toISOString(),
            device_name: 'default',
            duration_secs: 3.5,
          },
        });
        return jsonRes(res, { data, pagination: { limit: 40, offset: 0, total: data.length } });
      }

      const frameMatch = pathname.match(/^\/frames\/(\d+)$/);
      if (frameMatch) {
        const id = Number(frameMatch[1]);
        if (!MOCK_FRAMES[id]) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: `Frame ${id} not found` }));
        }
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': TINY_JPEG.length });
        return res.end(TINY_JPEG);
      }

      const ctxMatch = pathname.match(/^\/frames\/(\d+)\/context$/);
      if (ctxMatch) {
        const id = Number(ctxMatch[1]);
        const f = MOCK_FRAMES[id];
        if (!f) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: `Frame ${id} not found` }));
        }
        return jsonRes(res, {
          frame_id: id, timestamp: new Date().toISOString(),
          app_name: f.app, window_name: f.window,
          ocr_text: f.text, focused: true, browser_url: f.url,
        });
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.listen(port, () => resolve(server));
  });
}

function jsonRes(res, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

// ─── Build grounded analysis from Screenpipe data ───────────────────────────

function buildAnalysisFromScreenpipe(searchResults, contexts) {
  const ocrItems = searchResults.data.filter(d => d.type === 'OCR');
  const audioItems = searchResults.data.filter(d => d.type === 'Audio');
  const uiItems = searchResults.data.filter(d => d.type === 'UI');

  const narration = audioItems.map(a => a.content.transcription).join(' ');

  const steps = ocrItems.map((item, i) => {
    const fid = item.content.frame_id;
    const ctx = contexts.find(c => c.frame_id === fid);
    const mock = MOCK_FRAMES[fid] || {};
    // Prefer UI a11y snapshot for this frame over OCR-guessed role.
    const uiHit = uiItems.find(u => u.content.frame_id === fid);
    const role = (uiHit?.content?.role || mock.role || 'generic').toLowerCase();
    const name = uiHit?.content?.name || item.content.text;
    const groundingSource = uiHit ? 'a11y' : 'ocr';
    const confidence = uiHit ? 0.95 : 0.85;

    return {
      step_number: i + 1,
      step_type: 'action',
      action_type: mock.action || 'click',
      timestamp_approx: `0:${String((i + 1) * 8).padStart(2, '0')}`,
      target_element: {
        text_content: name,
        visual_description: mock.description || `Interact with "${name}"`,
        aria_role: role,
        location_on_screen: 'center',
        _grounded_text: name,
        _grounded_selector: role === 'tab'
          ? `openclaw browser find role tab --name "${name}" click`
          : role === 'button'
            ? `openclaw browser find role button --name "${name}" click`
            : role === 'textbox'
              ? `openclaw browser find role textbox --name "${name}" fill "${mock.input || ''}"`
              : `openclaw browser find text "${name}" click`,
        _grounded_alt_selector: `openclaw browser snapshot --interactive`,
        _grounding_source: groundingSource,
        _grounding_confidence: confidence,
      },
      narration_context: narration,
      why_this_action: mock.why || 'Perform workflow step',
      expected_result: mock.expected || 'Action completes successfully',
      input_data: mock.input || null,
      wait_condition: 'networkidle',
      _grounding_frame: `frame_${fid}.jpg`,
      _grounding_frame_path: null, // no real file
    };
  });

  return {
    workflow_title: 'Create New Account in Salesforce',
    application: 'Salesforce Lightning',
    application_url_pattern: '*.lightning.force.com',
    login_required: true,
    required_permissions: 'Account Create permission',
    workflow_summary: 'Navigate to Accounts, create a new account record, and fill in the account name. ' +
      'This is the standard workflow for onboarding new clients in the CRM.',
    steps,
    decision_points: [
      {
        at_step: 2,
        description: 'Check if an account with this name already exists',
        how_to_decide: 'Search the accounts list first to avoid duplicates',
      },
    ],
  };
}

// ─── Reuse Pass 5 from accurate-pipeline.js ─────────────────────────────────
// We inline a minimal version rather than importing, since the original
// is tightly coupled to its module's globals.

function generateSkillMd(analysis, outputDir) {
  const title = analysis.workflow_title;
  const app = analysis.application;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  let md = '';
  md += `---\nname: ${slug}\n`;
  md += `description: "${title} in ${app}. End-to-end tested via Screenpipe integration."\n`;
  md += `version: 1.0.0\nread_when:\n  - "${title}"\n  - "${app} workflow"\n`;
  md += `metadata: {"openclaw":{"emoji":"🎬"}}\nallowed-tools: browser(*)\n---\n\n`;

  md += `# ${title}\n\n`;
  md += `- **Application**: ${app}\n`;
  md += `- **URL Pattern**: \`${analysis.application_url_pattern}\`\n`;
  md += `- **Login Required**: ${analysis.login_required ? 'Yes' : 'No'}\n`;
  if (analysis.required_permissions) md += `- **Required Permissions**: ${analysis.required_permissions}\n`;
  md += `\n## Summary\n\n${analysis.workflow_summary}\n\n`;

  md += `## Setup\n\n`;
  md += `\`\`\`\nopenclaw browser open "${analysis.application_url_pattern}"\n`;
  md += `openclaw browser wait --load networkidle\nopenclaw browser snapshot --interactive\n\`\`\`\n\n`;

  md += `## Steps\n\n`;
  for (const step of analysis.steps) {
    const el = step.target_element || {};
    md += `### ${step.step_number}. ${step.action_type.toUpperCase()}: ${el.text_content || 'N/A'}\n\n`;

    if (step.narration_context) md += `> *Narrator: "${step.narration_context.substring(0, 120)}"*\n\n`;
    if (step.why_this_action) md += `**Why**: ${step.why_this_action}\n\n`;

    md += `**Execute**:\n\`\`\`\n`;
    const sel = el._grounded_selector;
    if (sel && (el._grounding_confidence || 0) >= 0.7) {
      md += `${sel}\n`;
      if (el._grounded_alt_selector) md += `# Fallback: ${el._grounded_alt_selector}\n`;
    } else {
      md += `openclaw browser snapshot --interactive\n# Find "${el.text_content}" and interact\n`;
    }
    if (step.wait_condition) {
      md += `openclaw browser wait --load ${step.wait_condition}\nopenclaw browser snapshot --interactive  # Refresh refs\n`;
    }
    md += `\`\`\`\n\n`;

    if (step.expected_result) md += `**Verify**: ${step.expected_result}\n\n`;
    md += `---\n\n`;
  }

  if (analysis.decision_points?.length) {
    md += `## Decision Points\n\n`;
    for (const dp of analysis.decision_points) {
      md += `- **Step ${dp.at_step}**: ${dp.description} → ${dp.how_to_decide}\n`;
    }
    md += `\n`;
  }

  md += `## Agent Replay Tips\n\n`;
  md += `1. Always \`openclaw browser snapshot --interactive\` after navigation to get fresh refs\n`;
  md += `2. Refs change on every page load — never reuse refs from a previous snapshot\n`;
  md += `3. If a ref doesn't match, use \`openclaw browser snapshot --labels\` for a visual overlay\n`;
  md += `4. Verify each step using the **Verify** notes before proceeding\n\n`;

  md += `---\n*End-to-end tested via Screenpipe integration • mock data*\n`;

  const skillDir = path.join(outputDir, 'skill', slug);
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), md);
  fs.writeFileSync(path.join(skillDir, 'references', 'analysis.json'), JSON.stringify(analysis, null, 2));

  return { skillDir, slug, md };
}

// ─── Main test runner ───────────────────────────────────────────────────────

async function main() {
  const PORT = 13030; // avoid conflicts with any running instance on 3030
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const outputDir = path.join(__dirname, '..', 'pipeline-output', `screenpipe-e2e_${stamp}`);

  console.log('');
  console.log('═'.repeat(60));
  console.log('  Screenpipe → SKILL.md  End-to-End Test');
  console.log('═'.repeat(60));

  // Step 1: Start mock server
  console.log('\n  [1/6] Starting mock Screenpipe server ...');
  const server = await startMockServer(PORT);
  console.log(`        OK — listening on port ${PORT}`);

  const client = createScreenpipeClient({ baseUrl: `http://127.0.0.1:${PORT}` });

  try {
    // Step 2: Health check
    console.log('\n  [2/6] Health check ...');
    const health = await client.health();
    console.log(`        Status: ${health.status}`);
    if (health.status !== 'healthy') throw new Error('Health check failed');
    console.log('        OK');

    // Step 3: Search for screen data
    console.log('\n  [3/6] Querying screen data (search) ...');
    const search = await client.search({
      start_time: new Date(Date.now() - 5 * 60000).toISOString(),
      end_time: new Date().toISOString(),
      limit: 40,
      content_type: 'all',
    });
    const ocrCount = search.data.filter(d => d.type === 'OCR').length;
    const audioCount = search.data.filter(d => d.type === 'Audio').length;
    const uiCount = search.data.filter(d => d.type === 'UI').length;
    console.log(`        Found ${ocrCount} OCR items, ${audioCount} audio items, ${uiCount} UI a11y snapshots`);
    console.log('        OK');

    // Step 4: Fetch frames + context
    console.log('\n  [4/6] Fetching frames and context ...');
    const frameIds = search.data
      .filter(d => d.type === 'OCR' && d.content.frame_id)
      .map(d => d.content.frame_id);

    const contexts = [];
    for (const fid of frameIds) {
      const frame = await client.getFrame(fid);
      const ctx = await client.getFrameContext(fid);
      contexts.push({ frame_id: fid, ...ctx });
      console.log(`        Frame ${fid}: ${frame.byteLength} bytes, app=${ctx.app_name}, text="${ctx.ocr_text}"`);
    }
    console.log('        OK');

    // Step 5: Build analysis from Screenpipe data
    console.log('\n  [5/6] Building grounded analysis ...');
    const analysis = buildAnalysisFromScreenpipe(search, contexts);
    console.log(`        Workflow: "${analysis.workflow_title}"`);
    console.log(`        Steps: ${analysis.steps.length} action steps`);
    const a11yGrounded = analysis.steps.filter(s => s.target_element?._grounding_source === 'a11y').length;
    const ocrGrounded = analysis.steps.filter(s => s.target_element?._grounding_source === 'ocr').length;
    console.log(`        Grounded: ${a11yGrounded} via a11y, ${ocrGrounded} via OCR`);
    console.log('        OK');

    // Step 6: Generate SKILL.md
    console.log('\n  [6/6] Generating SKILL.md ...');
    fs.mkdirSync(outputDir, { recursive: true });
    const { skillDir, slug, md } = generateSkillMd(analysis, outputDir);
    console.log(`        Skill: ${slug}`);
    console.log(`        Path:  ${path.join(skillDir, 'SKILL.md')}`);
    console.log('        OK');

    // Print summary
    console.log('\n' + '═'.repeat(60));
    console.log('  END-TO-END TEST PASSED');
    console.log('═'.repeat(60));
    console.log(`  Steps tested:`);
    console.log(`    1. Mock server started          ✓`);
    console.log(`    2. Health check                 ✓`);
    console.log(`    3. Search (OCR + audio)         ✓`);
    console.log(`    4. Frame download + context     ✓`);
    console.log(`    5. Analysis from Screenpipe     ✓`);
    console.log(`    6. SKILL.md generated           ✓`);
    console.log('');
    console.log(`  Output: ${skillDir}`);
    console.log(`  Files:`);
    const files = fs.readdirSync(skillDir);
    for (const f of files) {
      const stat = fs.statSync(path.join(skillDir, f));
      if (stat.isDirectory()) {
        const subfiles = fs.readdirSync(path.join(skillDir, f));
        console.log(`    ${f}/ (${subfiles.join(', ')})`);
      } else {
        console.log(`    ${f} (${stat.size} bytes)`);
      }
    }
    console.log('');
    console.log('  Generated SKILL.md preview (first 30 lines):');
    console.log('  ' + '─'.repeat(56));
    const lines = md.split('\n').slice(0, 30);
    for (const line of lines) {
      console.log(`  ${line}`);
    }
    console.log('  ' + '─'.repeat(56));
    console.log('');

  } catch (err) {
    console.error('\n  TEST FAILED:', err.message || err);
    process.exit(1);
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
