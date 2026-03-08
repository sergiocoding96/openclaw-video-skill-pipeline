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
- **Required Permissions**: Salesforce user access (specific components depend on role: DA, manager, agent, team assistant)

## Summary

A brief overview of the Salesforce Home Page, demonstrating navigation to the Accounts and Properties tabs, exploring their list views, and reviewing the various components available on the Home dashboard such as Quick Links, property filters, and search tools.

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

**Why**: To navigate to the clients (accounts) section.

**Execute**:
```bash
find text "Accounts" click
# Fallback: find role link --name "Accounts" click
agent-browser wait --load networkidle
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The Accounts list view page loads.

**If it fails**: Tab might not be visible depending on user role permissions.

---

### 2. CLICK: 2. My Sellers

> *Narrator: "Si desplegamos aquí tendremos varias listas, tales como tus compradores, tus sellers, tus tenants, etcétera."*

**Why**: To show the different lists of accounts available.

**Execute**:
```bash
agent-browser find role button --name "2. My Sellers" click
agent-browser wait element:@ref
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: A dropdown menu appears showing other available list views.

**If it fails**: Dropdown might not open if clicked outside the text/icon area.

---

### 3. CLICK: Properties

> *Narrator: "En el apartado de properties tendremos también distintos listados..."*

**Why**: To navigate to the properties section.

**Execute**:
```bash
find text "Properties" click
# Fallback: find role link --name "Properties" click
agent-browser wait --load networkidle
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The Properties list view page loads.

**If it fails**: Tab might not be visible depending on user role permissions.

---

### 4. CLICK: 1. MY AVAILABLE PROPERTIES

> *Narrator: "...tales como My Available Properties, All Live Properties y My Pending Properties."*

**Why**: To show the different lists of properties available.

**Execute**:
```bash
find role button --name "1. MY AVAILABLE PROPERTIES" click
# Fallback: find text "1. MY AVAILABLE PROPERTIES" click
agent-browser wait element:@ref
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: A dropdown menu appears showing other available list views for properties.

**If it fails**: Dropdown might not open if clicked outside the text/icon area.

---

### 5. CLICK: Home

> *Narrator: "Si regresamos a la homepage..."*

**Why**: To return to the main dashboard.

**Execute**:
```bash
find text "Home" click
# Fallback: find role link --name "Home" click
agent-browser wait --load networkidle
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The Salesforce Home Page loads.

**If it fails**: Clicking might not register if the page is still loading.

---

### 6. INFO: Recommended Quick Links

> *Narrator: "Aquí tendremos acceso directo al Training Hub... Luego tendremos tres filtros de propiedades... Aquí a la derecha tendrás tu Target Calculation..."*

**Why**: To provide context on the available tools and filters on the dashboard.

*Presenter explains the different sections of the Home Page.*

---

### 7. SCROLL: Existing Accounts

> *Narrator: "Y hacia debajo los Team Assistants tendrán, por ejemplo, este buscador para mirar si ya existen clientes en la base de datos..."*

**Why**: To view components located further down on the Home Page.

**Execute**:
```bash
agent-browser scroll down 500
agent-browser wait none
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The page scrolls down to reveal the 'Existing Accounts' search component and dashboards.

**If it fails**: Page might not be scrollable if the screen resolution is very high.

---

## Decision Points

- **Step 1**: The layout and available tabs/components may vary based on the user's role (DA, manager, agent). → Check the user's assigned profile/role in Salesforce to determine which components should be visible.

## Agent Replay Tips

1. Always `snapshot -i` after any navigation to get fresh element refs
2. If `find text` matches multiple elements, use `find text "X" --parent "Y"` or fall back to `snapshot -i` + `click @ref`
3. After clicking dropdowns, wait briefly: `agent-browser wait 500`
4. Verify each step using the **Verify** notes before proceeding
5. If an element isn't found, try `agent-browser snapshot` (full tree) instead of `-i` (interactive only)

---
*Multi-pass verified workflow • Passes: audio→frames→video→grounding*
