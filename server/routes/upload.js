const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY || '';

// GET /api/upload/imagekit-auth — Returns auth params for client-side ImageKit upload
router.get('/imagekit-auth', (req, res) => {
  if (!PRIVATE_KEY) {
    return res.status(500).json({ error: 'ImageKit private key not configured' });
  }

  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 2400; // 40 min validity
  const signature = crypto
    .createHmac('sha1', PRIVATE_KEY)
    .update(token + expire)
    .digest('hex');

  res.json({ token, expire, signature });
});

module.exports = router;
