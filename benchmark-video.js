#!/usr/bin/env node
/**
 * Video Workflow Understanding Benchmark
 *
 * Tests multiple Gemini models on their ability to extract
 * detailed workflow descriptions from screen recording videos.
 *
 * Usage:
 *   node benchmark-video.js <video-file> [--models model1,model2]
 *   node benchmark-video.js videos/demo.mp4
 *   node benchmark-video.js videos/demo.mp4 --models gemini-2.5-pro-preview-06-05,gemini-2.5-flash-preview-05-20
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── Configuration ───────────────────────────────────────────────────────────

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('ERROR: GEMINI_API_KEY not found in .env');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

// Models to benchmark (video-capable Gemini models)
const DEFAULT_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

const WORKFLOW_ANALYSIS_PROMPT = `You are an expert workflow analyst. Your job is to watch this screen recording of a business workflow and produce an extremely detailed, step-by-step description that another AI agent with browser automation capabilities could use to EXACTLY replicate this workflow.

For EVERY action in the video, provide:

## Output Format

Return a JSON object with this structure:

{
  "workflow_title": "Brief title of the workflow",
  "application": "What application/website is being used",
  "total_steps": <number>,
  "estimated_duration_seconds": <number>,
  "steps": [
    {
      "step_number": 1,
      "timestamp_approx": "0:00-0:05",
      "action_type": "click|type|scroll|drag|select|navigate|wait|hover|right_click|double_click|keyboard_shortcut",
      "target_element": {
        "description": "Detailed description of the UI element (e.g., 'Blue Submit button in the top-right corner')",
        "element_type": "button|link|input|dropdown|menu_item|tab|checkbox|icon|text|image|other",
        "location_on_screen": "top-left|top-center|top-right|center-left|center|center-right|bottom-left|bottom-center|bottom-right",
        "approximate_coordinates_percent": {"x": 50, "y": 50},
        "text_content": "Visible text on or near the element",
        "parent_context": "What section/panel/dialog the element is in"
      },
      "input_data": "If typing, what text was entered. If selecting, what option was chosen.",
      "keyboard_shortcut": "If a keyboard shortcut was used (e.g., Ctrl+C)",
      "what_happened": "Describe the visible result/response after this action",
      "why_this_action": "Explain the logical reason for this action in the workflow context",
      "preconditions": "What must be true on screen before this action (e.g., 'modal dialog is open', 'page has loaded')",
      "visual_feedback": "Any visual changes: loading spinners, highlights, animations, new elements appearing"
    }
  ],
  "workflow_summary": "High-level description of what this workflow accomplishes",
  "decision_points": [
    {
      "at_step": 5,
      "description": "What decision was made and what alternatives existed"
    }
  ],
  "potential_variations": "Where the workflow might differ based on data or conditions",
  "error_handling_observed": "Any error states or validation messages seen"
}

CRITICAL REQUIREMENTS:
1. Be EXTREMELY precise about click locations - another agent needs to find these exact elements
2. Include EVERY mouse movement and click, even small ones like closing popups or dismissing tooltips
3. Note any waits/loading states between actions
4. Describe the visual state of the screen before and after each action
5. If text is typed, capture it EXACTLY
6. Note any scrolling that occurs
7. Identify the application/website being used
8. Explain the BUSINESS LOGIC behind each action - WHY is the user doing this?

Respond ONLY with the JSON object, no markdown fencing.`;

// ─── Helper Functions ────────────────────────────────────────────────────────

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.m4v': 'video/mp4',
  };
  return mimeTypes[ext] || 'video/mp4';
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function parseJSON(text) {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch (e) {
    // Try to extract JSON from markdown fences
    const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (e2) {}
    }
    // Try to find JSON object in text
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch (e3) {}
    }
    return null;
  }
}

async function uploadVideoFile(filePath) {
  // For the @google/generative-ai SDK, we use inline data for smaller files
  // or the File API for larger ones. The SDK v0.24 uses inline data.
  const fileData = fs.readFileSync(filePath);
  const mimeType = getMimeType(filePath);
  const sizeBytes = fileData.length;

  console.log(`  Video: ${path.basename(filePath)} (${formatBytes(sizeBytes)}, ${mimeType})`);

  // Google AI SDK limit for inline data is ~20MB. For larger files we'd need
  // the File API, but let's handle that if needed.
  if (sizeBytes > 20 * 1024 * 1024) {
    console.log('  ⚠ File is large (>20MB). Using File API upload...');
    return await uploadLargeFile(filePath, mimeType);
  }

  return {
    inlineData: {
      data: fileData.toString('base64'),
      mimeType: mimeType,
    }
  };
}

async function uploadLargeFile(filePath, mimeType) {
  // Use the Google AI File API for large files via REST
  const fileData = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  // Start resumable upload
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
      body: JSON.stringify({ file: { displayName: fileName } }),
    }
  );

  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new Error('Failed to get upload URL from File API');
  }

  // Upload the file data
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
  const fileUri = fileInfo.file?.uri;
  if (!fileUri) {
    throw new Error('Failed to upload file: ' + JSON.stringify(fileInfo));
  }

  console.log(`  Uploaded to File API: ${fileUri}`);

  // Wait for file to be processed
  let state = fileInfo.file?.state;
  let fileNameApi = fileInfo.file?.name;
  while (state === 'PROCESSING') {
    console.log('  Waiting for video processing...');
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileNameApi}?key=${API_KEY}`
    );
    const statusInfo = await statusRes.json();
    state = statusInfo.state;
  }

  if (state === 'FAILED') {
    throw new Error('Video processing failed');
  }

  return {
    fileData: {
      fileUri: fileUri,
      mimeType: mimeType,
    }
  };
}

// ─── Benchmark Runner ────────────────────────────────────────────────────────

async function runModelBenchmark(modelName, videoPart, videoFileName) {
  console.log(`\n  ▸ Testing model: ${modelName}`);
  const startTime = Date.now();

  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.1,  // Low temp for precise descriptions
        maxOutputTokens: 16384,
      },
    });

    const result = await model.generateContent([
      videoPart,
      { text: WORKFLOW_ANALYSIS_PROMPT },
    ]);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const response = result.response;
    const text = response.text();
    const usage = response.usageMetadata;

    console.log(`    Done in ${elapsed}s`);
    if (usage) {
      console.log(`    Tokens — input: ${usage.promptTokenCount}, output: ${usage.candidatesTokenCount}, total: ${usage.totalTokenCount}`);
    }

    const parsed = parseJSON(text);

    return {
      model: modelName,
      success: true,
      elapsed_seconds: parseFloat(elapsed),
      tokens: usage ? {
        input: usage.promptTokenCount,
        output: usage.candidatesTokenCount,
        total: usage.totalTokenCount,
      } : null,
      raw_response: text,
      parsed: parsed,
      parse_success: parsed !== null,
      step_count: parsed?.steps?.length || 0,
      has_coordinates: parsed?.steps?.some(s => s.target_element?.approximate_coordinates_percent) || false,
      has_reasoning: parsed?.steps?.some(s => s.why_this_action) || false,
      has_preconditions: parsed?.steps?.some(s => s.preconditions) || false,
      decision_points: parsed?.decision_points?.length || 0,
    };
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`    ERROR after ${elapsed}s: ${error.message}`);
    return {
      model: modelName,
      success: false,
      elapsed_seconds: parseFloat(elapsed),
      error: error.message,
    };
  }
}

function printComparisonTable(results) {
  console.log('\n' + '═'.repeat(90));
  console.log('  BENCHMARK RESULTS COMPARISON');
  console.log('═'.repeat(90));

  const header = [
    'Model'.padEnd(38),
    'Time'.padStart(7),
    'Steps'.padStart(6),
    'Coords'.padStart(7),
    'Reason'.padStart(7),
    'PreCond'.padStart(8),
    'Decisions'.padStart(10),
  ].join(' │ ');

  console.log(header);
  console.log('─'.repeat(90));

  for (const r of results) {
    if (!r.success) {
      console.log(`${r.model.padEnd(38)} │ FAILED: ${r.error?.substring(0, 50)}`);
      continue;
    }
    const row = [
      r.model.padEnd(38),
      `${r.elapsed_seconds}s`.padStart(7),
      String(r.step_count).padStart(6),
      (r.has_coordinates ? 'YES' : 'NO').padStart(7),
      (r.has_reasoning ? 'YES' : 'NO').padStart(7),
      (r.has_preconditions ? 'YES' : 'NO').padStart(8),
      String(r.decision_points).padStart(10),
    ].join(' │ ');
    console.log(row);
  }

  console.log('═'.repeat(90));

  // Detailed step comparison
  const successResults = results.filter(r => r.success && r.parsed);
  if (successResults.length > 1) {
    console.log('\n  STEP COUNT DETAIL:');
    for (const r of successResults) {
      const steps = r.parsed.steps || [];
      const withCoords = steps.filter(s => s.target_element?.approximate_coordinates_percent).length;
      const withReason = steps.filter(s => s.why_this_action && s.why_this_action.length > 10).length;
      const actionTypes = [...new Set(steps.map(s => s.action_type))];
      console.log(`  ${r.model}:`);
      console.log(`    Steps: ${steps.length} | With coordinates: ${withCoords} | With reasoning: ${withReason}`);
      console.log(`    Action types used: ${actionTypes.join(', ')}`);
      console.log(`    Workflow: ${r.parsed.workflow_title || 'N/A'}`);
      console.log(`    App: ${r.parsed.application || 'N/A'}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Video Workflow Understanding Benchmark
=======================================
Usage:
  node benchmark-video.js <video-file> [--models model1,model2,model3]

Examples:
  node benchmark-video.js videos/workflow-demo.mp4
  node benchmark-video.js videos/demo.mp4 --models gemini-2.5-pro-preview-06-05,gemini-2.0-flash

Default models: ${DEFAULT_MODELS.join(', ')}
    `);
    process.exit(0);
  }

  // Parse arguments
  const videoPath = args[0];
  let models = DEFAULT_MODELS;

  const modelsIdx = args.indexOf('--models');
  if (modelsIdx !== -1 && args[modelsIdx + 1]) {
    models = args[modelsIdx + 1].split(',').map(m => m.trim());
  }

  // Resolve video path
  const resolvedPath = path.resolve(videoPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`ERROR: Video file not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log('═'.repeat(60));
  console.log('  Video Workflow Understanding Benchmark');
  console.log('═'.repeat(60));
  console.log(`  Models to test: ${models.length}`);
  models.forEach(m => console.log(`    - ${m}`));

  // Upload/prepare video
  console.log('\n  Preparing video...');
  const videoPart = await uploadVideoFile(resolvedPath);

  // Run benchmarks sequentially (to avoid rate limits)
  const results = [];
  for (const modelName of models) {
    const result = await runModelBenchmark(modelName, videoPart, path.basename(videoPath));
    results.push(result);
  }

  // Print comparison
  printComparisonTable(results);

  // Save full results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const videoName = path.basename(videoPath, path.extname(videoPath));
  const outputPath = path.join(__dirname, 'results', `${videoName}_${timestamp}.json`);

  const output = {
    benchmark_date: new Date().toISOString(),
    video_file: path.basename(videoPath),
    video_size_bytes: fs.statSync(resolvedPath).size,
    models_tested: models,
    prompt: WORKFLOW_ANALYSIS_PROMPT,
    results: results,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n  Full results saved to: ${outputPath}`);

  // Also save individual model outputs for easy reading
  for (const r of results) {
    if (r.success && r.parsed) {
      const modelFile = path.join(
        __dirname, 'results',
        `${videoName}_${r.model.replace(/[/:]/g, '-')}_${timestamp}.json`
      );
      fs.writeFileSync(modelFile, JSON.stringify(r.parsed, null, 2));
      console.log(`  ${r.model} output: ${path.basename(modelFile)}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
