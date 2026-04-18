---
name: debugging-and-preparing-to-run-e2e-test-for-openclaw-video-skill-pipeline
description: "Debugging and Preparing to Run E2E Test for OpenClaw Video Skill Pipeline in Cursor. Generated from live Screenpipe capture."
version: 1.0.0
read_when:
  - "Debugging and Preparing to Run E2E Test for OpenClaw Video Skill Pipeline"
  - "Cursor workflow"
  - "Cursor training"
metadata: {"openclaw":{"emoji":"🎬"}}
allowed-tools: browser(*)
---

# Debugging and Preparing to Run E2E Test for OpenClaw Video Skill Pipeline

- **Application**: Cursor
- **Login Required**: Yes

## Summary

The user is debugging an end-to-end test setup for the OpenClaw Video Skill Pipeline within the Cursor IDE. An AI agent has provided diagnostic information for previous command failures related to Screenpipe and generated a comprehensive prompt for Claude to guide the execution of the full E2E pipeline.

## Setup

```
openclaw browser wait --load networkidle
openclaw browser snapshot --interactive
```

## Steps

### 1. INFO: Here’s what’s going on and how to fix it... write prompt for claude to do the test e2e

> *The user is reviewing the debugging information provided by an AI agent in the Cursor IDE. This includes an explanation for why previous `curl` commands, `SCREENPIPE_URL` environment variable setting, and `screenpipe` command failed on Windows. The AI also provides an 'Order of operations' for correctly setting up Screenpipe and a detailed 'Prompt for Claude' to execute the end-to-end pipeline.*

**Why**: To understand the root causes of the E2E test setup failures, learn the necessary steps to resolve them, and prepare for the next phase of running the E2E test with AI assistance.

*The user gains a clear understanding of the issues and the prescribed solutions, and is ready to proceed with the debugging steps or provide the prompt to Claude.*

---

## Decision Points

- **Step 1**: The user needs to decide whether to manually follow the 'Order of operations' for fixing the Screenpipe setup or to use the provided 'Prompt for Claude' to have the AI agent perform the E2E test. → Based on the user's comfort with manual terminal commands versus relying on AI agent automation, they will either execute the curl and npm commands themselves or input the prompt into the Claude chat interface.

## Agent Replay Tips

1. Always `openclaw browser snapshot --interactive` after navigation to get fresh refs
2. Refs change on every page load — never reuse refs from a previous snapshot
3. If a ref doesn't match, use `openclaw browser snapshot --labels` for a visual overlay
4. Verify each step using the **Verify** notes before proceeding

---
*Generated from live Screenpipe capture via Gemini analysis*
