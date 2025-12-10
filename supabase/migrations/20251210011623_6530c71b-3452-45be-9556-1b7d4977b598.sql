-- Fix Critical Security Issues: Add missing DELETE policies for GDPR compliance

-- 1. Add DELETE policy to profiles table - allows users to delete their own data
CREATE POLICY "Users can delete their own profile"
ON profiles FOR DELETE
USING (auth.uid() = id);

-- 2. Add DELETE policy to github_accounts table - allows users to disconnect GitHub
-- Note: This policy already exists according to the schema, but confirming it's in place
-- The schema shows: "Users can delete own github_accounts" policy exists
-- If this fails due to duplicate, that's expected and safe