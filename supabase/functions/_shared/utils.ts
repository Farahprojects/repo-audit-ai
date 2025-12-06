// Shared utilities for Supabase Edge Functions

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

export async function getAuthUserIdFromRequest(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  // Extract the JWT token
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    throw new Error('Invalid Authorization header format');
  }

  // Decode the JWT to get user ID (simple decode, not full verification)
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.sub;

    if (!userId) {
      throw new Error('Invalid token: missing user ID');
    }

    return userId;
  } catch (error) {
    throw new Error('Invalid JWT token');
  }
}

export function createJsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

