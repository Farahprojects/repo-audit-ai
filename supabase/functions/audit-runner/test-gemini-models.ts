/**
 * Test script to list available Gemini models for your API key
 * 
 * Run with: 
 *   export GEMINI_API_KEY="your-key-here"
 *   deno run --allow-net --allow-env test-gemini-models.ts
 * 
 * OR run locally:
 *   GEMINI_API_KEY="your-key" npx ts-node test-gemini-models.ts
 */

const API_KEY = process.env.GEMINI_API_KEY || Deno?.env?.get?.('GEMINI_API_KEY');

if (!API_KEY) {
    console.error('ERROR: GEMINI_API_KEY environment variable is not set');
    process.exit(1);
}

async function testGeminiAPI() {
    console.log('=== Testing Gemini API Configuration ===\n');

    // Test 1: List models using v1beta endpoint (for AI Studio keys)
    console.log('1. Testing v1beta endpoint (generativelanguage.googleapis.com)...');
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
        );

        if (!response.ok) {
            const error = await response.text();
            console.log(`   ❌ v1beta ListModels failed: ${response.status}`);
            console.log(`   Error: ${error}\n`);
        } else {
            const data = await response.json();
            console.log('   ✅ v1beta endpoint works!');
            console.log('   Available models that support generateContent:');

            const generateContentModels = data.models?.filter((m: any) =>
                m.supportedGenerationMethods?.includes('generateContent')
            ) || [];

            generateContentModels.forEach((model: any) => {
                console.log(`     - ${model.name.replace('models/', '')}`);
            });
            console.log('');
        }
    } catch (e) {
        console.log(`   ❌ Error: ${e}\n`);
    }

    // Test 2: Try a simple generateContent call with different models
    const modelsToTest = [
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-pro',
        'gemini-1.5-pro-002',
        'gemini-2.0-flash',
        'gemini-2.0-flash-exp',
    ];

    console.log('2. Testing generateContent with different model names...');

    for (const model of modelsToTest) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': API_KEY
                    },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: 'Say "hello"' }] }]
                    })
                }
            );

            if (response.ok) {
                console.log(`   ✅ ${model} - WORKS`);
            } else {
                const error = await response.json();
                console.log(`   ❌ ${model} - ${error.error?.message || response.status}`);
            }
        } catch (e) {
            console.log(`   ❌ ${model} - Error: ${e}`);
        }
    }

    console.log('\n=== Recommendations ===');
    console.log('If all models fail with 404:');
    console.log('  - You may be using a Google Cloud Console API key');
    console.log('  - The generativelanguage.googleapis.com API needs an AI Studio key');
    console.log('  - Get an AI Studio key from: https://aistudio.google.com/app/apikey');
    console.log('\nAlternatively, use Vertex AI endpoint for Cloud Console keys:');
    console.log('  - Endpoint: https://{REGION}-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/publishers/google/models/{MODEL}:generateContent');
}

testGeminiAPI();
