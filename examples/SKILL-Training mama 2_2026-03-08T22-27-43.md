---
name: salesforce-home-page-and-navigation-overview
description: "Salesforce Home Page and Navigation Overview in Salesforce. Multi-pass verified workflow from video training."
version: 1.0.0
read_when:
  - "Salesforce Home Page and Navigation Overview"
  - "Salesforce workflow"
  - "Salesforce training"
metadata: {"openclaw":{"emoji":"🎬","requires":{"bins":["agent-browser"]}}}
allowed-tools: Bash(agent-browser:*)
---

# Salesforce Home Page and Navigation Overview

- **Application**: Salesforce
- **URL Pattern**: `*.lightning.force.com`
- **Login Required**: Yes
- **Required Permissions**: Standard user access to Salesforce with visibility to Accounts and Properties objects.

## Summary

A brief tour of the Salesforce Lightning interface, demonstrating how to navigate between the Home, Accounts, and Properties tabs, how to access different list views within those tabs, and highlighting key widgets available on the Home page.

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

**Why**: To navigate to the Accounts section to view client lists.

**Execute**:
```bash
find text "Accounts" click
# Fallback: find role link --name "Accounts" click
agent-browser wait --load networkidle
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The Accounts list view page loads.

**If it fails**: The tab might be hidden under a 'More' dropdown if the screen is narrow.

---

### 2. CLICK: 2. My Sellers

> *Narrator: "Si desplegamos aquí tendremos varias listas, tales como tus compradores, tus sellers, tus tenants, etcétera."*

**Why**: To display the different predefined lists of accounts available to the user.

**Execute**:
```bash
agent-browser find role button --name "2. My Sellers" click
agent-browser wait element:visible
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: A dropdown menu appears showing available list views for Accounts.

**If it fails**: The list view name might be different depending on the user's last accessed list.

---

### 3. CLICK: Properties

> *Narrator: "En el apartado de properties tendremos también distintos listados"*

**Why**: To navigate to the Properties section.

**Execute**:
```bash
find text "Properties" click
# Fallback: find role link --name "Properties" click
agent-browser wait --load networkidle
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The Properties list view page loads.

**If it fails**: The tab might be hidden under a 'More' dropdown if the screen is narrow.

---

### 4. CLICK: 1. MY AVAILABLE PROPERTIES

> *Narrator: "tales como My Available Properties, All Live Properties y My Pending Properties."*

**Why**: To display the different predefined lists of properties available to the user.

**Execute**:
```bash
find text "1. MY AVAILABLE PROPERTIES" click
# Fallback: find role button --name "Select a List View: Properties" click
agent-browser wait element:visible
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: A dropdown menu appears showing available list views for Properties.

**If it fails**: The list view name might be different depending on the user's last accessed list.

---

### 5. CLICK: Home

> *Narrator: "Si regresamos a la homepage, aquí tendremos acceso directo al Training Hub..."*

**Why**: To return to the main dashboard to view quick links and widgets.

**Execute**:
```bash
find text "Home" click
# Fallback: find role link --name "Home" click
agent-browser wait --load networkidle
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The main Salesforce Home Page reloads.

**If it fails**: None, this is a standard navigation tab.

---

### 6. SCROLL: The main content area of the page

> *Narrator: "Y hacia debajo los Team Assistants tendrán, por ejemplo, este buscador para mirar si ya existen clientes en la base de datos y los agentes tendrán el Dashboard de Turnover."*

**Why**: To view widgets located further down the page.

**Execute**:
```bash
snapshot -i then scroll @10
# Fallback: find role main scroll
agent-browser wait none
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The lower sections of the home page, such as 'Existing Accounts' and 'Turnover and Commissions Dashboard', become visible.

**If it fails**: Page might not be scrollable if the screen resolution is very high and all content fits.

---

## Decision Points

- **Step 2**: The exact text of the list view dropdown button depends on the last list view the user accessed. → Look for the dropdown arrow icon immediately to the right of the large heading text on the top left of the list view page.

## Agent Replay Tips

1. Always `snapshot -i` after any navigation to get fresh element refs
2. If `find text` matches multiple elements, use `find text "X" --parent "Y"` or fall back to `snapshot -i` + `click @ref`
3. After clicking dropdowns, wait briefly: `agent-browser wait 500`
4. Verify each step using the **Verify** notes before proceeding
5. If an element isn't found, try `agent-browser snapshot` (full tree) instead of `-i` (interactive only)

---
*Multi-pass verified workflow • Passes: audio→frames→video→grounding*
