---
name: salesforce-home-page-overview-and-navigation
description: "Salesforce Home Page Overview and Navigation in Salesforce. Multi-pass verified workflow from video training."
version: 1.0.0
read_when:
  - "Salesforce Home Page Overview and Navigation"
  - "Salesforce workflow"
  - "Salesforce training"
metadata: {"openclaw":{"emoji":"🎬","requires":{"bins":["agent-browser"]}}}
allowed-tools: Bash(agent-browser:*)
---

# Salesforce Home Page Overview and Navigation

- **Application**: Salesforce
- **URL Pattern**: `lucasfox.lightning.force.com`
- **Login Required**: Yes
- **Required Permissions**: Standard Salesforce User access for Lucas Fox instance.

## Summary

This video provides a guided tour of the Salesforce Home Page for Lucas Fox. It covers navigating the top menu to access Accounts (clients) and Properties, using dropdown menus to find specific list views, and returning to the Home Page to explore dashboard widgets like Quick Links, property status filters (Recent Live, Price Changes), and performance dashboards.

## Setup

```bash
# Install agent-browser if not already installed
npm install -g agent-browser && agent-browser install

# Start by navigating to the application
agent-browser open "<lucasfox.lightning.force.com>"
agent-browser wait --load networkidle
agent-browser snapshot -i
```

## Steps

### 1. INFO: Lucas Fox

> *Narrator: "The presenter explains that the home page may look different depending on the user's role (DA, manager, agent) but will always have a side menu and a top menu with main sections."*

**Why**: Introduction to the interface layout including the side and top menus.

*User understands the general layout of the Salesforce Home Page.*

---

### 2. CLICK: Accounts

> *Narrator: "The presenter highlights 'Accounts' as the section for clients."*

**Why**: To access the client management section.

**Execute**:
```bash
find text "Accounts" click
# Fallback: find role link --name "Accounts" click
agent-browser wait --load networkidle
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The Accounts list view page loads.

---

### 3. CLICK: Accounts

> *Narrator: "Opening the dropdown reveals lists for buyers, sellers, tenants, etc."*

**Why**: To show how to access specific filtered lists of clients.

**Execute**:
```bash
find role button --name "Accounts Menu" click
# Fallback: find text "Accounts" click
```

**Verify**: A dropdown menu appears showing various list views like 'My Buyers', 'My Sellers', and 'My Tenants'.

---

### 4. CLICK: Properties

> *Narrator: "Moving to the 'Properties' section."*

**Why**: To access the property management section.

**Execute**:
```bash
find text "Properties" click
# Fallback: find role link --name "Properties" click
agent-browser wait --load networkidle
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The Properties list view page loads.

---

### 5. CLICK: Properties

> *Narrator: "The presenter mentions lists for available, live, and pending properties, as well as tickets, reports, and dashboards."*

**Why**: To show how to access specific property status lists.

**Execute**:
```bash
find role button --name "Properties List" click
# Fallback: find text "Properties" click
```

**Verify**: A dropdown menu appears showing lists like 'My Available Properties', 'All Live Properties', and 'My Pending Properties'.

---

### 6. CLICK: Home

> *Narrator: "Returning to the Home Page."*

**Why**: To return to the main dashboard for further overview.

**Execute**:
```bash
find text "Home" click
# Fallback: find role link --name "Home" click
agent-browser wait --load networkidle
agent-browser snapshot -i  # Refresh element refs
```

**Verify**: The user is returned to the main Salesforce Home Page.

---

### 7. INFO: Recommended Quick Links

> *Narrator: "The presenter points out the Training Hub, Sales Trail guide for regional offices, and Property Publication Guide for Team Assistants."*

**Why**: Highlighting resources for different roles.

*User identifies the location of training and publication guides.*

---

### 8. INFO: Recent Live

> *Narrator: "The presenter explains the three property filters: 'Recent Live' (newly published), 'Price Changes', and 'Viewings Please' (properties requiring action)."*

**Why**: Explaining the dynamic property lists on the home page.

*User understands the property status filters on the dashboard.*

---

### 9. INFO: Existing Accounts

> *Narrator: "The presenter points out the Target Calculation, Recommended Subscriptions, and Performance Dashboard on the right, and the 'Existing Accounts' search bar and Turnover Dashboard at the bottom."*

**Why**: Final overview of utility widgets.

*User identifies the search tool and performance dashboards.*

---

## Decision Points

- **Step 1**: Role-based interface variations → The interface may vary slightly if you are a DA, Manager, or Agent, but the core navigation tabs (Home, Accounts, Properties) remain consistent.

## Agent Replay Tips

1. Always `snapshot -i` after any navigation to get fresh element refs
2. If `find text` matches multiple elements, use `find text "X" --parent "Y"` or fall back to `snapshot -i` + `click @ref`
3. After clicking dropdowns, wait briefly: `agent-browser wait 500`
4. Verify each step using the **Verify** notes before proceeding
5. If an element isn't found, try `agent-browser snapshot` (full tree) instead of `-i` (interactive only)

---
*Multi-pass verified workflow • Passes: audio→frames→video→grounding*
