# OpenClaw Video Skill Pipeline

Convert screen recording videos of business workflows into structured, replayable AI agent skills ([OpenClaw](https://github.com/openclaw/openclaw) SKILL.md format).

## How It Works

**Video** → Whisper transcription → Keyframe extraction → Gemini video analysis → Frame grounding → Verified SKILL.md

### 5-Pass Pipeline

| Pass | Tool | Purpose |
|------|------|---------|
| 1 | ffmpeg + OpenAI Whisper | Extract audio and transcribe with timestamps |
| 2 | ffmpeg | Extract keyframes (1 frame / 2 seconds) |
| 3 | Gemini 3-flash-preview | Analyze full video + narration for workflow steps |
| 4 | Gemini 3-flash-preview | Ground each action on its closest keyframe (element location verification) |
| 5 | Template engine | Generate verified SKILL.md with visual references |

### Output

The pipeline generates an OpenClaw-native SKILL.md with:
- YAML frontmatter (`allowed-tools: browser(*)`, `read_when` triggers)
- `openclaw browser` commands (snapshot, click, fill, wait)
- Narration context quoted from the original video
- Visual reference frames with confidence scores
- Fallback selectors for robust replay
- Decision points and agent replay tips

## Quick Start

```bash
# Clone
git clone https://github.com/sergiocoding96/openclaw-video-skill-pipeline.git
cd openclaw-video-skill-pipeline

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your GEMINI_API_KEY and OPENAI_API_KEY

# Run the pipeline on a video
node accurate-pipeline.js "path/to/screen-recording.mp4"

# Or benchmark multiple Gemini models
node benchmark-video.js "path/to/video.mp4"
```

## Requirements

- **Node.js** >= 18
- **ffmpeg** installed and on PATH
- **GEMINI_API_KEY** — Google AI API key (for video analysis)
- **OPENAI_API_KEY** — OpenAI API key (for Whisper transcription)

## Scripts

| Script | Description |
|--------|-------------|
| `accurate-pipeline.js` | Full 5-pass production pipeline (default model: `gemini-3-flash-preview`) |
| `benchmark-video.js` | Benchmark multiple Gemini models on a video |
| `generate-skill.js` | Simple JSON → SKILL.md converter (legacy, uses agent-browser syntax) |
| `calc-costs.js` | Calculate per-model API costs from benchmark results |
| `record-feedback.js` | Record replay outcomes and selector corrections |

## Feedback Loop

After a skill replays (successfully or not), record the outcome to improve future generations:

```bash
# Record a step failure with a corrected selector
node record-feedback.js ./skill/my-workflow \
  --step 3 --status fail \
  --fix 'openclaw browser find role button --name "Save"' \
  --note "text selector matched the tab header instead of the button"

# Record a successful step
node record-feedback.js ./skill/my-workflow --step 4 --status success

# Record overall replay outcome
node record-feedback.js ./skill/my-workflow --replay success

# View accumulated feedback
node record-feedback.js ./skill/my-workflow --show
```

Feedback accumulates per application in `app-patterns/`. When generating a new skill for the same app (e.g., another Salesforce workflow), the pipeline automatically:
1. Loads learned patterns from previous replays
2. Applies selector corrections (e.g., "always use `find role button` instead of `find text` for Salesforce dropdowns")
3. Adds a "Known Issues" section to the SKILL.md

This is **Option A** (prompt refinement) — no model training needed. The system gets smarter with each replay.

## Model Benchmark Results

Tested on Salesforce training videos (58MB-120MB):

| Model | Steps Found | Grounding | Selectors | Cost |
|-------|------------|-----------|-----------|------|
| **gemini-3-flash-preview** | 6 (correct) | 100% | Role-based | Cheapest |
| gemini-3-pro-preview | 6 | 100% | Role-based | Mid |
| gemini-3.1-pro-preview | 7 | 95% | Mixed | High |
| gemini-2.5-flash | 21 (noisy) | 60% | Text-based | Mid |
| gemini-2.0-flash | 14 (noisy) | 70% | Text-based | Low |

Key finding: **3.x models correctly filter narration/hover noise from actual actions**, producing cleaner workflows.

## Environment Variables

```
GEMINI_API_KEY=your-google-ai-key
OPENAI_API_KEY=your-openai-key
```

## Example Output

See the `examples/` directory for sample SKILL.md files generated from Salesforce training videos at different pipeline iterations.

## License

MIT
