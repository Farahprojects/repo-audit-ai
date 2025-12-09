// Edge function for YOUR vbase app

import { validateRequestBody, validateEmail, ValidationError, handleCorsPreflight, createErrorResponse, createSuccessResponse } from '../_shared/utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  try {
    // Validate request body
    const payload = await validateRequestBody(req, 50 * 1024); // 50KB limit for email payloads

    // Validate required email fields
    if (!payload.to || !payload.from || !payload.subject) {
      return createErrorResponse('Missing required fields: to, from, subject', 400);
    }

    // Validate email format
    if (!validateEmail(payload.to)) {
      return createErrorResponse('Invalid recipient email format', 400);
    }

    if (!validateEmail(payload.from)) {
      return createErrorResponse('Invalid sender email format', 400);
    }

    // Validate subject length
    if (typeof payload.subject !== 'string' || payload.subject.length === 0 || payload.subject.length > 200) {
      return createErrorResponse('Invalid subject: must be 1-200 characters', 400);
    }

    // Validate optional fields
    if (payload.html && typeof payload.html !== 'string') {
      return createErrorResponse('Invalid html field: must be string', 400);
    }

    if (payload.text && typeof payload.text !== 'string') {
      return createErrorResponse('Invalid text field: must be string', 400);
    }

    // Limit content sizes to prevent abuse
    if (payload.html && payload.html.length > 100 * 1024) { // 100KB
      return createErrorResponse('HTML content too large (max 100KB)', 400);
    }

    if (payload.text && payload.text.length > 50 * 1024) { // 50KB
      return createErrorResponse('Text content too large (max 50KB)', 400);
    }

    // Forward to therai project email handler
    const response = await fetch(`${Deno.env.get('THERAI_EMAIL_FUNCTION_URL')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('THERAI_ANON_KEY')}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    return new Response(JSON.stringify(result), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(errorMessage, 500);
  }
});




