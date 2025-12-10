# Universal Reasoning Layer (Orchestrator) Testing

This directory contains isolated tests for the new Universal Reasoning Layer, completely separate from the old audit system.

## ⚠️ Important: Authentication Required

**The orchestrator requires proper user authentication.** The tests will show JWT errors until you authenticate through your application.

## Quick Start

### Prerequisites
1. **Authenticate first:** Log into your SCAI application in the browser
2. **Get session token:** Copy the JWT from browser dev tools (Application → Local Storage → `supabase.auth.token`)
3. **Set environment variables:**
   ```bash
   export SUPABASE_URL="https://zlrivxntdtewfagrbtry.supabase.co"
   export SUPABASE_ANON_KEY="your-anon-key"
   export USER_JWT="your-session-jwt-from-browser"
   ```

### Run Tests

```bash
# 1. Test endpoint accessibility (will show auth error)
node tests/orchestrator-direct-test.js

# 2. Create a real preflight through the UI first, then:
node tests/get-preflight.js  # Get available preflight IDs

# 3. Test with real data (requires authentication)
node tests/orchestrator-test.js YOUR_PREFLIGHT_ID security
```

## What the Tests Do

### 🧪 Test 1: Legacy API Format
- Uses old `preflightId` + `tier` format
- Tests backward compatibility
- Should work with existing audit data

### 🧪 Test 2: New Task Format
- Uses new `task` object format
- Tests native orchestrator API
- More flexible and powerful

### 🧪 Test 3: Error Handling
- Tests invalid requests
- Verifies proper error responses

## Expected Behavior

### ✅ Success Indicators
- **Status 200** responses
- **SSE streams** with `<thinking>` tags
- **Reasoning steps** logged to `reasoning_steps` table
- **Tool executions** visible in logs

### ⚠️ Common Issues to Watch For
- **Authentication errors** - Check API keys
- **Preflight not found** - Verify preflight ID exists
- **Tool execution failures** - Check GitHub tokens, permissions
- **Token limits** - Monitor usage vs budgets
- **Database errors** - Check reasoning tables exist

## Debugging

### Check Function Logs
```bash
# In Supabase dashboard, go to:
# Edge Functions → orchestrator → Logs
```

### Monitor Database
```sql
-- Check reasoning steps
SELECT * FROM reasoning_steps
WHERE session_id = 'your-session-id'
ORDER BY step_number;

-- Check tool executions
SELECT tool_called, tool_input, tool_output, created_at
FROM reasoning_steps
WHERE tool_called IS NOT NULL;
```

### Common Fixes
1. **"Preflight not found"** - Use a valid preflight ID from your database
2. **"Authentication failed"** - Check SUPABASE_ANON_KEY
3. **"Tool execution failed"** - Verify GitHub tokens in preflight
4. **Empty responses** - Check function deployment status

## Migration Testing

Once the orchestrator works, you can:

1. **Compare outputs** - Run both old and new systems on same preflight
2. **Validate results** - Ensure issue detection is equivalent
3. **Performance testing** - Compare token usage and execution time
4. **Gradual rollout** - Switch portions of traffic to new system

## Example Test Output

```
🚀 Testing Universal Reasoning Layer (Orchestrator)
================================================
📋 Preflight ID: abc-123-def
🎯 Tier: security
🔗 Endpoint: https://your-project.supabase.co/functions/v1/orchestrator

🧪 Test 1: Legacy API Format (Backward Compatibility)
---------------------------------------------------
📡 Response Status: 200
📺 SSE Stream Detected!
📄 Stream Content Preview:
data: {"step":1,"thinking":"I need to audit this repository for security issues. Let me start by understanding what tools are available and what the repository structure looks like.","timestamp":"2024-01-01T00:00:00Z"}

data: {"step":2,"tool_call":{"name":"audit_repo_structure","input":{"preflightId":"abc-123-def"}},"timestamp":"2024-01-01T00:00:01Z"}
...
```

This shows the orchestrator is working correctly with step-by-step reasoning and tool execution!
