---
name: salesforce-home-page-overview
description: "Salesforce Home Page Overview in Salesforce. Multi-pass verified workflow from video training."
version: 1.0.0
read_when:
  - "Salesforce Home Page Overview"
  - "Salesforce workflow"
  - "Salesforce training"
metadata: {"openclaw":{"emoji":"🎬","requires":{"bins":["agent-browser"]}}}
allowed-tools: Bash(agent-browser:*)
---

# Salesforce Home Page Overview

- **Application**: Salesforce
- **URL Pattern**: `*.lightning.force.com`
- **Login Required**: Yes
- **Required Permissions**: Access to Salesforce with a user role (DA, Manager, or Agent) that allows viewing accounts, properties, and dashboards.

## Summary

This workflow provides an overview of the Salesforce Home Page, demonstrating navigation to key sections like Accounts and Properties, and highlighting various quick links and dashboards available to users based on their roles.

## Setup

```bash
# Install agent-browser if not already installed
npm install -g agent-browser && agent-browser install

# Start by navigating to the application
agent-browser open "<*.lightning.force.com>"
agent-browser wait --load networkidle
agent-browser snapshot -i
```

## Steps

### 1. INFO: Lucas Fox

> *Narrator: "However, everyone has a menu on the left with six areas and at the top, another menu with the main sections."*

---

### 2. CLICK: Accounts

> *Narrator: "These include accounts, where we have our clients."*

**Why**: To view client accounts.

**Execute**:
```bash
find text "Accounts" click
# Fallback: find role link --name "Accounts" click
agent-browser wait --load networkidle
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The page navigates to the 'Accounts' list view.

---

### 3. CLICK: A downward-pointing arrow icon next to '2. My Sellers' text.

> *Narrator: "If we open this up, here we have several lists containing your buyers, your sellers, your tenants, etc."*

**Why**: To explore different client lists.

**Execute**:
```bash
agent-browser snapshot -i
# Look for: A downward-pointing arrow icon next to '2. My Sellers' text.
# Near: "2. My Sellers"
# Location: top-left (≈20%, 14%)
# Then: agent-browser click @<ref>
agent-browser wait element:text:My Buyers
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: A dropdown menu appears showing various account list views.

---

### 4. CLICK: Properties

> *Narrator: "In the Properties section, we also have various lists,"*

**Why**: To view property listings.

**Execute**:
```bash
find text "Properties" click
# Fallback: find role link --name "Properties" click
agent-browser wait --load networkidle
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The page navigates to the 'Properties' list view.

---

### 5. CLICK: A downward-pointing arrow icon next to '1. MY AVAILABLE PROPERTIES' text.

> *Narrator: "like Available, Life and Pending Properties."*

**Why**: To explore different property lists.

**Execute**:
```bash
snapshot -i then click @dropdown_arrow_icon
# Fallback: find text "1. MY AVAILABLE PROPERTIES" click
agent-browser wait element:text:My Live Properties (Last 7 Days)
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: A dropdown menu appears showing various property list views.

---

### 6. CLICK: Home

> *Narrator: "If we go back to the Home Page, we can access the Training Hub."*

**Why**: To return to the main dashboard.

**Execute**:
```bash
find text "Home" click
# Fallback: find role link --name "Home" click
agent-browser wait --load networkidle
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The page navigates back to the Salesforce Home Page.

---

### 7. INFO: TRAINING HUB

> *Narrator: "The regional offices will have the Salestrail Configuration Guide. Other agencies will also have the Property Publication Guide. Then, we have three property filters. The first is Recent Live, which lists properties that have just been published by your office. Here, we have the properties whose price has just changed and properties requiring movement. On the right: Target Calculation, Recommended Subscriptions, the Performance dashboard, etc. And at the bottom, other agencies will have this search bar to see if there are already clients in the database, and agents will have the Turnover dashboard."*

---

## Decision Points

- **Step 1**: The Salesforce Home Page layout may vary based on the user's role (DA, Manager, Agent). → The user should be aware that specific elements or sections might appear differently or be absent depending on their assigned role within Salesforce. The core navigation and general layout will remain similar.

## Agent Replay Tips

1. Always `snapshot -i` after any navigation to get fresh element refs
2. If `find text` matches multiple elements, use `find text "X" --parent "Y"` or fall back to `snapshot -i` + `click @ref`
3. After clicking dropdowns, wait briefly: `agent-browser wait 500`
4. Verify each step using the **Verify** notes before proceeding
5. If an element isn't found, try `agent-browser snapshot` (full tree) instead of `-i` (interactive only)

---
*Multi-pass verified workflow • Passes: audio→frames→video→grounding*
