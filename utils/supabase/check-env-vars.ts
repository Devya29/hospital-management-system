// This check can be removed
// it is just for tutorial purposes

export const hasEnvVars =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
