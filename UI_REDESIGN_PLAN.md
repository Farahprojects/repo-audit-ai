# UI Redesign Plan: ReportDashboard Audit Types & History Integration

## 🎯 **Problem Statement**
- **Current Issue**: `ReportDashboard` shows issue categories (Overview/Security/Performance/Architecture) within ONE audit
- **New Requirement**: Show multiple audits of different types for the SAME repo with history
- **Target Page**: The actual repo analysis results page (`components/ReportDashboard.tsx`)

## 🔍 **Current vs Proposed**

### **Current State (ReportDashboard.tsx)**
```
┌─────────────────┬─────────────────────────────┐
│ 🏷️ Categories   │ 📊 Single Audit Results     │
│ • Overview      │ • Health Score: 85/100      │
│ • Security      │ • Executive Summary         │
│ • Performance   │ • Issue Categories          │
│ • Architecture  │ • Findings List             │
│                 │                             │
│ 🛒 Available    │                             │
│    Upgrades     │                             │
│ • Shape (2)     │                             │
│ • Conventions(4)│                             │
│ • Performance(6)│                             │
│ • Security(10)  │                             │
└─────────────────┴─────────────────────────────┘
```

### **Proposed State**
```
┌─────────────────┬─────────────────────────────┐
│ 🔍 Repo Audits  │ 📊 Selected Audit Results   │
│ • 📈 Shape      │ • Health Score: 85/100      │
│   (2h ago)      │ • Executive Summary         │
│ • 🎯 Conventions│ • Issue Categories          │
│   (1d ago)      │ • Findings List             │
│ • ⚡ Performance│                             │
│   (3d ago)      │                             │
│ • 🔒 Security   │                             │
│   (Never)       │                             │
│                 │                             │
│ 📚 History      │                             │
│ • View all      │                             │
│   past audits   │                             │
└─────────────────┴─────────────────────────────┘
```

## 🔍 **Audit Types (Database)**
- `shape` - Repo Shape Check (2 credits)
- `conventions` - Senior Conventions Check (4 credits)
- `performance` - Performance Deep Dive (6 credits)
- `security` - Security Audit (10 credits)

## 📋 **Proposed UI Structure**

### **Left Sidebar: Available Audits**
```
Available Audits
├── 🔍 Repo Shape Check (2 credits)
├── 🎯 Senior Conventions (4 credits)
├── ⚡ Performance Deep Dive (6 credits)
└── 🔒 Security Audit (10 credits)
```

### **Main Content: Audit History Grid**
```
┌─────────────────────────────────────────────────┐
│ Recent Audits                                    │
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐ │
│ │ [REPO NAME]                                │ │
│ │ 2 hours ago • Security Audit (10 credits)   │ │
│ │ ✅ Completed • Score: 85/100               │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐ │
│ │ [REPO NAME]                                │ │
│ │ Yesterday • Performance Deep Dive (6 cred) │ │
│ │ ✅ Completed • Score: 72/100               │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## 🗄️ **Database Schema Analysis**

### **Current Tables**
- `audits` - Main audit records
- `audit_chunks` - Individual code chunks
- `audit_results` - Analysis results
- `system_prompts` - Audit prompts

### **Key Fields for History Display**
```sql
-- From audits table
audit_id, repo_url, repo_name, tier, status, score, created_at, updated_at, total_tokens, credit_cost
```

### **Key Fields for Repo Audit History**
```sql
-- Get all audits for a specific repo
SELECT
  a.audit_id,
  a.tier,
  a.status,
  a.score,
  a.created_at,
  a.credit_cost,
  sp.name as audit_name,
  sp.description
FROM audits a
JOIN system_prompts sp ON a.tier = sp.tier
WHERE a.repo_url = $repo_url
  AND a.user_id = $current_user
ORDER BY a.created_at DESC
```

## 📁 **Files to Modify**

### **1. Components to Update**
- `components/ReportDashboard.tsx` - **MAIN COMPONENT** - Complete sidebar and navigation redesign
  - Change left sidebar from issue categories to repo audit types
  - Add audit history/timeline functionality
  - Modify main navigation to switch between audit types instead of issue categories
- `constants.ts` - Update CATEGORIES to align with audit types instead of issue categories

### **2. New Components Needed**
- `components/AuditHistory.tsx` - History grid/list component
- `components/AuditCard.tsx` - Individual audit summary card
- `components/AuditSidebar.tsx` - Left sidebar with available audits

### **3. API/Service Updates**
- `services/githubService.ts` - May need audit history endpoints
- `hooks/useAuth.ts` - Ensure user context for filtering

### **4. Database Integration**
- Update queries to fetch audit history
- Add filtering by tier/repo
- Handle pagination for large history lists

## 🎨 **UI/UX Design Decisions**

### **Audit Status Indicators**
- 🟢 **Completed** - Green with score
- 🟡 **Processing** - Yellow with progress
- 🔴 **Failed** - Red with error message
- 🔵 **Queued** - Blue, waiting to start

### **Grouping Strategy**
- **Option A**: Chronological list (simplest)
- **Option B**: Group by repository, then by date
- **Option C**: Filter tabs (All, Security, Performance, etc.)

### **Information Hierarchy**
```
Audit Card:
├── Repo Name & Avatar
├── Audit Type + Credit Cost
├── Status + Score/Time
├── Key Findings Preview (3 items)
└── [View Full Report] Button
```

## 🔄 **Implementation Phases**

### **Phase 1: Sidebar Redesign (ReportDashboard.tsx)**
1. **Update constants.ts** - Change CATEGORIES from issue types to audit types
2. **Modify ReportDashboard sidebar** - Replace category navigation with audit type navigation
3. **Add audit status indicators** - Show when each audit type was last run
4. **Update TierUpsellPanel** - Change from "Available Upgrades" to "Run New Audit"

### **Phase 2: Audit Navigation Logic**
1. **Add audit selection state** - Track which audit is currently being viewed
2. **Modify data fetching** - Load specific audit results instead of filtering issues
3. **Update URL routing** - Support `/repo/:repo/audit/:auditId` style URLs
4. **Add audit switching** - Allow users to switch between completed audits

### **Phase 3: History Integration**
1. **Add history section to sidebar** - Show timeline of all audits for this repo
2. **Create audit history API endpoint** - Fetch all audits for a specific repo
3. **Implement history UI** - Compact timeline with status indicators
4. **Add "View All History" link** - Expand to full history modal/page

### **Phase 4: Polish & Edge Cases**
1. **Handle missing audits** - Show "Not yet audited" state for un-run audit types
2. **Loading states** - Show progress when switching between audits
3. **Error handling** - Handle failed audits and missing data gracefully
4. **Responsive design** - Ensure history works on mobile devices

## 📊 **Database Queries Needed**

### **Available Audits Query**
```sql
SELECT tier, name, description, credit_cost
FROM system_prompts
WHERE is_active = true
ORDER BY credit_cost ASC
```

### **Audit History Query**
```sql
SELECT
  a.audit_id,
  a.repo_name,
  a.tier,
  a.status,
  a.score,
  a.created_at,
  a.credit_cost,
  sp.name as audit_name
FROM audits a
JOIN system_prompts sp ON a.tier = sp.tier
WHERE a.user_id = $user_id
ORDER BY a.created_at DESC
LIMIT $limit OFFSET $offset
```

## 🎯 **Success Metrics**
- Users can easily navigate between different audit types for the same repo
- History sidebar shows clear timeline of when each audit was run
- No confusion between issue categories and audit types
- Clear distinction between "run new audit" vs "view existing audit"
- Fast switching between audit results for the same repo

## 🚨 **Edge Cases to Handle**
- Repo with no audits yet (show all as "Not audited")
- Repo with partial audits (some types completed, others not)
- Failed audits with error messages
- Audits still processing/queued
- Multiple audits of same type (show most recent + history)
- Very long repo names and audit names
- Mobile responsive design

## 🔍 **Testing Checklist**
- [ ] All 4 audit types show in sidebar with correct status
- [ ] Clicking audit type switches to that audit's results
- [ ] History timeline shows correct dates and status
- [ ] "Run New Audit" works for un-run audit types
- [ ] URL routing supports audit switching
- [ ] Error states handled for failed audits
- [ ] Loading states during audit switching
- [ ] Mobile layout works properly
