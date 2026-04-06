const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), override: false });

const cleanEnv = (value) => String(value || '').trim().replace(/^['"]|['"]$/g, '');

const supabaseUrl = cleanEnv(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
const supabaseAnonKey = cleanEnv(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);
const supabaseServiceKey = cleanEnv(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);

if (!supabaseUrl || !/^https?:\/\//.test(supabaseUrl)) {
  throw new Error('Missing or invalid Supabase URL. Set SUPABASE_URL or VITE_SUPABASE_URL in .env.');
}

if (!supabaseAnonKey) {
  throw new Error('Missing Supabase anon key. Set SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY in .env.');
}

if (!process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[db] SUPABASE_SERVICE_KEY not set — falling back to anon key; admin operations WILL fail due to RLS.');
} else {
  console.log('[db] Service role key loaded. Admin client will bypass RLS.');
}

// Service-role client for backend (bypasses RLS when needed)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Anon client (respects RLS — use when acting on behalf of a user)
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = { supabaseAdmin, supabaseAnon };
