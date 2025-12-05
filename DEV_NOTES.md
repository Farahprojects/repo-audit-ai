# SCAI - Backend Implementation Guide

## Overview
This document outlines the requirements for the backend architecture to support the frontend. 
Currently, the frontend performs client-side fetching. To move to production, we must implement Server-Side Logic to handle Authentication, Rate Limiting, and Secret Management.

## Tech Stack Requirements
- **Runtime:** Node.js (Edge Functions) or Python (FastAPI).
- **Database:** PostgreSQL (Supabase recommended).
- **Auth:** OAuth 2.0 (GitHub).

---

## 1. Database Schema (Supabase/PostgreSQL)

We need to store user data, audit history, and captured leads (emails).

```sql
-- Users Table (Linked to Auth)
create table profiles (
  id uuid references auth.users not null,
  email text,
  github_username text,
  credits int default 1,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Audits Table
create table audits (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id),
  repo_url text not null,
  health_score int,
  summary text,
  raw_issues jsonb, -- Store the JSON result from Gemini
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Leads (Email Capture from Preflight)
create table leads (
  id uuid default uuid_generate_v4() primary key,
  email text unique not null,
  tier_interest text, -- 'deep' or 'ultra'
  repo_scanned text,
  converted boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
```

---

## 2. Edge Functions (API Endpoints)

### A. `/api/github/fetch-tree`
**Purpose:** Fetch file structure securely using a server-side GitHub Token (prevents rate limits).
- **Input:** `{ owner: string, repo: string, branch: string }`
- **Logic:** 
  1. Check if user is authenticated.
  2. Call GitHub API `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1` using `process.env.GITHUB_PAT`.
  3. Filter non-code files (images, locks) to save bandwidth.
  4. Return JSON tree.

### B. `/api/audit/generate`
**Purpose:** The core heavy lifter. Orchestrates the audit.
- **Input:** `{ repoUrl: string, filePaths: string[] }`
- **Logic:**
  1. Fetch raw content of `filePaths` from GitHub.
  2. Construct the Context Window for Gemini.
  3. Call Gemini Pro 1.5/Flash.
  4. **Streaming Response:** Use Server-Sent Events (SSE) to stream logs back to the `Scanner.tsx` component.
     - *Event:* `[Status] Parsing files...`
     - *Event:* `[Status] Sending to Gemini...`
     - *Event:* `[Result] { ...json_payload }`
  5. Deduct 1 credit from user profile.
  6. Save result to `audits` table.

### C. `/api/auth/github`
**Purpose:** Handle OAuth handshake.
- **Logic:** Standard OAuth flow to get an Access Token for private repositories.

---

## 3. Environment Variables Needed
```env
# Public
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

# Secret (Server Only)
SUPABASE_SERVICE_ROLE_KEY=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_PAT=... (Personal Access Token for public repo fetching)
GEMINI_API_KEY=...
```

---

## 4. Frontend Integration Steps
1. **Swap `githubService.ts`**: Replace `fetch()` calls to GitHub API with `fetch('/api/github/...')`.
2. **Swap `Scanner.tsx` logic**: Connect to the SSE endpoint:
   ```ts
   const eventSource = new EventSource('/api/audit/stream?repo=...');
   eventSource.onmessage = (e) => setLogs(prev => [...prev, e.data]);
   ```
