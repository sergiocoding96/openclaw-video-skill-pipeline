# Potential Improvements

## 1. Visual Check Directives (wait for replay data)

**Status**: Not implemented — build only if replay feedback shows repeated failures on low-confidence steps.

**Problem**: Some steps have low grounding confidence (icon-only elements, no text). The SKILL.md tells the agent to compare screenshots, but there's no guarantee it does.

**Option A: Structured VISUAL_CHECK directive**
```markdown
<!-- VISUAL_CHECK: step_8.png, look for green tag icon top-right of image thumbnail -->
```
- OpenClaw's skill runner would parse this and force a screenshot comparison before proceeding
- Deterministic — not dependent on model behavior
- Con: Requires OpenClaw to implement a custom directive parser. If unsupported, it's just a comment

**Option B: Pre-load reference frames in context**
- When OpenClaw loads the skill, send low-confidence reference PNGs as images alongside instructions
- Kimi 2.5 "sees" the target UI before starting — like showing someone a photo before asking them to find something
- Con: 10 PNGs = ~20-50K extra input tokens per replay (~$0.01-0.03 at Kimi's $0.60/MTok). Bloats context for steps that might not need help

**Recommendation**: Don't implement preemptively. The accessibility tree (`openclaw browser snapshot --interactive`) gives every element a `@ref` — even icon-only buttons. Run replays first, use the feedback system to identify which steps actually fail, then add visual checks only for those.

## 2. Reinforcement from Replay Feedback (partially implemented)

**Status**: Feedback recording and app-pattern accumulation are implemented. Missing: automatic re-generation.

**Next step**: Add a `--regenerate` flag to the pipeline that re-runs Pass 5 (SKILL.md generation) using accumulated feedback without re-processing the video.

```bash
node accurate-pipeline.js --regenerate pipeline-output/training-mama-1_2026-03-08/
```

This would:
1. Load the existing `grounded-analysis.json`
2. Read `app-patterns/salesforce.json` for learned corrections
3. Re-generate SKILL.md with fixes applied
4. No API calls needed — just template re-rendering

## 3. OmniParser Integration (not needed yet)

**Status**: Not needed for Salesforce (excellent ARIA labeling).

**When to consider**: If the pipeline is used on apps with poor accessibility — native desktop apps, legacy web UIs without ARIA, or remote desktop/VNC scenarios where there's no DOM.

**What it would do**: Run Microsoft's OmniParser on low-confidence keyframes to get pixel-level element detection as a fallback when the accessibility tree is insufficient.

## 4. Multi-Video Skill Chains

**Status**: Not implemented.

**Idea**: Some workflows span multiple training videos (e.g., "create a property" then "upload images" then "publish listing"). The pipeline could detect when skills share the same application and auto-generate a parent skill that chains them.

## 5. Diff-Based Skill Updates

**Status**: Not implemented.

**Problem**: When the application UI changes (e.g., Salesforce update), existing skills break. Re-running the full pipeline on a new video is expensive.

**Idea**: Record a short video of just the changed section, run the pipeline on that clip only, and merge the updated steps into the existing SKILL.md — preserving all accumulated feedback and corrections for unchanged steps.
