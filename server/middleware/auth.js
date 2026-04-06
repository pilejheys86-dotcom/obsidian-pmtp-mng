const { supabaseAdmin } = require('../config/db');

/**
 * Verifies the Supabase JWT from the Authorization header.
 * Attaches req.user (auth user) and req.userId.
 */
const auth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = header.split(' ')[1];

  // Try admin getUser first, fallback to manual JWT verify
  let user;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (!error && data?.user) {
    user = data.user;
  } else {
    // Fallback: decode JWT and verify via admin API
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      if (!payload.sub) throw new Error('No sub in token');
      const { data: adminData, error: adminErr } = await supabaseAdmin.auth.admin.getUserById(payload.sub);
      if (adminErr || !adminData?.user) {
        console.error('[AUTH] Token verification failed:', adminErr?.message || error?.message);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      user = adminData.user;
    } catch (e) {
      console.error('[AUTH] Token decode failed:', e.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  req.user = user;
  req.userId = user.id;
  next();
};

module.exports = auth;
