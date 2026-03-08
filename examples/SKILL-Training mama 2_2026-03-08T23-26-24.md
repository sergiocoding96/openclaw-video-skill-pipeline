---
name: salesforce-home-page-overview-and-navigation
description: "Salesforce Home Page Overview and Navigation in Salesforce. Multi-pass verified workflow from video training."
version: 1.0.0
read_when:
  - "Salesforce Home Page Overview and Navigation"
  - "Salesforce workflow"
  - "Salesforce training"
metadata: {"openclaw":{"emoji":"🎬"}}
allowed-tools: browser(*)
---

# Salesforce Home Page Overview and Navigation

- **Application**: Salesforce
- **URL Pattern**: `lucasfox.lightning.force.com/lightning/page/home`
- **Login Required**: Yes
- **Required Permissions**: Salesforce User Access (DA, Manager, or Agent role)

## Summary

This workflow provides an overview of the Salesforce Home Page for Lucas Fox users. It demonstrates how to navigate to client 'Accounts' and 'Properties' list views, how to use list view filters, and highlights key dashboard components like Quick Links, property status filters (Recent Live, Price Changes), and performance targets.

## Setup

Use OpenClaw's built-in browser tool. No external dependencies needed.

```
openclaw browser open "lucasfox.lightning.force.com/lightning/page/home"
openclaw browser wait --load networkidle
openclaw browser snapshot --interactive
```

> **Tip**: If you need to use an existing logged-in Chrome session, use `openclaw browser --profile chrome` to attach via the extension relay.

## Steps

### 1. CLICK: Accounts

> *Narrator: "Entre ellos destacaremos los accounts, que quiere decir clientes."*

**Why**: To access client information (Buyers, Sellers, Tenants).

**Execute**:
```
openclaw browser find text "Accounts" click
# Fallback: openclaw browser find role link --name "Accounts" click
openclaw browser wait --url "/Account/list"
openclaw browser snapshot --interactive  # Refresh refs
```

**Verify**: The Accounts list view page loads.

**Visual Reference**: `references/frames/step_1.png` — Take a screenshot with `openclaw browser screenshot` and compare. The screen should look similar to this frame.

---

### 2. CLICK: 2. My Sellers

> *Narrator: "Si desplegamos aquí tendremos varias listas, tales como tus compradores, tus sellers, tus tenants, etcétera."*

**Why**: To switch between different categories of clients.

**Execute**:
```
openclaw browser find role button --name "2. My Sellers" click
# Fallback: openclaw browser find text "2. My Sellers" click
```

**Verify**: A dropdown menu appears showing various list views like '1. My Buyers', '2. My Sellers', etc.

**Visual Reference**: `references/frames/step_2.png` — Take a screenshot with `openclaw browser screenshot` and compare. The screen should look similar to this frame.

---

### 3. CLICK: Properties

> *Narrator: "En el apartado de properties tendremos también distintos listados..."*

**Why**: To access property listings.

**Execute**:
```
openclaw browser find text "Properties" click
# Fallback: openclaw browser find role link --name "Properties" click
openclaw browser wait --url "/Property__c/list"
openclaw browser snapshot --interactive  # Refresh refs
```

**Verify**: The Properties list view page loads.

**Visual Reference**: `references/frames/step_3.png` — Take a screenshot with `openclaw browser screenshot` and compare. The screen should look similar to this frame.

---

### 4. CLICK: 1. MY AVAILABLE PROPERTIES

> *Narrator: "...tales como MyAvailableProperties, AllLiveProperties y MyPendingProperties."*

**Why**: To filter properties by status (Available, Live, Pending).

**Execute**:
```
openclaw browser find text "1. MY AVAILABLE PROPERTIES" click
# Fallback: openclaw browser find role button --name "Select a List View: Properties"
```

**Verify**: A dropdown menu appears showing property lists like 'My Available Properties', 'All Live Properties', etc.

**Visual Reference**: `references/frames/step_4.png` — Take a screenshot with `openclaw browser screenshot` and compare. The screen should look similar to this frame.

---

### 5. CLICK: Home

> *Narrator: "Si regresamos a la homepage..."*

**Why**: To return to the main dashboard overview.

**Execute**:
```
openclaw browser find text "Home" click
# Fallback: openclaw browser find role link --name "Home" click
openclaw browser wait --url "/page/home"
openclaw browser snapshot --interactive  # Refresh refs
```

**Verify**: The main Salesforce Home Page is displayed.

**Visual Reference**: `references/frames/step_5.png` — Take a screenshot with `openclaw browser screenshot` and compare. The screen should look similar to this frame.

---

### 6. INFO: Recommended Quick Links

> *Narrator: "...aquí tendremos acceso directo al training hub, las oficinas regionales tendrán la guía de sales drill y los team assistants también tendrán el property publication guide."*

**Why**: Shows access to Training Hub, SalesTrail guide, and Property Publication Guide.

*Shows access to Training Hub, SalesTrail guide, and Property Publication Guide.*

---

### 7. INFO: Recent Live

> *Narrator: "Luego tendremos tres filtros de propiedades. El primero es RecentLive... propiedades cuyo precio acaba de cambiar y propiedades que necesitan movimiento."*

**Why**: Explains property filters: Recent Live (newly published), Price Changes, and Viewings Please.

*Explains property filters: Recent Live (newly published), Price Changes, and Viewings Please.*

---

### 8. INFO: Targets

> *Narrator: "Aquí a la derecha tendrás tu target calculation, recommended subscriptions, el dashboard de performance, etcétera."*

**Why**: Shows Target Calculation, Recommended Subscriptions, and Performance dashboard.

*Shows Target Calculation, Recommended Subscriptions, and Performance dashboard.*

---

### 9. INFO: Existing Accounts

> *Narrator: "Y allá debajo los team assistants tendrán por ejemplo este buscador... y los agentes tendrán el dashboard de turnover."*

**Why**: Shows the client search bar and Turnover dashboard at the bottom.

*Shows the client search bar and Turnover dashboard at the bottom.*

---

## Decision Points

- **Step 2**: Selecting a specific client list view. → Choose 'My Buyers', 'My Sellers', or 'My Tenants' based on the type of client you need to manage.

## Agent Replay Tips

1. Always `openclaw browser snapshot --interactive` after navigation to get fresh refs
2. Refs change on every page load — never reuse refs from a previous snapshot
3. If a ref doesn't match, use `openclaw browser snapshot --labels` for a visual overlay
4. After clicking dropdowns, wait briefly: `openclaw browser wait 500`
5. Verify each step using the **Verify** notes before proceeding
6. For logged-in sessions, use `openclaw browser --profile chrome` to attach to existing Chrome
7. If an element isn't found, try `openclaw browser snapshot` (full tree) instead of `--interactive`

---
*Multi-pass verified workflow • Gemini gemini-3-flash-preview + Whisper + frame grounding*
