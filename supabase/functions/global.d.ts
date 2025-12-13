// Deno global types for Supabase Edge Functions
declare namespace Deno {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

// Supabase Edge Function types
declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export function createClient(url: string, key: string, options?: any): any;
}
