---
name: salesforce-home-page-overview
description: "Salesforce Home Page Overview in Salesforce Lightning Experience. Multi-pass verified workflow from video training."
version: 1.0.0
read_when:
  - "Salesforce Home Page Overview"
  - "Salesforce Lightning Experience workflow"
  - "Salesforce Lightning Experience training"
metadata: {"openclaw":{"emoji":"🎬","requires":{"bins":["agent-browser"]}}}
allowed-tools: Bash(agent-browser:*)
---

# Salesforce Home Page Overview

- **Application**: Salesforce Lightning Experience
- **URL Pattern**: `*.lightning.force.com`
- **Login Required**: Yes
- **Required Permissions**: Salesforce user account with roles such as DA (Digital Assistant), Manager, or Agent.

## Summary

This workflow provides an overview of the Salesforce Home Page, demonstrating how to navigate to key sections like Accounts and Properties, and highlighting various quick links and dashboards available to users based on their roles.

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

### 1. INFO: In this video, we'll briefly summarise the Salesforce Home P

> *Narrator: "In this video, we'll briefly summarise the Salesforce Home Page. Keep in mind that, according to your role, if you're a DA, a manager or an agent, the home page may look a little different. However, everyone has a menu on the left with six areas and at the top, another menu with the main sections."*

---

### 2. CLICK: Accounts

> *Narrator: "These include accounts, where we have our clients."*

**Why**: To view the list of client accounts.

**Execute**:
```bash
agent-browser find role tab --name "Accounts" click
agent-browser wait --load networkidle
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The page navigates to the 'Accounts' list view.

---

### 3. CLICK: A downward-pointing arrow icon next to 'My Sellers' text, indicating a dropdown menu.

> *Narrator: "If we open this up, here we have several lists containing your buyers, your sellers, your tenants, etc."*

**Why**: To explore different categories of client accounts.

**Execute**:
```bash
agent-browser snapshot -i
# Look for: A downward-pointing arrow icon next to 'My Sellers' text, indicating a dropdown menu.
# Near: "My Sellers"
# Location: top-left (≈27%, 15%)
# Then: agent-browser click @<ref>
agent-browser wait element:text:My Buyers
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: A dropdown menu appears showing different account lists (e.g., My Buyers, My Sellers, My Tenants).

---

### 4. CLICK: Properties

> *Narrator: "In the Properties section, we also have various lists."*

**Why**: To view the list of properties.

**Execute**:
```bash
agent-browser find role tab --name "Properties" click
agent-browser wait --load networkidle
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The page navigates to the 'Properties' list view.

---

### 5. CLICK: A downward-pointing arrow icon next to 'MY AVAILABLE PROPERTIES' text, indicating a dropdown menu.

> *Narrator: "like Available, Life and Pending Properties."*

**Why**: To explore different categories of properties.

**Execute**:
```bash
agent-browser snapshot -i
# Look for: A downward-pointing arrow icon next to 'MY AVAILABLE PROPERTIES' text, indicating a dropdown menu.
# Near: "MY AVAILABLE PROPERTIES"
# Location: top-left (≈37%, 15%)
# Then: agent-browser click @<ref>
agent-browser wait element:text:My Live Properties (Last 7 Days)
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: A dropdown menu appears showing different property lists (e.g., My Live Properties, My Pending Properties).

---

### 6. CLICK: Home

> *Narrator: "If we go back to the Home Page, we can access the Training Hub. The regional offices will have the Salestrail Configuration Guide. Other agencies will also have the Property Publication Guide. Then, we have three property filters. The first is Recent Live, which lists properties that have just been published by your office. Here, we have the properties whose price has just changed and properties requiring movement. On the right: Target Calculation, Recommended Subscriptions, the Performance dashboard, etc. And at the bottom, other agencies will have this search bar to see if there are already clients in the database, and agents will have the Turnover dashboard."*

**Why**: To return to the main dashboard.

**Execute**:
```bash
agent-browser find role tab --name "Home" click
agent-browser wait --load networkidle
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The page navigates back to the Salesforce Home Page.

---

## Decision Points

- **Step 1**: The appearance and available features on the Salesforce Home Page may vary based on the user's role (DA, Manager, Agent). → Users should be aware that their specific view might differ from the one shown in the video, but core navigation elements remain consistent.

## Agent Replay Tips

1. Always `snapshot -i` after any navigation to get fresh element refs
2. If `find text` matches multiple elements, use `find text "X" --parent "Y"` or fall back to `snapshot -i` + `click @ref`
3. After clicking dropdowns, wait briefly: `agent-browser wait 500`
4. Verify each step using the **Verify** notes before proceeding
5. If an element isn't found, try `agent-browser snapshot` (full tree) instead of `-i` (interactive only)

---
*Multi-pass verified workflow • Passes: audio→frames→video→grounding*
