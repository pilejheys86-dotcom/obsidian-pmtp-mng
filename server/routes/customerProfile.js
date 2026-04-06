const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const ImageKit = require('imagekit');

const imagekit = new ImageKit({
  publicKey: process.env.VITE_IMAGEKIT_PUBLIC_KEY || process.env.IMAGEKIT_PUBLIC_KEY || '',
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
  urlEndpoint: process.env.VITE_IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/santua',
});

router.get('/', async (req, res) => {
  const { data: profile, error } = await supabaseAdmin.from('customers')
    .select('id, tenant_id, first_name, last_name, date_of_birth, nationality, present_address, province, city_municipality, barangay, zip_code, mobile_number, email, risk_rating, avatar_url, created_at')
    .eq('id', req.customerId).eq('tenant_id', req.activeTenantId).is('deleted_at', null).single();
  if (error || !profile) return res.status(404).json({ error: 'Profile not found' });
  res.json({ profile });
});

router.patch('/', async (req, res) => {
  const { presentAddress, mobileNumber, email } = req.body;
  const updates = {};
  if (presentAddress !== undefined) updates.present_address = presentAddress;
  if (mobileNumber !== undefined) updates.mobile_number = mobileNumber;
  if (email !== undefined) updates.email = email;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });
  updates.updated_at = new Date().toISOString();

  const { data: profile, error } = await supabaseAdmin.from('customers')
    .update(updates).eq('id', req.customerId).eq('tenant_id', req.activeTenantId).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ profile });
});

router.post('/avatar', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64) is required' });

    const result = await imagekit.upload({
      file: image,
      fileName: `customer-${req.customerId}-avatar`,
      folder: '/obsidian/customers/avatars/',
      useUniqueFileName: true,
    });

    const { data: profile, error } = await supabaseAdmin.from('customers')
      .update({ avatar_url: result.url, updated_at: new Date().toISOString() })
      .eq('id', req.customerId)
      .eq('tenant_id', req.activeTenantId)
      .select('id, avatar_url')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ avatar_url: profile.avatar_url });
  } catch (err) {
    console.error('[AVATAR UPLOAD]', err.message);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

router.post('/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

  const { data: authUser } = await supabaseAdmin.auth.getUser(req.headers.authorization.split(' ')[1]);
  const { error: verifyErr } = await supabaseAdmin.auth.signInWithPassword({ email: authUser?.user?.email, password: currentPassword });
  if (verifyErr) return res.status(401).json({ error: 'Current password is incorrect' });

  const { error } = await supabaseAdmin.auth.admin.updateUserById(req.userId, { password: newPassword });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Password updated successfully' });
});

module.exports = router;
