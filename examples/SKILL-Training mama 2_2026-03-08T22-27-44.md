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
- **Required Permissions**: Standard Salesforce user access

## Summary

This workflow provides an overview of the Salesforce Home Page, including navigation to client and property lists, accessing the Training Hub, and locating dashboard widgets like Targets and Search.

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

### 1. CLICK: Accounts

> *Narrator: "Entre ellos destacaremos los accounts, que quiere decir clientes."*

**Why**: To access client management lists

**Execute**:
```bash
find text "Accounts" click
# Fallback: find role button --name "Accounts" click
agent-browser wait element:text:My Buyers
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: A dropdown menu with client lists appears

**If it fails**: Dropdown fails to open if network is slow

---

### 2. CLICK: My Buyers

> *Narrator: "Si desplegamos aquí tendremos varias listas, tales como tus compradores, tus sellers, tus tenants, etcétera."*

**Why**: To view the list of buyers

**Execute**:
```bash
find text "My Buyers" click
# Fallback: find role "option" --name "My Buyers" click
agent-browser wait --text "My Buyers"
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The 'My Buyers' list view is displayed

**If it fails**: List view fails to load

---

### 3. CLICK: Properties

> *Narrator: "En el apartado de properties tendremos también distintos listados."*

**Why**: To access property management lists

**Execute**:
```bash
find text "Properties" click
# Fallback: find role button --name "Properties" click
agent-browser wait element:text:My Available Properties
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: A dropdown menu with property lists appears

**If it fails**: Dropdown fails to open

---

### 4. CLICK: My Available Properties

> *Narrator: "tales como My Available Properties, All Live Properties y My Pending Properties."*

**Why**: To view available properties

**Execute**:
```bash
find text "1. MY AVAILABLE PROPERTIES" click
# Fallback: find role listitem --name "1. MY AVAILABLE PROPERTIES" click
agent-browser wait --text "My Available Properties"
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The 'My Available Properties' list view is displayed

**If it fails**: List view fails to load

---

### 5. CLICK: Home

> *Narrator: "Si regresamos a la homepage..."*

**Why**: To return to the main dashboard

**Execute**:
```bash
find text "Home" click
# Fallback: find role link --name "Home" click
agent-browser wait element:text:Recommended Quick Links
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The Salesforce Home Page is displayed

**If it fails**: Page fails to reload

---

### 6. CLICK: TRAINING HUB

> *Narrator: "aquí tendremos acceso directo al Training Hub."*

**Why**: To access training resources

**Execute**:
```bash
find text "TRAINING HUB" click
# Fallback: find role button --name "TRAINING HUB" click
agent-browser wait --url "training-hub"
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The Training Hub page opens

**If it fails**: Link is broken or access denied

---

### 7. INFO: Show my target calculation

> *Narrator: "Aquí a la derecha tendrás tu Target Calculation, Recommended Subscriptions, el Dashboard de Performance, etcétera."*

**Why**: To view performance targets

*Target calculation details are shown*

---

### 8. INFO: Search

> *Narrator: "los Team Assistants tendrán, por ejemplo, este buscador para mirar si ya existen clientes en la base de datos."*

**Why**: To search for existing clients

*Search results are displayed*

---

## Decision Points

- **Step 1**: User role determines visibility → The user should check their specific role (DA, Manager, Agent) as the UI may vary slightly.

## Agent Replay Tips

1. Always `snapshot -i` after any navigation to get fresh element refs
2. If `find text` matches multiple elements, use `find text "X" --parent "Y"` or fall back to `snapshot -i` + `click @ref`
3. After clicking dropdowns, wait briefly: `agent-browser wait 500`
4. Verify each step using the **Verify** notes before proceeding
5. If an element isn't found, try `agent-browser snapshot` (full tree) instead of `-i` (interactive only)

---
*Multi-pass verified workflow • Passes: audio→frames→video→grounding*
