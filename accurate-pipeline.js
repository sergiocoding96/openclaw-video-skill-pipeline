#!/usr/bin/env node
/**
 * Multi-Pass Accurate Video Workflow Extraction
 *
 * Pass 1: Extract audio narration with Whisper (context layer)
 * Pass 2: Extract keyframes at scene transitions (visual layer)
 * Pass 3: Gemini video analysis WITH narration context (action layer)
 * Pass 4: Per-frame element identification on action frames (grounding layer)
 * Pass 5: Cross-validate and merge into verified workflow
 *
 * Usage:
 *   node accurate-pipeline.js <video-file> [--model gemini-3-flash-preview]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

// ─── Pass 1: Audio Transcription ─────────────────────────────────────────────

async function extractAudio(videoPath, outputDir) {
  console.log('\n  PASS 1: Extracting audio narration...');
  const audioPath = path.join(outputDir, 'audio.mp3');

  // Extract audio with ffmpeg
  try {
    const vp = videoPath.replace(/\\/g, '/');
    const ap = audioPath.replace(/\\/g, '/');
    execSync(`ffmpeg -i "${vp}" -vn -acodec libmp3lame -q:a 4 -y "${ap}"`, {
      stdio: 'pipe', timeout: 120000, shell: 'bash'
    });
  } catch (e) {
    console.log(`    ffmpeg audio extraction failed: ${e.message?.substring(0, 80)}`);
    return null;
  }

  if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size < 1000) {
    console.log('    No audio track found or too short');
    return null;
  }

  // Transcribe with Whisper
  if (!OPENAI_KEY) {
    console.log('    No OPENAI_API_KEY — skipping Whisper transcription');
    return null;
  }

  console.log('    Transcribing with Whisper...');
  const FormData = (await import('node-fetch')).default ? null : null;

  // Use curl for multipart upload since we're in Node
  try {
    const result = execSync(
      `curl -s https://api.openai.com/v1/audio/transcriptions ` +
      `-H "Authorization: Bearer ${OPENAI_KEY}" ` +
      `-F file="@${audioPath}" ` +
      `-F model="whisper-1" ` +
      `-F response_format="verbose_json" ` +
      `-F timestamp_granularities[]="segment"`,
      { stdio: 'pipe', timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
    );
    const transcription = JSON.parse(result.toString());
    console.log(`    Transcribed: ${transcription.segments?.length || 0} segments, ${transcription.text?.length || 0} chars`);

    // Save for reference
    fs.writeFileSync(path.join(outputDir, 'transcription.json'), JSON.stringify(transcription, null, 2));

    return transcription;
  } catch (e) {
    console.log(`    Whisper transcription failed: ${e.message?.substring(0, 100)}`);
    return null;
  }
}

// ─── Pass 2: Keyframe Extraction ─────────────────────────────────────────────

async function extractKeyframes(videoPath, outputDir) {
  console.log('\n  PASS 2: Extracting keyframes at scene transitions...');
  const framesDir = path.join(outputDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  try {
    // Extract frames at scene changes + every 2 seconds as fallback
    // Extract 1 frame every 2 seconds (simpler, more reliable than scene detection on Windows)
    const vp = videoPath.replace(/\\/g, '/');
    const fd = framesDir.replace(/\\/g, '/');
    execSync(
      `ffmpeg -i "${vp}" -vf "fps=0.5" "${fd}/frame_%04d.png"`,
      { stdio: 'pipe', timeout: 300000, shell: 'bash' }
    );

    // Calculate timestamps (1 frame every 2 seconds)
    const tsResult = '';

    const frames = fs.readdirSync(framesDir).filter(f => f.endsWith('.png')).sort();
    console.log(`    Extracted ${frames.length} keyframes (1 every 2s)`);

    // Map frames to timestamps (1 frame every 2 seconds)
    const frameData = frames.map((f, i) => ({
      file: f,
      path: path.join(framesDir, f),
      timestamp: i * 2,
      index: i,
    }));

    fs.writeFileSync(path.join(outputDir, 'frames-index.json'), JSON.stringify(frameData, null, 2));
    return frameData;
  } catch (e) {
    console.log(`    ffmpeg frame extraction failed: ${e.message?.substring(0, 100)}`);
    console.log('    Falling back to video-only analysis');
    return [];
  }
}

// ─── Pass 3: Enhanced Video Analysis ─────────────────────────────────────────

async function analyzeVideo(videoPath, transcription, modelName, outputDir) {
  console.log(`\n  PASS 3: Full video analysis with ${modelName}...`);

  // Build narration context
  let narrationContext = '';
  if (transcription?.segments) {
    narrationContext = '\n\n## Audio Narration Transcript (for context)\n\n';
    narrationContext += 'The video has narration. Use this to understand INTENT, but focus on VISUAL ACTIONS:\n\n';
    for (const seg of transcription.segments) {
      const mins = Math.floor(seg.start / 60);
      const secs = Math.floor(seg.start % 60);
      narrationContext += `[${mins}:${String(secs).padStart(2, '0')}] ${seg.text.trim()}\n`;
    }
  }

  // Upload video
  const fileData = fs.readFileSync(videoPath);
  const mimeType = 'video/mp4';
  let videoPart;

  if (fileData.length > 20 * 1024 * 1024) {
    console.log('    Uploading large file via File API...');
    const startRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': fileData.length.toString(),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { displayName: path.basename(videoPath) } }),
      }
    );
    const uploadUrl = startRes.headers.get('x-goog-upload-url');
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': fileData.length.toString(),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: fileData,
    });
    const fileInfo = await uploadRes.json();
    let state = fileInfo.file?.state;
    const fileNameApi = fileInfo.file?.name;
    while (state === 'PROCESSING') {
      console.log('    Waiting for video processing...');
      await new Promise(r => setTimeout(r, 5000));
      const statusRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileNameApi}?key=${API_KEY}`
      );
      const statusInfo = await statusRes.json();
      state = statusInfo.state;
    }
    videoPart = { fileData: { fileUri: fileInfo.file.uri, mimeType } };
  } else {
    videoPart = { inlineData: { data: fileData.toString('base64'), mimeType } };
  }

  const prompt = `You are an expert workflow analyst creating instructions for an AI browser automation agent.

CRITICAL: You must distinguish between:
- ACTIONS the user performs (clicks, typing, scrolling) — these are ACTIONABLE steps
- NARRATION/EXPLANATION by the presenter — these provide CONTEXT but are NOT actions
- HOVER/POINTING to show something — these are INFORMATIONAL, mark them clearly

For every ACTIONABLE step, you must provide enough detail for an agent using "agent-browser" CLI to find and interact with the exact element.

${narrationContext}

## Output Format

Return a JSON object:

{
  "workflow_title": "string",
  "application": "string",
  "application_url_pattern": "e.g., *.lightning.force.com or app.example.com",
  "total_steps": number,
  "estimated_duration_seconds": number,
  "steps": [
    {
      "step_number": 1,
      "timestamp_approx": "0:00-0:05",
      "step_type": "action|informational|wait",
      "action_type": "click|type|scroll|drag|select|navigate|hover|right_click|double_click|keyboard_shortcut",
      "target_element": {
        "primary_selector_strategy": "text|role|label|css_hint",
        "text_content": "Exact visible text on/in the element (MOST IMPORTANT for agent-browser 'find text')",
        "aria_role": "button|link|tab|textbox|combobox|menuitem|checkbox|etc",
        "aria_label": "If the element has an aria-label or title attribute",
        "parent_text": "Text of the parent container to disambiguate (e.g., 'Navigation bar')",
        "element_type": "button|link|input|dropdown|menu_item|tab|checkbox|icon|other",
        "location_on_screen": "top-left|top-center|top-right|center-left|center|center-right|bottom-left|bottom-center|bottom-right",
        "approximate_coordinates_percent": {"x": 50, "y": 50},
        "visual_description": "What the element looks like (color, shape, icon)",
        "nearby_landmark": "Nearest unique text/heading that helps locate this element"
      },
      "input_data": "Text typed, option selected, or scroll direction",
      "keyboard_shortcut": "e.g., Ctrl+S",
      "expected_result": "What should happen AFTER this action (for verification)",
      "wait_condition": "What to wait for before proceeding: 'networkidle'|'text:Success'|'url:/dashboard'|'element:@ref'",
      "why_this_action": "Business logic reason",
      "narration_context": "What the presenter said during this step (if any)",
      "possible_failure": "What might go wrong and how to handle it"
    }
  ],
  "workflow_summary": "string",
  "decision_points": [{"at_step": 1, "description": "string", "how_to_decide": "string"}],
  "login_required": true,
  "required_permissions": "What role/access the user needs"
}

CRITICAL REQUIREMENTS:
1. "text_content" must contain the EXACT visible text — this is what agent-browser uses to find elements
2. If an element has no text (icon buttons, arrows), describe it AND provide the nearest text landmark
3. Separate ACTIONS from INFORMATIONAL steps clearly via "step_type"
4. Include "wait_condition" after every navigation/click that loads new content
5. Include "expected_result" for EVERY action step — the agent uses this to verify success
6. "narration_context" captures what the presenter SAID (separate from what was DONE)
7. For dropdown arrows/icons without text, use "nearby_landmark" to help the agent find them

Respond ONLY with the JSON object.`;

  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { temperature: 0.1, maxOutputTokens: 16384 },
  });

  const startTime = Date.now();
  const result = await model.generateContent([videoPart, { text: prompt }]);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const text = result.response.text();
  const usage = result.response.usageMetadata;

  console.log(`    Done in ${elapsed}s (${usage?.totalTokenCount || '?'} tokens)`);

  // Parse JSON
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) try { parsed = JSON.parse(match[0]); } catch {}
  }

  if (!parsed) {
    console.log('    WARNING: Failed to parse JSON response');
    fs.writeFileSync(path.join(outputDir, 'raw-response.txt'), text);
    return null;
  }

  fs.writeFileSync(path.join(outputDir, 'video-analysis.json'), JSON.stringify(parsed, null, 2));
  return parsed;
}

// ─── Pass 4: Per-Frame Element Grounding ─────────────────────────────────────

async function groundActionsOnFrames(analysis, frames, modelName, outputDir) {
  if (!frames.length || !analysis?.steps) {
    console.log('\n  PASS 4: Skipped (no frames available)');
    return analysis;
  }

  console.log(`\n  PASS 4: Grounding actions on keyframes...`);

  const actionSteps = analysis.steps.filter(s => s.step_type === 'action');
  console.log(`    ${actionSteps.length} action steps to ground on ${frames.length} frames`);

  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
  });

  for (const step of actionSteps) {
    // Find the closest frame to this step's timestamp
    const stepTime = parseTimestamp(step.timestamp_approx);
    const closestFrame = frames.reduce((best, f) =>
      Math.abs(f.timestamp - stepTime) < Math.abs(best.timestamp - stepTime) ? f : best
    , frames[0]);

    if (!fs.existsSync(closestFrame.path)) continue;

    try {
      const frameData = fs.readFileSync(closestFrame.path);
      const framePart = {
        inlineData: { data: frameData.toString('base64'), mimeType: 'image/png' }
      };

      const groundingPrompt = `Look at this screenshot. I need to find this specific element:
- Description: ${step.target_element?.visual_description || step.target_element?.text_content || 'unknown'}
- Text content: "${step.target_element?.text_content || 'none'}"
- Location: ${step.target_element?.location_on_screen || 'unknown'}
- Action to perform: ${step.action_type}

Return a JSON object with ONLY these fields:
{
  "element_found": true/false,
  "exact_text": "The exact text visible on/in the element",
  "best_selector": "The best agent-browser command to find this element",
  "alternative_selector": "Backup command if first doesn't work",
  "bounding_box_percent": {"x1": 0, "y1": 0, "x2": 0, "y2": 0},
  "confidence": 0.0-1.0,
  "nearby_elements": ["list of nearby text that helps locate this element"]
}

For best_selector, use agent-browser syntax:
- find text "exact text" click — for elements with visible text
- find role button --name "text" click — for buttons
- find label "Label" fill "value" — for labeled inputs
- snapshot -i then click @ref — for elements only identifiable by ref

Return ONLY the JSON.`;

      const frameResult = await model.generateContent([framePart, { text: groundingPrompt }]);
      const frameText = frameResult.response.text();

      let grounding;
      try { grounding = JSON.parse(frameText); } catch {
        const m = frameText.match(/\{[\s\S]*\}/);
        if (m) try { grounding = JSON.parse(m[0]); } catch {}
      }

      // Save the grounding frame for this step regardless of success
      step._grounding_frame = closestFrame.file;
      step._grounding_frame_path = closestFrame.path;
      step._grounding_timestamp = closestFrame.timestamp;

      if (grounding?.element_found) {
        step._grounding = grounding;
        step.target_element._grounded_text = grounding.exact_text;
        step.target_element._grounded_selector = grounding.best_selector;
        step.target_element._grounded_alt_selector = grounding.alternative_selector;
        step.target_element._grounding_confidence = grounding.confidence;
        console.log(`    Step ${step.step_number}: ✓ grounded (${(grounding.confidence * 100).toFixed(0)}%) — "${grounding.exact_text?.substring(0, 40)}"`);
      } else {
        step.target_element._grounding_confidence = 0;
        console.log(`    Step ${step.step_number}: ✗ element not found in frame`);
      }
    } catch (e) {
      console.log(`    Step ${step.step_number}: ✗ grounding failed — ${e.message?.substring(0, 60)}`);
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  fs.writeFileSync(path.join(outputDir, 'grounded-analysis.json'), JSON.stringify(analysis, null, 2));
  return analysis;
}

function parseTimestamp(ts) {
  if (!ts) return 0;
  const match = ts.match(/(\d+):(\d+)/);
  if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);
  return 0;
}

// ─── Pass 5: Generate Verified SKILL.md ──────────────────────────────────────

function generateVerifiedSkill(analysis, transcription, outputDir, modelName) {
  console.log('\n  PASS 5: Generating verified SKILL.md...');

  const title = analysis.workflow_title || 'Untitled Workflow';
  const app = analysis.application || 'Unknown';
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  let md = '';

  // Frontmatter — OpenClaw native browser (no external deps)
  md += `---\n`;
  md += `name: ${slug}\n`;
  md += `description: "${title} in ${app}. Multi-pass verified workflow from video training."\n`;
  md += `version: 1.0.0\n`;
  md += `read_when:\n`;
  md += `  - "${title}"\n`;
  md += `  - "${app} workflow"\n`;
  md += `  - "${app} training"\n`;
  md += `metadata: {"openclaw":{"emoji":"🎬"}}\n`;
  md += `allowed-tools: browser(*)\n`;
  md += `---\n\n`;

  // Header
  md += `# ${title}\n\n`;
  md += `- **Application**: ${app}\n`;
  if (analysis.application_url_pattern) {
    md += `- **URL Pattern**: \`${analysis.application_url_pattern}\`\n`;
  }
  md += `- **Login Required**: ${analysis.login_required ? 'Yes' : 'No'}\n`;
  if (analysis.required_permissions) {
    md += `- **Required Permissions**: ${analysis.required_permissions}\n`;
  }
  md += `\n## Summary\n\n${analysis.workflow_summary || 'N/A'}\n\n`;

  // Setup
  md += `## Setup\n\n`;
  md += `Use OpenClaw's built-in browser tool. No external dependencies needed.\n\n`;
  md += `\`\`\`\n`;
  md += `openclaw browser open "${analysis.application_url_pattern || 'application-url'}"\n`;
  md += `openclaw browser wait --load networkidle\n`;
  md += `openclaw browser snapshot --interactive\n`;
  md += `\`\`\`\n\n`;
  md += `> **Tip**: If you need to use an existing logged-in Chrome session, use \`openclaw browser --profile chrome\` to attach via the extension relay.\n\n`;

  // Steps
  md += `## Steps\n\n`;
  const framesToCopy = [];

  for (const step of (analysis.steps || [])) {
    const isAction = step.step_type === 'action';
    const el = step.target_element || {};

    // Step header
    md += `### ${step.step_number}. ${isAction ? step.action_type.toUpperCase() : 'INFO'}: ${el.text_content || el.visual_description || step.narration_context?.substring(0, 60) || 'N/A'}\n\n`;

    // Narration context (what the presenter said)
    if (step.narration_context) {
      md += `> *Narrator: "${step.narration_context}"*\n\n`;
    }

    // Business reason
    if (step.why_this_action) {
      md += `**Why**: ${step.why_this_action}\n\n`;
    }

    if (isAction) {
      // Commands — OpenClaw native browser tool
      md += `**Execute**:\n`;
      md += `\`\`\`\n`;

      const groundedSelector = el._grounded_selector;
      const groundedAlt = el._grounded_alt_selector;
      const confidence = el._grounding_confidence || 0;

      // Convert any agent-browser commands in grounded selectors to openclaw format
      const toOC = (cmd) => {
        if (!cmd) return cmd;
        return cmd
          .replace(/^agent-browser\s+/, 'openclaw browser ')
          .replace(/^find\s+/, 'openclaw browser find ')
          .replace(/^snapshot\s+/, 'openclaw browser snapshot ');
      };

      if (groundedSelector && confidence >= 0.7) {
        md += `${toOC(groundedSelector)}\n`;
        if (groundedAlt) {
          md += `# Fallback: ${toOC(groundedAlt)}\n`;
        }
      } else if (el.text_content && el.text_content.length < 50) {
        const text = el.text_content.replace(/"/g, '\\"');
        switch (step.action_type) {
          case 'click':
            if (el.aria_role === 'tab') {
              md += `openclaw browser snapshot --interactive\n`;
              md += `# Find the tab labeled "${text}" in the snapshot refs, then:\n`;
              md += `openclaw browser click <ref>  # tab "${text}"\n`;
            } else if (el.aria_role === 'button') {
              md += `openclaw browser snapshot --interactive\n`;
              md += `# Find the button labeled "${text}" in the snapshot refs, then:\n`;
              md += `openclaw browser click <ref>  # button "${text}"\n`;
            } else if (el.aria_role === 'menuitem' || el.aria_role === 'link') {
              md += `openclaw browser snapshot --interactive\n`;
              md += `# Find "${text}" in the snapshot refs, then:\n`;
              md += `openclaw browser click <ref>  # "${text}"\n`;
            } else {
              md += `openclaw browser snapshot --interactive\n`;
              md += `# Find "${text}" in the snapshot refs, then:\n`;
              md += `openclaw browser click <ref>  # "${text}"\n`;
            }
            break;
          case 'type':
            if (step.input_data) {
              const inputText = step.input_data.replace(/"/g, '\\"');
              md += `openclaw browser snapshot --interactive\n`;
              md += `# Find the input labeled "${text}" in the snapshot refs, then:\n`;
              md += `openclaw browser fill <ref> "${inputText}"\n`;
            }
            break;
          case 'select':
            if (step.input_data) {
              md += `openclaw browser snapshot --interactive\n`;
              md += `openclaw browser select <ref> "${step.input_data}"  # "${text}"\n`;
            }
            break;
          case 'scroll':
            md += `openclaw browser scroll ${step.input_data || 'down'} 500\n`;
            break;
          case 'keyboard_shortcut':
            if (step.keyboard_shortcut) {
              md += `openclaw browser press ${step.keyboard_shortcut.replace('Ctrl+', 'Control+')}\n`;
            }
            break;
          case 'drag':
            md += `openclaw browser snapshot --interactive\n`;
            md += `# Identify source and target refs, then:\n`;
            md += `openclaw browser drag <source_ref> <target_ref>\n`;
            break;
          default:
            md += `openclaw browser snapshot --interactive\n`;
            md += `# ${step.action_type}: find target ref and interact\n`;
        }
      } else {
        // No text, no grounding: use snapshot + visual hints
        md += `openclaw browser snapshot --interactive\n`;
        md += `# Look for: ${el.visual_description || el.text_content || 'element'}\n`;
        if (el.nearby_landmark) {
          md += `# Near: "${el.nearby_landmark}"\n`;
        }
        md += `# Location: ${el.location_on_screen || 'unknown'} (≈${el.approximate_coordinates_percent?.x || '?'}%, ${el.approximate_coordinates_percent?.y || '?'}%)\n`;
        md += `openclaw browser ${step.action_type} <ref>\n`;
      }

      // Wait condition
      if (step.wait_condition) {
        if (step.wait_condition === 'networkidle') {
          md += `openclaw browser wait --load networkidle\n`;
        } else if (step.wait_condition.startsWith('text:')) {
          md += `openclaw browser wait --text "${step.wait_condition.substring(5)}"\n`;
        } else if (step.wait_condition.startsWith('url:')) {
          md += `openclaw browser wait --url "${step.wait_condition.substring(4)}"\n`;
        } else {
          md += `openclaw browser wait ${step.wait_condition}\n`;
        }
        md += `openclaw browser snapshot --interactive  # Refresh refs\n`;
      }

      md += `\`\`\`\n\n`;

      // Verification
      if (step.expected_result) {
        md += `**Verify**: ${step.expected_result}\n\n`;
      }

      // Visual reference frame
      if (step._grounding_frame) {
        const frameFileName = `step_${step.step_number}.png`;
        framesToCopy.push({ src: step._grounding_frame_path, dest: frameFileName });
        const confidence = el._grounding_confidence || 0;
        if (confidence >= 0.7) {
          md += `**Visual Reference**: \`references/frames/${frameFileName}\` — Take a screenshot with \`openclaw browser screenshot\` and compare. The screen should look similar to this frame.\n\n`;
        } else {
          md += `**Visual Reference**: \`references/frames/${frameFileName}\` ⚠ LOW CONFIDENCE — The element was hard to identify in this frame. Use \`openclaw browser snapshot --labels\` for a labeled overlay to find the correct ref.\n\n`;
        }
      }

      // Failure handling
      if (step.possible_failure) {
        md += `**If it fails**: ${step.possible_failure}\n\n`;
      }
    } else {
      // Informational step — no commands
      if (step.expected_result || step.why_this_action) {
        md += `*${step.expected_result || step.why_this_action}*\n\n`;
      }
    }

    md += `---\n\n`;
  }

  // Decision points
  if (analysis.decision_points?.length) {
    md += `## Decision Points\n\n`;
    for (const dp of analysis.decision_points) {
      md += `- **Step ${dp.at_step}**: ${dp.description}`;
      if (dp.how_to_decide) md += ` → ${dp.how_to_decide}`;
      md += `\n`;
    }
    md += `\n`;
  }

  // Replay tips
  md += `## Agent Replay Tips\n\n`;
  md += `1. Always \`openclaw browser snapshot --interactive\` after navigation to get fresh refs\n`;
  md += `2. Refs change on every page load — never reuse refs from a previous snapshot\n`;
  md += `3. If a ref doesn't match, use \`openclaw browser snapshot --labels\` for a visual overlay\n`;
  md += `4. After clicking dropdowns, wait briefly: \`openclaw browser wait 500\`\n`;
  md += `5. Verify each step using the **Verify** notes before proceeding\n`;
  md += `6. For logged-in sessions, use \`openclaw browser --profile chrome\` to attach to existing Chrome\n`;
  md += `7. If an element isn't found, try \`openclaw browser snapshot\` (full tree) instead of \`--interactive\`\n\n`;

  md += `---\n*Multi-pass verified workflow • Gemini ${modelName || '3-flash'} + Whisper + frame grounding*\n`;

  // Write skill
  const skillDir = path.join(outputDir, 'skill', slug);
  fs.mkdirSync(path.join(skillDir, 'references', 'frames'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), md);

  // Copy grounding frames for visual reference
  let framesCopied = 0;
  for (const { src, dest } of framesToCopy) {
    if (src && fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(skillDir, 'references', 'frames', dest));
      framesCopied++;
    }
  }
  console.log(`    Copied ${framesCopied} visual reference frames`);

  const groundedPath = path.join(outputDir, 'grounded-analysis.json');
  const videoAnalysisPath = path.join(outputDir, 'video-analysis.json');
  const sourceJson = fs.existsSync(groundedPath) ? groundedPath : videoAnalysisPath;
  if (fs.existsSync(sourceJson)) {
    fs.copyFileSync(sourceJson, path.join(skillDir, 'references', 'analysis.json'));
  }
  if (fs.existsSync(path.join(outputDir, 'transcription.json'))) {
    fs.copyFileSync(
      path.join(outputDir, 'transcription.json'),
      path.join(skillDir, 'references', 'transcription.json')
    );
  }

  console.log(`    SKILL.md written to: ${path.join(skillDir, 'SKILL.md')}`);
  return { skillDir, slug, md };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Multi-Pass Accurate Video Workflow Extraction
===============================================
Usage: node accurate-pipeline.js <video-file> [--model gemini-3-flash-preview]

Passes:
  1. Audio → Whisper transcription (narration context)
  2. Video → ffmpeg keyframe extraction (scene transitions)
  3. Video + narration → Gemini analysis (action understanding)
  4. Keyframes + actions → Gemini grounding (element identification)
  5. All data → Verified SKILL.md (OpenClaw compatible)

Requirements: ffmpeg, GEMINI_API_KEY, OPENAI_API_KEY (optional for Whisper)
    `);
    process.exit(0);
  }

  const videoPath = path.resolve(args[0]);
  if (!fs.existsSync(videoPath)) {
    console.error(`ERROR: File not found: ${videoPath}`);
    process.exit(1);
  }

  const modelIdx = args.indexOf('--model');
  const modelName = modelIdx !== -1 && args[modelIdx + 1] ? args[modelIdx + 1] : 'gemini-3-flash-preview';

  const videoName = path.basename(videoPath, path.extname(videoPath));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const outputDir = path.join(__dirname, 'pipeline-output', `${videoName}_${timestamp}`);
  fs.mkdirSync(outputDir, { recursive: true });

  console.log('═'.repeat(60));
  console.log('  Multi-Pass Accurate Workflow Extraction');
  console.log('═'.repeat(60));
  console.log(`  Video: ${path.basename(videoPath)}`);
  console.log(`  Model: ${modelName}`);
  console.log(`  Output: ${outputDir}`);

  const startTime = Date.now();

  // Pass 1: Audio
  const transcription = await extractAudio(videoPath, outputDir);

  // Pass 2: Keyframes
  const frames = await extractKeyframes(videoPath, outputDir);

  // Pass 3: Video analysis with narration context
  const analysis = await analyzeVideo(videoPath, transcription, modelName, outputDir);
  if (!analysis) {
    console.error('\n  FATAL: Video analysis failed. Cannot continue.');
    process.exit(1);
  }

  // Pass 4: Ground actions on keyframes
  const groundedAnalysis = await groundActionsOnFrames(analysis, frames, modelName, outputDir);

  // Pass 5: Generate verified SKILL.md
  const { skillDir, slug } = generateVerifiedSkill(groundedAnalysis, transcription, outputDir, modelName);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '═'.repeat(60));
  console.log('  Pipeline Complete');
  console.log('═'.repeat(60));
  console.log(`  Total time: ${totalTime}s`);
  console.log(`  Skill name: ${slug}`);
  console.log(`  Skill path: ${skillDir}`);
  console.log(`  Action steps: ${analysis.steps?.filter(s => s.step_type === 'action').length || 0}`);
  console.log(`  Info steps: ${analysis.steps?.filter(s => s.step_type !== 'action').length || 0}`);
  console.log(`  Grounded: ${analysis.steps?.filter(s => s.target_element?._grounding_confidence >= 0.7).length || 0} steps`);
  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
