/**
 * One-time script to seed the Super Admin user.
 *
 * Usage:
 *   1. Make sure your .env file has SUPABASE_SERVICE_KEY and VITE_SUPABASE_URL
 *   2. Run: node server/seed-super-admin.js
 *   3. Delete this file after — it's not needed again
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SUPER_ADMIN_EMAIL = 'superadmin@obsidian-platform.tech';
const SUPER_ADMIN_PASSWORD = '12345678'; // ← Change this before production!
const SUPER_ADMIN_NAME = 'Matt Santua';

async function seedSuperAdmin() {
  console.log('Creating auth user...');

  // Step 1: Create the auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: SUPER_ADMIN_EMAIL,
    password: SUPER_ADMIN_PASSWORD,
    email_confirm: true,
  });

  if (authError) {
    console.error('Failed to create auth user:', authError.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log('Auth user created. UUID:', userId);

  // Step 2: Insert into super_admins table via RPC
  const { data, error } = await supabaseAdmin.rpc('seed_super_admin', {
    p_user_id: userId,
    p_email: SUPER_ADMIN_EMAIL,
    p_full_name: SUPER_ADMIN_NAME,
  });

  if (error) {
    console.error('Failed to seed super_admin:', error.message);
    process.exit(1);
  }

  console.log('');
  console.log('=== Super Admin Seeded Successfully ===');
  console.log('Email:    ', SUPER_ADMIN_EMAIL);
  console.log('Name:     ', SUPER_ADMIN_NAME);
  console.log('UUID:     ', userId);
  console.log('');
  console.log('You can now log in to the platform admin panel.');
  console.log('DELETE this file after use — it contains a password.');
}

seedSuperAdmin();
