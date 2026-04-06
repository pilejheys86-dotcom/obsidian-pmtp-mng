/**
 * Seed Super Admin Script
 * Usage: node server/scripts/seed-superadmin.js <email> <password> <full_name>
 *
 * Creates an auth user and inserts them into the super_admins table.
 * Run this once to bootstrap your first super admin.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });
const { supabaseAdmin } = require('../config/db');

async function seedSuperAdmin() {
  const [,, email, password, ...nameParts] = process.argv;
  const fullName = nameParts.join(' ');

  if (!email || !password || !fullName) {
    console.error('Usage: node server/scripts/seed-superadmin.js <email> <password> <full_name>');
    console.error('Example: node server/scripts/seed-superadmin.js admin@obsidian.dev MyP@ss123 "Platform Admin"');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  console.log(`\nCreating super admin: ${fullName} (${email})\n`);

  // 1. Create auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Auto-confirm for super admin
    user_metadata: { full_name: fullName, role: 'superadmin' },
  });

  if (authError) {
    // If user already exists, try to find them
    if (authError.message.includes('already been registered')) {
      console.log('Auth user already exists. Looking up existing user...');
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const existing = users.find(u => u.email === email);
      if (existing) {
        console.log(`Found existing auth user: ${existing.id}`);
        await insertSuperAdmin(existing.id, email, fullName);
        return;
      }
    }
    console.error('Failed to create auth user:', authError.message);
    process.exit(1);
  }

  console.log(`Auth user created: ${authData.user.id}`);
  await insertSuperAdmin(authData.user.id, email, fullName);
}

async function insertSuperAdmin(userId, email, fullName) {
  // 2. Insert into super_admins table
  const { error: insertErr } = await supabaseAdmin
    .from('super_admins')
    .upsert({
      id: userId,
      email,
      full_name: fullName,
      is_active: true,
    }, { onConflict: 'id' });

  if (insertErr) {
    console.error('Failed to insert super admin:', insertErr.message);
    process.exit(1);
  }

  console.log(`\nSuper admin seeded successfully!`);
  console.log(`  Email:     ${email}`);
  console.log(`  Full Name: ${fullName}`);
  console.log(`  User ID:   ${userId}`);
  console.log(`\nYou can now log in at /login with these credentials.\n`);
}

seedSuperAdmin().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
