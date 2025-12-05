import { GoogleGenAI, Type } from "@google/genai";
import { RepoReport } from "../types";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Initialize AI client only if API key is available
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// Mock response for demo purposes when API key is not set
const generateMockReport = (repoName: string, stats: any): RepoReport => {
  const mockIssues = [
    {
      id: "sec-001",
      title: "Input Validation Missing",
      description: "User inputs are not properly validated before processing, potentially allowing injection attacks.",
      category: "Security" as const,
      severity: "Critical" as const,
      filePath: "src/components/InputHandler.tsx",
      lineNumber: 45,
      badCode: "const userInput = req.body.data;",
      fixedCode: "const userInput = validateInput(req.body.data);"
    },
    {
      id: "perf-001",
      title: "Inefficient Loop Implementation",
      description: "Nested loops with O(n²) complexity detected. Consider optimizing with hash maps or caching.",
      category: "Performance" as const,
      severity: "Warning" as const,
      filePath: "src/utils/processing.ts",
      lineNumber: 112,
      badCode: "for (let i = 0; i < data.length; i++) {\n  for (let j = 0; j < data.length; j++) {",
      fixedCode: "const processed = new Set();\nfor (let item of data) {\n  if (!processed.has(item.id)) {"
    },
    {
      id: "arch-001",
      title: "Tight Coupling Between Components",
      description: "Components are tightly coupled, making testing and maintenance difficult. Consider dependency injection.",
      category: "Architecture" as const,
      severity: "Info" as const,
      filePath: "src/services/ApiService.ts",
      lineNumber: 78,
      badCode: "import { Database } from '../db/connection';",
      fixedCode: "constructor(private db: IDatabase) {}"
    },
    {
      id: "sec-002",
      title: "Hardcoded Secrets",
      description: "API keys and secrets are hardcoded in source code instead of using environment variables.",
      category: "Security" as const,
      severity: "Critical" as const,
      filePath: "src/config/constants.ts",
      lineNumber: 15,
      badCode: "const API_KEY = 'sk-123456789';",
      fixedCode: "const API_KEY = process.env.API_KEY;"
    },
    {
      id: "perf-002",
      title: "Memory Leak in Event Listeners",
      description: "Event listeners are not properly cleaned up, potentially causing memory leaks over time.",
      category: "Performance" as const,
      severity: "Warning" as const,
      filePath: "src/components/Dashboard.tsx",
      lineNumber: 203,
      badCode: "window.addEventListener('resize', handleResize);",
      fixedCode: "window.addEventListener('resize', handleResize);\n  return () => window.removeEventListener('resize', handleResize);"
    },
    {
      id: "arch-002",
      title: "Single Responsibility Violation",
      description: "Class handles multiple responsibilities. Consider splitting into smaller, focused classes.",
      category: "Architecture" as const,
      severity: "Info" as const,
      filePath: "src/models/UserManager.ts",
      lineNumber: 45,
      badCode: "class UserManager {\n  save() {}\n  validate() {}\n  sendEmail() {}\n  generateReport() {}\n}",
      fixedCode: "class UserManager {\n  save() {}\n  validate() {}\n}\nclass EmailService {\n  sendEmail() {}\n}\nclass ReportGenerator {\n  generateReport() {}\n}"
    }
  ];

  return {
    repoName,
    stats,
    healthScore: Math.floor(Math.random() * 40) + 60, // Random score between 60-100
    summary: `Demo audit completed for ${repoName}. This is a simulated report showing potential issues that would be detected by RepoAudit.ai's AI analysis. Configure your Gemini API key to get real AI-powered code analysis.`,
    issues: mockIssues
  };
};

export const generateAuditReport = async (repoName: string, stats: any, fileContents: {path: string, content: string}[]): Promise<RepoReport> => {

  // If API key is not configured, return mock data
  if (!ai) {
    console.warn("Gemini API key not configured. Using mock audit report for demonstration.");
    return generateMockReport(repoName, stats);
  }

  // Construct a context string from the files
  let codeContext = "";
  if (fileContents.length > 0) {
    codeContext = "Here is a subset of the actual source code from the repository:\n\n";
    fileContents.forEach(f => {
      // Limit file content to avoid token limits if files are huge.
      // In a real edge function, we would use a token counter here.
      const safeContent = f.content.slice(0, 8000);
      codeContext += `--- FILE: ${f.path} ---\n${safeContent}\n\n`;
    });
  } else {
    // If no files were successfully fetched (e.g. rate limit or empty repo), we must inform the AI
    // so it doesn't hallucinate code that doesn't exist.
    codeContext = "NOTE: Unable to fetch detailed source code due to access limits. Please perform a heuristic audit based on the repository structure and common patterns for " + stats.language + " projects.";
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are a senior code auditor. Generate a high-quality audit report for a GitHub repository named "${repoName}". 
      The project primarily uses ${stats.language}.
      
      ${codeContext}
      
      Task:
      Analyze the provided code for Security vulnerabilities, Performance bottlenecks, and Architectural smells.
      Generate exactly 6 issues. 
      
      CRITICAL: Return ONLY valid JSON matching the schema below. Do not include markdown formatting like \`\`\`json.
      
      Schema:
      {
        "healthScore": number (0-100),
        "summary": "Short executive summary paragraph",
        "issues": [
          {
            "id": "string",
            "title": "string",
            "description": "string",
            "category": "Security" | "Performance" | "Architecture",
            "severity": "Critical" | "Warning" | "Info",
            "filePath": "string (use actual paths if available)",
            "lineNumber": number,
            "badCode": "string (short snippet representing the issue)",
            "fixedCode": "string (short snippet representing the fix)"
          }
        ]
      }`,
      config: {
        responseMimeType: "application/json",
         responseSchema: {
          type: Type.OBJECT,
          properties: {
            healthScore: { type: Type.NUMBER },
            summary: { type: Type.STRING },
            issues: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    category: { type: Type.STRING },
                    severity: { type: Type.STRING },
                    filePath: { type: Type.STRING },
                    lineNumber: { type: Type.INTEGER },
                    badCode: { type: Type.STRING },
                    fixedCode: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    if (response.text) {
        const data = JSON.parse(response.text);
        return {
            repoName,
            stats,
            healthScore: data.healthScore,
            summary: data.summary,
            issues: data.issues
        };
    }
    throw new Error("Empty response from AI");

  } catch (error) {
    console.error("Gemini Audit Failed:", error);
    throw error; // Re-throw to be handled by the UI error boundary or alert
  }
};
