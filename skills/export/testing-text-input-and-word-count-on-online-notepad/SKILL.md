---
name: testing-text-input-and-word-count-on-online-notepad
description: "Testing Text Input and Word Count on Online Notepad in Google Chrome. Generated from live Screenpipe capture."
version: 1.0.0
read_when:
  - "Testing Text Input and Word Count on Online Notepad"
  - "Google Chrome workflow"
  - "Google Chrome training"
metadata: {"openclaw":{"emoji":"🎬"}}
allowed-tools: browser(*)
---

# Testing Text Input and Word Count on Online Notepad

- **Application**: Google Chrome
- **URL Pattern**: `onlinenotepad.org/notepad`
- **Login Required**: No

## Summary

The user transfers text from a local Notepad application to an online notepad tool, dismisses an interstitial ad, and then tests the online editor's word count and autosave features by clearing the page and manually typing 'test' on multiple lines.

## Setup

```
openclaw browser open "onlinenotepad.org/notepad"
openclaw browser wait --load networkidle
openclaw browser snapshot --interactive
```

## Steps

### 1. NAVIGATE: onlinenotepad.org/notepad

> *Navigate to the Online Notepad website.*

**Why**: To use the web-based text editor for note taking or testing.

**Execute**:
```
openclaw browser open "https://onlinenotepad.org/notepad"
openclaw browser wait --load networkidle
openclaw browser snapshot --interactive  # Refresh refs
```

**Verify**: The Online Notepad website loads, potentially showing a full-screen ad (vignette).

**Visual Reference**: `references/frames/step_1.jpg`

**If it fails**: Page fails to load or the ad blocks interaction.

---

### 2. CLICK: Close

> *Dismiss the full-screen advertisement to access the notepad interface.*

**Why**: The ad prevents interaction with the main web application.

**Execute**:
```
openclaw browser find role button --name "Close" click
# Fallback: openclaw browser snapshot --interactive
```

**Verify**: The ad disappears, revealing the notepad editor.

**Visual Reference**: `references/frames/step_2.jpg`

**If it fails**: Clicking the ad might open the advertiser's page instead of closing it.

---

### 3. KEYBOARD_SHORTCUT: Control+V

> *Paste the text copied from the local Notepad application.*

**Why**: To transfer draft content to the online tool for editing or storage.

**Execute**:
```
openclaw browser key "Control+V"
# Fallback: openclaw browser snapshot --interactive
```

**Verify**: Multiple lines containing the word 'test' appear in the editor, and the word count updates to 45.

**If it fails**: Clipboard is empty or paste fails due to browser permissions.

---

### 4. KEYBOARD_SHORTCUT: Control+A

> *Select all text in the editor.*

**Why**: Preparing to clear the editor to start a new test.

**Execute**:
```
openclaw browser key "Control+A"
# Fallback: openclaw browser snapshot --interactive
```

**Verify**: All text in the document is highlighted.

**If it fails**: Focus is not on the text editor.

---

### 5. KEYBOARD_SHORTCUT: Backspace

> *Delete the selected text.*

**Why**: To empty the notepad for fresh input.

**Execute**:
```
openclaw browser key "Backspace"
# Fallback: openclaw browser snapshot --interactive
```

**Verify**: The editor is empty and the word count resets to 0.

---

### 6. TYPE: Online Notepad

> *Type the word 'test' repeatedly on multiple lines.*

**Why**: To test the real-time word counter and autosave functionality.

**Execute**:
```
openclaw browser find role textbox --name "Online Notepad" fill "test"
# Fallback: openclaw browser snapshot --interactive
```

**Verify**: The words appear in the document and the word count updates incrementally from 12 to 19.

**Visual Reference**: `references/frames/step_6.jpg`

**If it fails**: Network issues might slow down the autosave feedback.

---

## Decision Points

- **Step 2**: Handling the Google Vignette ad → If a grayed-out screen with an ad appears immediately after navigation, look for a 'Close' or 'X' button to reveal the notepad.

## Agent Replay Tips

1. Always `openclaw browser snapshot --interactive` after navigation to get fresh refs
2. Refs change on every page load — never reuse refs from a previous snapshot
3. If a ref doesn't match, use `openclaw browser snapshot --labels` for a visual overlay
4. Verify each step using the **Verify** notes before proceeding

---
*Generated from live Screenpipe capture via Gemini analysis*
