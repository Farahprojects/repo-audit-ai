// @ts-nocheck - Deno runtime

// Email Verification Edge Function

// Handles sending verification codes and verifying email addresses

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getAuthUserIdFromRequest } from '../_shared/utils.ts';

const CORS_HEADERS = {
  ...corsHeaders,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ENV = {
  SUPABASE_URL: Deno.env.get('SUPABASE_URL')!,
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY')!,
};

if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_ROLE_KEY || !ENV.ANON_KEY) {
  throw new Error('Missing required environment variables');
}

const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

// Generate 6-digit numeric code

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    // Authenticate user

    const userId = await getAuthUserIdFromRequest(req);

    // Parse request body

    const body = await req.json();
    const { action, email, code } = body;

    if (!action) {
      return jsonResponse({ error: 'Missing action parameter' }, 400);
    }

    // Action: send_code

    if (action === 'send_code') {
      if (!email || typeof email !== 'string') {
        return jsonResponse({ error: 'Missing or invalid email parameter' }, 400);
      }

      // Validate email format

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return jsonResponse({ error: 'Invalid email format' }, 400);
      }

      // Generate 6-digit code

      const verificationCode = generateVerificationCode();
      console.log('[verify-email] Generated code:', verificationCode, 'for user:', userId);

      // Calculate expiry (5 minutes from now)

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 5);

      // Delete any existing codes for this user

      const { error: deleteError } = await supabase
        .from('verification_codes')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        console.log(
          '[verify-email] Note: Could not delete old codes (might not exist):',
          deleteError.message
        );
      }

      // Store new code

      console.log('[verify-email] Attempting to insert code to verification_codes table...');
      const { data: insertData, error: insertError } = await supabase
        .from('verification_codes')
        .insert({
          user_id: userId,
          code: verificationCode,
          email: email.toLowerCase().trim(),
          expires_at: expiresAt.toISOString(),
        })
        .select();

      if (insertError) {
        console.error('[verify-email] ❌ Error storing code:', insertError);
        return jsonResponse(
          {
            error: 'Failed to store verification code',
            details: insertError.message,
          },
          500
        );
      }

      console.log('[verify-email] ✅ Code stored successfully:', insertData);

      // Fetch email template from database

      const { data: template, error: templateError } = await supabase
        .from('email_notification_templates')
        .select('subject, body_html, body_text')
        .eq('template_type', 'email_verification')
        .single();

      if (templateError || !template) {
        console.error('[verify-email] Error fetching email template:', templateError);
        return jsonResponse({ error: 'Failed to load email template' }, 500);
      }

      // Replace placeholder with actual verification code

      const emailHtml = template.body_html.replace(/\{\{verification_code\}\}/g, verificationCode);
      const emailText = template.body_text.replace(/\{\{verification_code\}\}/g, verificationCode);

      // Call send-email function using supabase.functions.invoke()

      const { data: emailResult, error: emailError } = await supabase.functions.invoke(
        'send-email',
        {
          body: {
            to: email.toLowerCase().trim(),
            from: 'noreply',
            subject: template.subject,
            html: emailHtml,
            text: emailText,
          },
        }
      );

      if (emailError) {
        console.error('[verify-email] Error sending email:', emailError);
        return jsonResponse(
          {
            error: 'Failed to send verification email',
            details: emailError.message || JSON.stringify(emailError),
          },
          500
        );
      }

      return jsonResponse({
        success: true,
        message: 'Verification code sent successfully',
        expiresAt: expiresAt.toISOString(),
      });
    }

    // Action: verify_code

    if (action === 'verify_code') {
      if (!email || typeof email !== 'string') {
        return jsonResponse({ error: 'Missing or invalid email parameter' }, 400);
      }

      if (!code || typeof code !== 'string') {
        return jsonResponse({ error: 'Missing or invalid code parameter' }, 400);
      }

      // Find matching code for user

      const { data: verificationCode, error: codeError } = await supabase
        .from('verification_codes')
        .select('*')
        .eq('user_id', userId)
        .eq('email', email.toLowerCase().trim())
        .eq('code', code.trim())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (codeError) {
        console.error('[verify-email] Error fetching code:', codeError);
        return jsonResponse({ error: 'Failed to verify code' }, 500);
      }

      if (!verificationCode) {
        return jsonResponse({ error: 'Invalid verification code' }, 400);
      }

      // Check if code is expired

      const expiresAt = new Date(verificationCode.expires_at);
      const now = new Date();

      if (now > expiresAt) {
        // Delete expired code

        await supabase.from('verification_codes').delete().eq('id', verificationCode.id);

        return jsonResponse({ error: 'Verification code has expired' }, 400);
      }

      // Update profile with verified email

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          email_verified: true,
          email_verified_at: new Date().toISOString(),
          verified_email: email.toLowerCase().trim(),
        })
        .eq('id', userId);

      if (updateError) {
        console.error('[verify-email] Error updating profile:', updateError);
        return jsonResponse({ error: 'Failed to update profile' }, 500);
      }

      // Delete used code

      await supabase.from('verification_codes').delete().eq('id', verificationCode.id);

      return jsonResponse({
        success: true,
        message: 'Email verified successfully',
        verified: true,
      });
    }

    return jsonResponse({ error: 'Invalid action' }, 400);
  } catch (error: any) {
    console.error('[verify-email] Error:', error);
    return jsonResponse(
      {
        error: error.message || 'Internal server error',
      },
      500
    );
  }
});



