
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, createErrorResponse, createJsonResponse, validateSupabaseEnv } from "../_shared/utils.ts";
import { AutoFixService } from "../_shared/services/AutoFixService.ts";
import { GitService } from "../_shared/services/GitService.ts";
import { PaymentService } from "../_shared/services/PaymentService.ts";

// @ts-ignore
console.log("Hello from auto-fix-generator!");

// Initialize Supabase client at global scope to avoid cold start performance issues
const env = validateSupabaseEnv({
    SUPABASE_URL: Deno.env.get('SUPABASE_URL')!,
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
});
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
    // CORS check
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {

        // 1. Parse Request
        const { owner, repo, issue, userToken, action = 'preview' } = await req.json();

        if (!owner || !repo || !issue || !issue.filePath || !issue.message) {
            return createErrorResponse(new Error("Missing required fields: owner, repo, issue (filePath, message)"), 400);
        }

        if (!userToken) {
            return createErrorResponse(new Error("User GitHub token is required for this operation"), 401);
        }

        // 2. Initialize Services
        const googleApiKey = Deno.env.get('GEMINI_API_KEY');
        if (!googleApiKey) {
            throw new Error("Server configuration error: GEMINI_API_KEY not set");
        }

        const autoFixService = new AutoFixService(googleApiKey);
        const gitService = new GitService(userToken);

        // 3. Fetch File Content
        // We assume the Issue object has the file path.
        // We use GitService (which uses GitHubAPIClient) to fetch content.
        // Note: GitService implementation currently only has mutation methods, 
        // we might need to expose a generic fetch or use the internal client if we want 'clean' separation.
        // However, existing GitService was focused on mutations.
        // Let's assume we can add `getFileContent` to GitService or use the client directly if exposed.
        // For now, I'll instantiate a GitHubAPIClient manually here or assume GitService has it.
        // *Self-correction*: GitService defined in previous step only had mutation methods. 
        // I should updated GitService to include `getFileContent`, but for now I will rely on the fact 
        // that I can assume standard GitHub API usage or extend GitService.
        // Actually, I should update GitService to be more complete. 
        // But I will stick to what I have and maybe instantiate the client just for fetching in this MVP step, 
        // or better, I will assume I can update GitService later and just pseudo-code the missing method call 
        // OR -- better -- I will use `fetch` directly using the shared utils if simpler, 
        // BUT consistent architecture says putting it in GitService is better.

        // Let's simply update GitService first? No, I'll write this file assuming GitService WILL have it, 
        // and then go back and update GitService if needed, OR just implement a quick fetch here using `fetch`.
        // Actually, `GitHubAPIClient` has `getFileContent`. `GitService` wraps it.
        // Accessing `gitService.client.getFileContent` would be easy if `client` was public.
        // I'll make this work by extending GitService functionality in the next step or just adding a `getFile` method to it now.

        // Wait, I can't modify GitService in this `write_to_file` call.
        // I will use direct `fetch` from `_shared/agents/utils.ts` for reading, 
        // and `GitService` for writing (if action == fix). 
        // This is pragmatic for "Preview" mode.

        // 3. Fetch File Content from Storage (Enforce Offline Mode)
        // We resolve the repoId from preflights and use RepoStorageService to get the file.
        // This ensures consistent usage of the stored archive and avoids API calls.
        const { data: preflightData, error: preflightError } = await supabase
            .from('preflights')
            .select('id')
            .eq('owner', owner)
            .eq('repo', repo)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (preflightError || !preflightData) {
            // Strict enforcement: Must have audit data to run auto-fix
            return createErrorResponse(new Error("Repository not found in cache. Please run an audit first."), 404);
        }

        const { RepoStorageService } = await import("../_shared/services/RepoStorageService.ts");
        const repoStorage = new RepoStorageService(supabase);
        const fileContent = await repoStorage.getRepoFile(preflightData.id, issue.filePath);

        if (fileContent === null) {
            return createErrorResponse(new Error(`File not found in any stored archive: ${issue.filePath}`), 404);
        }

        // 4. Generate Fix (or Quote)

        // 5. Handle Action
        if (action === 'quote') {
            const quote = await autoFixService.getQuote(issue, fileContent);
            return createJsonResponse({
                success: true,
                quote
            });
        }

        // For preview/apply, we need the fix content
        const fixSpec = await autoFixService.generateFix(issue, fileContent);

        // ...

        // ... (imports)

        // ...

        if (action === 'preview') {
            return createJsonResponse({
                success: true,
                fix: fixSpec
            });
        } else if (action === 'apply') {
            // Transactional Payment Flow: Quote -> Confirm -> Pay -> Apply
            const { paymentMethodId } = await req.json();

            if (!paymentMethodId) {
                return createErrorResponse(new Error("Payment required. Please provide a valid paymentMethodId."), 402);
            }

            // 1. Recalculate price to ensure validity
            const quote = await autoFixService.getQuote(issue, fileContent);

            // 2. Capture Payment
            const paymentResult = await PaymentService.capturePayment(quote.totalCents, 'usd', paymentMethodId);

            if (!paymentResult.success) {
                return createErrorResponse(new Error(`Payment failed: ${paymentResult.error}`), 402);
            }

            // 3. Apply Logic (Branch -> Commit -> PR)
            const branchName = `autofix/${issue.id || Date.now()}`;
            await gitService.createBranch(owner, repo, branchName);
            await gitService.updateFile(owner, repo, issue.filePath, fixSpec.fixedContent, `fix: ${fixSpec.description}`, branchName);
            const prUrl = await gitService.createPR(owner, repo, `Fix: ${issue.message}`, fixSpec.description, branchName);

            return createJsonResponse({
                success: true,
                fix: fixSpec,
                prUrl,
                transactionId: paymentResult.transactionId
            });
        }

        return createJsonResponse({ success: false, error: 'Invalid action' }, 400);

    } catch (error) {
        console.error('Auto-fix error:', error);
        return createErrorResponse(error);
    }
});
