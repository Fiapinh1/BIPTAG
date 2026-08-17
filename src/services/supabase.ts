import { createClient } from '@supabase/supabase-js';

const fallbackUrl = 'https://zxuhhkqfkzxbpnykaawq.supabase.co';
const fallbackAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dWhoa3Fma3p4YnBueWthYXdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0OTM5MTgsImV4cCI6MjEwMjA2OTkxOH0.U1VUhQKkG_fFGQkGYWI7nrFNmYB5JxpS05Dy2gbsZWk';

export const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || fallbackUrl;
export const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || fallbackAnonKey;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const isUsingBundledSupabaseConfig = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
