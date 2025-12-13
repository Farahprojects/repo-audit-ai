import { GitHubAPIClient } from "../github/GitHubAPIClient.ts";

export class GitService {
    private client: GitHubAPIClient;

    constructor(token: string) {
        this.client = new GitHubAPIClient(token);
    }

    /**
     * Creates a new branch from a base branch (default: main/master)
     */
    async createBranch(owner: string, repo: string, newBranchName: string, baseBranch: string = 'main'): Promise<void> {
        // 1. Get SHA of base branch
        const ref = await this.client.getRef(owner, repo, `heads/${baseBranch}`);
        if (!ref || !ref.object || !ref.object.sha) {
            throw new Error(`Base branch '${baseBranch}' not found.`);
        }
        const sha = ref.object.sha;

        // 2. Create new reference
        await this.client.createRef(owner, repo, `refs/heads/${newBranchName}`, sha);
    }

    /**
     * Updates a single file in the repository on a specific branch.
     * Handles base64 encoding.
     * If file doesn't exist (404), creates it. Other errors are thrown.
     */
    async updateFile(
        owner: string,
        repo: string,
        path: string,
        content: string,
        message: string,
        branch: string
    ): Promise<void> {
        // 1. Get current file SHA (if it exists) to allow updating
        let sha: string | undefined;
        try {
            const currentFile = await this.client.getFileContent(owner, repo, path, branch);
            sha = currentFile.sha;
        } catch (e) {
            // Only allow upsert behavior for 404 (file not found)
            // For other errors (network, permissions, API errors), throw to prevent data loss
            const error = e as any;
            const is404 = error?.status === 404 ||
                error?.response?.status === 404 ||
                (error?.message && error.message.includes('404')) ||
                (error?.message && error.message.toLowerCase().includes('not found'));

            if (!is404) {
                // This is a real error (network, permissions, etc.) - don't proceed
                console.error(`❌ [GitService] Failed to fetch file ${path} for update:`, e);
                throw new Error(`Failed to fetch file for update: ${error?.message || String(e)}`);
            }

            // File doesn't exist (404) - proceed with creation
            console.log(`[GitService] File ${path} not found, will create new file`);
        }

        // 2. Encode content
        const contentEncoded = btoa(content);

        // 3. Commit update
        await this.client.createOrUpdateFile(owner, repo, path, message, contentEncoded, branch, sha);
    }

    /**
     * Creates a Pull Request
     */
    async createPR(
        owner: string,
        repo: string,
        title: string,
        body: string,
        head: string,
        base: string = 'main'
    ): Promise<string> {
        const pr = await this.client.createPullRequest(owner, repo, title, body, head, base);
        return pr.html_url;
    }
}
