#!/usr/bin/env node
/**
 * Generate OpenClaw SKILL.md from Gemini Video Workflow Analysis
 *
 * Takes the JSON output from benchmark-video.js and converts it into
 * an OpenClaw-compatible SKILL.md file that uses agent-browser for replay.
 *
 * Usage:
 *   node generate-skill.js <analysis-json> [--output skill-folder-name]
 *   node generate-skill.js results/Training_mama_2_gemini-2.5-flash_2026-03-08.json
 */

const fs = require('fs');
const path = require('path');

// ─── Action Mapping: Gemini actions → agent-browser commands ─────────────────

function mapActionToCommands(step) {
  const commands = [];
  const el = step.target_element || {};
  const text = el.text_content || el.description || '';
  const sanitized = text.replace(/"/g, '\\"').replace(/\n/g, ' ').trim();

  switch (step.action_type) {
    case 'click':
      if (sanitized) {
        commands.push(`agent-browser find text "${sanitized}" click`);
      } else {
        commands.push(`# Click element at ${el.location_on_screen || 'unknown location'}`);
        commands.push(`agent-browser snapshot -i`);
        commands.push(`# Identify the target ref from snapshot, then:`);
        commands.push(`# agent-browser click @<ref>`);
      }
      break;

    case 'double_click':
      if (sanitized) {
        commands.push(`agent-browser find text "${sanitized}" dblclick`);
      }
      break;

    case 'type':
      if (step.input_data) {
        const inputText = step.input_data.replace(/"/g, '\\"');
        if (sanitized) {
          commands.push(`agent-browser find label "${sanitized}" fill "${inputText}"`);
        } else {
          commands.push(`# Type into field`);
          commands.push(`agent-browser snapshot -i`);
          commands.push(`# agent-browser fill @<ref> "${inputText}"`);
        }
      }
      break;

    case 'select':
      if (step.input_data && sanitized) {
        commands.push(`agent-browser find label "${sanitized}" select "${step.input_data}"`);
      }
      break;

    case 'scroll':
      if (step.input_data === 'up') {
        commands.push(`agent-browser scroll up 500`);
      } else {
        commands.push(`agent-browser scroll down 500`);
      }
      break;

    case 'hover':
      if (sanitized) {
        commands.push(`# Hover: ${sanitized}`);
        commands.push(`# (Informational — the trainer is pointing out this element)`);
      }
      break;

    case 'navigate':
      if (step.input_data && step.input_data.startsWith('http')) {
        commands.push(`agent-browser open "${step.input_data}"`);
      } else {
        commands.push(`# Navigate: ${step.what_happened || sanitized}`);
      }
      break;

    case 'drag':
      commands.push(`# Drag operation: ${step.what_happened || 'drag element'}`);
      commands.push(`agent-browser snapshot -i`);
      commands.push(`# agent-browser drag @<source_ref> @<target_ref>`);
      break;

    case 'keyboard_shortcut':
      if (step.keyboard_shortcut) {
        const key = step.keyboard_shortcut
          .replace('Ctrl+', 'Control+')
          .replace('Cmd+', 'Meta+');
        commands.push(`agent-browser press ${key}`);
      }
      break;

    case 'wait':
      commands.push(`# Wait/observe: ${(step.what_happened || '').substring(0, 100)}`);
      break;

    case 'right_click':
      if (sanitized) {
        commands.push(`# Right-click on "${sanitized}"`);
        commands.push(`agent-browser snapshot -i`);
        commands.push(`# agent-browser eval "document.querySelector('...').dispatchEvent(new MouseEvent('contextmenu'))"`);
      }
      break;

    default:
      commands.push(`# ${step.action_type}: ${step.what_happened || sanitized}`);
  }

  return commands;
}

// ─── SKILL.md Generator ─────────────────────────────────────────────────────

function generateSkillMd(analysis, videoFileName) {
  const title = analysis.workflow_title || 'Untitled Workflow';
  const app = analysis.application || 'Unknown Application';
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  let md = '';

  // YAML frontmatter
  md += `---\n`;
  md += `name: ${slug}\n`;
  md += `description: "${title} in ${app}. Auto-generated from video training recording."\n`;
  md += `version: 1.0.0\n`;
  md += `read_when:\n`;
  md += `  - "${title}"\n`;
  md += `  - "${app} workflow"\n`;
  md += `  - "${app} training"\n`;
  md += `metadata: {"openclaw":{"emoji":"🎬","requires":{"bins":["agent-browser"]}}}\n`;
  md += `allowed-tools: Bash(agent-browser:*)\n`;
  md += `---\n\n`;

  // Header
  md += `# ${title}\n\n`;
  md += `> Auto-generated from video: \`${videoFileName}\`\n\n`;
  md += `## Overview\n\n`;
  md += `${analysis.workflow_summary || 'No summary available.'}\n\n`;
  md += `- **Application**: ${app}\n`;
  md += `- **Total Steps**: ${analysis.total_steps || analysis.steps?.length || 0}\n`;
  md += `- **Estimated Duration**: ${analysis.estimated_duration_seconds || '?'}s\n\n`;

  // Prerequisites
  md += `## Prerequisites\n\n`;
  md += `- User must be logged into ${app}\n`;
  if (analysis.steps?.[0]?.preconditions) {
    md += `- ${analysis.steps[0].preconditions}\n`;
  }
  md += `- \`agent-browser\` must be installed: \`npm install -g agent-browser && agent-browser install\`\n\n`;

  // Step-by-step workflow
  md += `## Workflow Steps\n\n`;

  for (const step of (analysis.steps || [])) {
    const isActionable = !['wait', 'hover'].includes(step.action_type);

    md += `### Step ${step.step_number}: ${step.action_type.toUpperCase()}${step.target_element?.text_content ? ' — ' + step.target_element.text_content : ''}\n\n`;

    // Context
    if (step.timestamp_approx) {
      md += `**Timestamp**: ${step.timestamp_approx}\n\n`;
    }

    // What & Why
    if (step.why_this_action) {
      md += `**Why**: ${step.why_this_action}\n\n`;
    }
    if (step.what_happened) {
      md += `**Result**: ${step.what_happened}\n\n`;
    }

    // Target element details
    const el = step.target_element;
    if (el) {
      md += `**Target**: ${el.description || 'N/A'}\n`;
      if (el.parent_context) md += `- Parent: ${el.parent_context}\n`;
      if (el.location_on_screen) md += `- Location: ${el.location_on_screen}\n`;
      if (el.approximate_coordinates_percent) {
        md += `- Approx coords: x=${el.approximate_coordinates_percent.x}%, y=${el.approximate_coordinates_percent.y}%\n`;
      }
      md += `\n`;
    }

    // Preconditions
    if (step.preconditions) {
      md += `**Precondition**: ${step.preconditions}\n\n`;
    }

    // Visual feedback (verification)
    if (step.visual_feedback) {
      md += `**Verify**: ${step.visual_feedback}\n\n`;
    }

    // Agent-browser commands
    if (isActionable) {
      const cmds = mapActionToCommands(step);
      if (cmds.length > 0) {
        md += `**Commands**:\n\`\`\`bash\n`;
        cmds.forEach(c => md += `${c}\n`);

        // Add wait/verify after navigation actions
        if (step.visual_feedback && step.visual_feedback.toLowerCase().includes('load')) {
          md += `agent-browser wait --load networkidle\n`;
        }
        if (step.action_type === 'click' && step.what_happened?.toLowerCase().includes('navigat')) {
          md += `agent-browser wait --load networkidle\n`;
          md += `agent-browser snapshot -i  # Re-snapshot after navigation\n`;
        }

        md += `\`\`\`\n\n`;
      }
    } else {
      md += `> *This is an observational step from the training video — no action needed during replay.*\n\n`;
    }

    md += `---\n\n`;
  }

  // Decision points
  if (analysis.decision_points?.length > 0) {
    md += `## Decision Points\n\n`;
    md += `These are moments where the workflow may branch depending on context:\n\n`;
    for (const dp of analysis.decision_points) {
      md += `- **At Step ${dp.at_step}**: ${dp.description}\n`;
    }
    md += `\n`;
  }

  // Variations
  if (analysis.potential_variations) {
    md += `## Potential Variations\n\n`;
    md += `${analysis.potential_variations}\n\n`;
  }

  // Error handling
  if (analysis.error_handling_observed && analysis.error_handling_observed !== 'None observed.' && analysis.error_handling_observed !== 'No error states or validation messages were observed during this workflow overview.') {
    md += `## Error Handling\n\n`;
    md += `${analysis.error_handling_observed}\n\n`;
  }

  // Replay instructions
  md += `## How to Replay This Workflow\n\n`;
  md += `1. Ensure you are logged into ${app}\n`;
  md += `2. Start agent-browser:\n`;
  md += `   \`\`\`bash\n`;
  md += `   agent-browser open "<${app.toLowerCase().includes('salesforce') ? 'your-salesforce-instance-url' : 'application-url'}>"\n`;
  md += `   \`\`\`\n`;
  md += `3. Follow the steps above sequentially\n`;
  md += `4. After each navigation action, always re-snapshot to get fresh element refs:\n`;
  md += `   \`\`\`bash\n`;
  md += `   agent-browser snapshot -i\n`;
  md += `   \`\`\`\n`;
  md += `5. Use the **Verify** notes after each step to confirm the action succeeded\n\n`;

  md += `---\n`;
  md += `*Generated by video-benchmark workflow analyzer*\n`;

  return { md, slug };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Generate OpenClaw SKILL.md from Gemini Video Analysis
======================================================
Usage:
  node generate-skill.js <analysis-json> [--output folder-name]

Examples:
  node generate-skill.js results/Training_mama_2_gemini-2.5-flash_2026-03-08.json
  node generate-skill.js results/analysis.json --output salesforce-home-nav
    `);
    process.exit(0);
  }

  const inputFile = args[0];
  const resolvedInput = path.resolve(inputFile);

  if (!fs.existsSync(resolvedInput)) {
    console.error(`ERROR: File not found: ${resolvedInput}`);
    process.exit(1);
  }

  const analysis = JSON.parse(fs.readFileSync(resolvedInput, 'utf-8'));
  const videoFileName = path.basename(inputFile).split('_')[0] + '.mp4';

  // Handle both formats: direct analysis JSON or benchmark result with .parsed
  const workflowData = analysis.steps ? analysis : (analysis.parsed || analysis);

  if (!workflowData.steps) {
    console.error('ERROR: No steps found in JSON. Expected a workflow analysis with "steps" array.');
    process.exit(1);
  }

  const { md, slug } = generateSkillMd(workflowData, videoFileName);

  // Determine output
  let outputIdx = args.indexOf('--output');
  let folderName = outputIdx !== -1 && args[outputIdx + 1] ? args[outputIdx + 1] : slug;

  const skillDir = path.join(__dirname, 'skills', folderName);
  fs.mkdirSync(skillDir, { recursive: true });

  const skillPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(skillPath, md);

  // Also copy the source JSON as reference
  const refDir = path.join(skillDir, 'references');
  fs.mkdirSync(refDir, { recursive: true });
  fs.copyFileSync(resolvedInput, path.join(refDir, 'source-analysis.json'));

  console.log(`\n  OpenClaw Skill generated successfully!`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Skill folder: ${skillDir}`);
  console.log(`  SKILL.md:     ${skillPath}`);
  console.log(`  Reference:    ${path.join(refDir, 'source-analysis.json')}`);
  console.log(`\n  To use with OpenClaw:`);
  console.log(`    1. Copy the skill folder to your OpenClaw skills directory`);
  console.log(`    2. Or install agent-browser: npm install -g agent-browser`);
  console.log(`    3. The skill will be available as /${folderName}\n`);
}

main();
