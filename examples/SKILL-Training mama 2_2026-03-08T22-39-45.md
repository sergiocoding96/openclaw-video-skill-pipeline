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

This workflow provides a guided tour of the Lucas Fox Salesforce Home Page. It covers navigating to the Accounts and Properties tabs, using dropdown menus to access specific list views, returning to the Home dashboard, and identifying key widgets such as Quick Links, Property Filters (Recent Live, Price Changes), and the Performance sidebar.

## Setup

Use OpenClaw's built-in browser tool. No external dependencies needed.

```
openclaw browser open "lucasfox.lightning.force.com/lightning/page/home"
openclaw browser wait --load networkidle
openclaw browser snapshot --interactive
```

> **Tip**: If you need to use an existing logged-in Chrome session, use `openclaw browser --profile chrome` to attach via the extension relay.

## Steps

### 1. INFO: Lucas Fox

> *Narrator: "In this video, we'll briefly summarize the Salesforce Home Page. Keep in mind that, according to your role... the home page may look a little different. However, everyone has a menu on the left... and at the top, another menu with the main sections."*

**Why**: Introduction to the interface layout.

*User understands the general layout of the Salesforce Home Page.*

---

### 2. CLICK: Accounts

> *Narrator: "These include accounts, where we have our clients."*

**Why**: To access the client management section.

**Execute**:
```
openclaw browser find text "Accounts" click
# Fallback: openclaw browser find role link --name "Accounts" click
openclaw browser wait --url "/lightning/o/Account/list"
openclaw browser snapshot --interactive  # Refresh refs
```

**Verify**: The Accounts list view page loads.

---

### 3. CLICK: Down arrow icon next to the Accounts tab

> *Narrator: "If we open this up, here we have several lists containing your buyers, your sellers, your tenants, etc."*

**Why**: To show how to switch between different client lists.

**Execute**:
```
openclaw browser snapshot -i then click @ref
# Fallback: openclaw browser find role button --name "Accounts" click
```

**Verify**: A dropdown menu appears showing various account lists like 'My Buyers', 'My Sellers', etc.

---

### 4. CLICK: Properties

> *Narrator: "In the Properties section..."*

**Why**: To access the property management section.

**Execute**:
```
openclaw browser find text "Properties" click
# Fallback: openclaw browser find role link --name "Properties"
openclaw browser wait --url "/lightning/o/Property__c/list"
openclaw browser snapshot --interactive  # Refresh refs
```

**Verify**: The Properties list view page loads.

---

### 5. CLICK: Down arrow icon next to the Properties tab

> *Narrator: "...we also have various lists, like Available, Life and Pending Properties."*

**Why**: To show how to filter property views.

**Execute**:
```
openclaw browser find role button --name "Properties"
# Fallback: openclaw browser snapshot -i then click @ref
```

**Verify**: A dropdown menu appears showing property lists like 'My Available Properties', 'All Live Properties', etc.

---

### 6. INFO: Tickets

> *Narrator: "We also have the Tickets, Reports and Dashboards section."*

**Why**: Highlighting other key navigation areas.

*User identifies the location of Tickets, Reports, and Dashboards tabs.*

---

### 7. CLICK: Home

> *Narrator: "If we go back to the Home Page..."*

**Why**: To return to the main dashboard overview.

**Execute**:
```
openclaw browser find text "Home" click
# Fallback: openclaw browser find role link --name "Home" click
openclaw browser wait --url "/lightning/page/home"
openclaw browser snapshot --interactive  # Refresh refs
```

**Verify**: The main Home Page dashboard is displayed.

---

### 8. INFO: Recommended Quick Links

> *Narrator: "...we can access the Training Hub. The regional offices will have the Salestrail guide. Other agencies will also have the Property Publication Guide."*

**Why**: Explaining the Quick Links section.

*User sees the Training Hub and Publication Guide links.*

---

### 9. INFO: Recent Live

> *Narrator: "Then, we have three property filters. The first is Recent Live, which lists properties that have just been published by your office. Here, we have the properties whose price has just changed and properties requiring movement."*

**Why**: Explaining the property status dashboard widgets.

*User understands the property status filters.*

---

### 10. INFO: Quick Links

> *Narrator: "On the right: Target Calculation, Recommended Subscriptions, the Performance dashboard, etc. And at the bottom, other agencies will have this search bar to see if there are already clients in the database, and agents will have the Turnover dashboard."*

**Why**: Final overview of sidebar and bottom page elements.

*User sees the sidebar tools and bottom search/dashboard features.*

---

## Decision Points

- **Step 3**: Selecting a specific account list. → Choose 'My Buyers', 'My Sellers', or 'My Tenants' based on the type of client you need to manage.

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
