# UI Redesign Plan: Audit Types & History Integration

## 🎯 **Problem Statement**
- Current UI shows "Overview, Security, Performance, Architecture" which doesn't match our 4 audit types
- No history functionality for multiple audits on same repo
- Need clean UI that scales with multiple audit instances

## 🔍 **Current Audit Types (Database)**
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

### **History Query Logic**
```sql
SELECT
  audit_id,
  repo_name,
  tier,
  status,
  score,
  created_at,
  credit_cost
FROM audits
WHERE user_id = $current_user
ORDER BY created_at DESC
LIMIT 50
```

## 📁 **Files to Modify**

### **1. Components to Update**
- `components/Dashboard.tsx` - Main dashboard layout
- `components/ReportDashboard.tsx` - Current audit results display
- `components/IssueCard.tsx` - Individual issue display

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

### **Phase 1: Sidebar Redesign**
1. Update `Dashboard.tsx` left panel
2. Replace static cards with dynamic audit type cards
3. Add credit cost display
4. Connect to `system_prompts` table for descriptions

### **Phase 2: History Component**
1. Create `AuditHistory.tsx` component
2. Add database query for user's audit history
3. Implement card layout for each audit
4. Add loading states and error handling

### **Phase 3: Integration**
1. Update main dashboard layout
2. Add routing for individual audit views
3. Implement filtering/search functionality
4. Add pagination for large histories

### **Phase 4: Polish**
1. Add animations and transitions
2. Implement responsive design
3. Add empty states ("No audits yet")
4. Performance optimization for large lists

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
- Users can easily see all 4 audit types
- History is scannable and organized
- No UI clutter with multiple audits per repo
- Clear credit costs and audit status
- Fast loading of history (pagination ready)

## 🚨 **Edge Cases to Handle**
- User with no audit history
- Failed audits with error messages
- Audits still processing
- Very long repo names
- Multiple audits of same type on same repo
- Different screen sizes

## 🔍 **Testing Checklist**
- [ ] All 4 audit types display correctly
- [ ] History loads and paginates
- [ ] Status indicators work
- [ ] Credit costs show accurately
- [ ] Responsive design works
- [ ] Error states handled
- [ ] Empty states look good
- [ ] Performance acceptable with 50+ audits
