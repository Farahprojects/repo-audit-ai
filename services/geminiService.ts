import { GoogleGenAI, Type } from "@google/genai";
import { RepoReport } from "../types";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Initialize AI client only if API key is available
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;


export const generateAuditReport = async (repoName: string, stats: any, fileContents: {path: string, content: string}[]): Promise<RepoReport> => {

  // Fail fast if API key is not configured
  if (!ai) {
    throw new Error("Gemini API key not configured. Please set VITE_GEMINI_API_KEY in your .env.local file.");
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
