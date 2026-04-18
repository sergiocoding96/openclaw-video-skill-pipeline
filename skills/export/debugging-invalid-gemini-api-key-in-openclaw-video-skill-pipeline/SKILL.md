---
name: debugging-invalid-gemini-api-key-in-openclaw-video-skill-pipeline
description: "Debugging Invalid Gemini API Key in openclaw-video-skill-pipeline in Cursor.exe. Generated from live Screenpipe capture."
version: 1.0.0
read_when:
  - "Debugging Invalid Gemini API Key in openclaw-video-skill-pipeline"
  - "Cursor.exe workflow"
  - "Cursor.exe training"
metadata: {"openclaw":{"emoji":"🎬"}}
allowed-tools: browser(*)
---

# Debugging Invalid Gemini API Key in openclaw-video-skill-pipeline

- **Application**: Cursor.exe
- **Login Required**: No

## Summary

The user encountered an 'INVALID GEMINI API KEY' error when running a pipeline in their Cursor.exe development environment. To investigate, they switched to Google Chrome, navigated to Google AI Studio's API Keys page to inspect their Gemini API key, and then returned to their development environment.

## Setup

```
openclaw browser wait --load networkidle
openclaw browser snapshot --interactive
```

## Steps

### 1. INFO: Gemini gemini-2.5-flash API key not valid

> *The user observes an error message in the terminal, stating that the Gemini API key is not valid, and suggesting to verify it on Google AI Studio.*

**Why**: To understand the cause of the pipeline failure and follow the suggested debugging step.

*Identification of the API key issue and the recommended action.*

---

### 2. KEYBOARD_SHORTCUT: Task Switching

> *The user switches from the Cursor.exe application to Google Chrome, likely using a keyboard shortcut like Alt+Tab.*

**Why**: To access Google AI Studio as instructed by the terminal error message for API key verification.

**Execute**:
```
openclaw browser snapshot --interactive
# Find "Task Switching" and interact
```

**Verify**: Google Chrome browser window becomes active, displaying the Google AI Studio API Keys page.

**If it fails**: Browser not open or Google AI Studio tab not found.

---

### 3. NAVIGATE: aistudio.google.com/u/2/api-keys

> *The user navigates to the Google AI Studio API Keys page to review their credentials.*

**Why**: To verify the Gemini API key and its configuration (e.g., permissions, restrictions) as recommended by the error message in the terminal.

**Execute**:
```
openclaw browser find role textbox --name "aistudio.google.com/u/2/api-keys" fill ""
# Fallback: openclaw browser snapshot --interactive
openclaw browser wait --load networkidle
openclaw browser snapshot --interactive  # Refresh refs
```

**Verify**: The Google AI Studio API Keys page is displayed, showing a list of API keys.

**Visual Reference**: `references/frames/step_3.jpg`

**If it fails**: Incorrect URL, network issues, or login required for Google AI Studio.

---

### 4. INFO: Gemini API Key

> *The user visually inspects the 'Gemini API Key' on the Google AI Studio page to ensure it is present and matches expectations.*

**Why**: To confirm the validity, existence, and correct project association of the Gemini API key, and to check for any IP/referrer restrictions that might be causing the error.

*The user confirms the API key details or identifies a misconfiguration.*

---

### 5. KEYBOARD_SHORTCUT: Task Switching

> *The user switches back to the Cursor.exe development environment.*

**Why**: To resume debugging or apply any necessary changes to the .env file based on the API key verification.

**Execute**:
```
openclaw browser snapshot --interactive
# Find "Task Switching" and interact
```

**Verify**: Cursor.exe application becomes active, showing the open .env file and terminal.

---

## Agent Replay Tips

1. Always `openclaw browser snapshot --interactive` after navigation to get fresh refs
2. Refs change on every page load — never reuse refs from a previous snapshot
3. If a ref doesn't match, use `openclaw browser snapshot --labels` for a visual overlay
4. Verify each step using the **Verify** notes before proceeding

---
*Generated from live Screenpipe capture via Gemini analysis*
