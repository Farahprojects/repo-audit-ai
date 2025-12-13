
export class GitHubAPIClient {
    private headers: Record<string, string>;
    private baseUrl = 'https://api.github.com';

    constructor(token?: string | null) {
        this.headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'SCAI'
        };
        if (token) {
            this.headers['Authorization'] = `Bearer ${token}`;
        }
    }

    async fetchRepo(owner: string, repo: string) {
        return this.request(`/repos/${owner}/${repo}`);
    }

    async fetchLanguages(owner: string, repo: string) {
        return this.request(`/repos/${owner}/${repo}/languages`);
    }

    async fetchTree(owner: string, repo: string, branch: string) {
        return this.request(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
    }

    async fetchFile(owner: string, repo: string, path: string, branch: string) {
        return this.request(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
    }

    async fetchUser(owner: string) {
        return this.request(`/users/${owner}`);
    }

    async fetchOrg(owner: string) {
        return this.request(`/orgs/${owner}`);
    }

    // New methods for GitService

    async getRef(owner: string, repo: string, ref: string) {
        const res = await this.request(`/repos/${owner}/${repo}/git/${ref}`);
        return res.json();
    }

    async createRef(owner: string, repo: string, ref: string, sha: string) {
        const res = await this.post(`/repos/${owner}/${repo}/git/refs`, {
            ref,
            sha
        });
        return res.json();
    }

    async getFileContent(owner: string, repo: string, path: string, branch: string) {
        const res = await this.request(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
        return res.json();
    }

    async createOrUpdateFile(owner: string, repo: string, path: string, message: string, content: string, branch: string, sha?: string) {
        const body: any = {
            message,
            content,
            branch
        };
        if (sha) body.sha = sha;

        const res = await this.put(`/repos/${owner}/${repo}/contents/${path}`, body);
        return res.json();
    }

    async createPullRequest(owner: string, repo: string, title: string, body: string, head: string, base: string) {
        const res = await this.post(`/repos/${owner}/${repo}/pulls`, {
            title,
            body,
            head,
            base
        });
        return res.json();
    }

    // Repository synchronization methods
    async getLatestCommit(owner: string, repo: string, branch: string = 'main') {
        const res = await this.request(`/repos/${owner}/${repo}/commits/${branch}`);
        return res.json();
    }

    async compareCommits(owner: string, repo: string, base: string, head: string) {
        // Returns: { files: [{ filename, status, sha, patch }] }
        const res = await this.request(`/repos/${owner}/${repo}/compare/${base}...${head}`);
        return res.json();
    }

    private async request(endpoint: string) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            headers: this.headers
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GitHub API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return response;
    }

    private async post(endpoint: string, body: any) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
                ...this.headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GitHub API POST Error: ${response.status} ${response.statusText} - ${errorText}`);
        }
        return response;
    }

    private async put(endpoint: string, body: any) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'PUT',
            headers: {
                ...this.headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GitHub API PUT Error: ${response.status} ${response.statusText} - ${errorText}`);
        }
        return response;
    }

    getHeaders() {
        return this.headers;
    }
}
