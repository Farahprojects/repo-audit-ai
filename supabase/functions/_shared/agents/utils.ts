
export const GEMINI_MODEL = 'gemini-2.0-flash-exp';

export async function callGemini(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
    temperature: number = 0.2
): Promise<any> {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                contents: [
                    { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
                ],
                generationConfig: {
                    temperature: temperature,
                    maxOutputTokens: 8192,
                    responseMimeType: "application/json"
                }
            })
        }
    );

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    try {
        return JSON.parse(text);
    } catch (e) {
        console.error('Failed to parse Gemini JSON:', text);
        throw new Error('Invalid JSON response from Gemini');
    }
}
