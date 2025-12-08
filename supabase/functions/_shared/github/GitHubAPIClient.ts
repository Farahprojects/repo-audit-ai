
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

    getHeaders() {
        return this.headers;
    }
}
