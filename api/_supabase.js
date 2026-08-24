/**
 * Headers for server-side Supabase Data/Auth API calls.
 *
 * New `sb_secret_...` keys are opaque API keys, not JWTs. Sending one as a
 * bearer token makes Supabase reject the request as an invalid JWT. Legacy
 * service-role JWTs still need the bearer header while environments migrate.
 */
export function supabaseServiceHeaders(key = process.env.SUPABASE_SERVICE_KEY) {
  if (!key) throw new Error("Missing Supabase service configuration");
  return {
    apikey: key,
    ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
  };
}
