const crypto = require('crypto');

const MAX_ENTRIES = 1000;
const cache = new Map();
const accessOrder = [];

const TTL_CONFIG = {
  '/api/dashboard': 30,
  '/api/customer/dashboard': 30,
  '/api/customer/loans': 15,
  '/api/customer/items': 15,
  '/api/pawn-tickets': 15,
  '/api/pawn-items': 15,
  '/api/customer/auctions': 60,
  '/api/auctions': 60,
  '/api/locations': 3600,
};

function getTTL(path) {
  for (const [prefix, ttl] of Object.entries(TTL_CONFIG)) {
    if (path.startsWith(prefix)) return ttl;
  }
  return 0;
}

function evictLRU() {
  while (cache.size >= MAX_ENTRIES && accessOrder.length > 0) {
    const oldest = accessOrder.shift();
    cache.delete(oldest);
  }
}

function buildCacheKey(req) {
  const tenantId = req.tenantId || req.activeTenantId || 'none';
  const userId = req.userId || 'anon';
  return `${tenantId}:${userId}:${req.method}:${req.originalUrl}`;
}

function invalidatePrefix(tenantId, resourcePath) {
  const prefix = `${tenantId || 'none'}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix) && key.includes(resourcePath)) {
      cache.delete(key);
    }
  }
}

function responseCache(req, res, next) {
  if (req.method !== 'GET') {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      const resourcePath = req.baseUrl || req.originalUrl.split('?')[0];
      invalidatePrefix(req.tenantId || req.activeTenantId, resourcePath);
    }
    return next();
  }

  const ttl = getTTL(req.originalUrl.split('?')[0]);
  if (ttl === 0) return next();

  const key = buildCacheKey(req);
  const entry = cache.get(key);

  if (entry && Date.now() < entry.expiresAt) {
    const clientEtag = req.headers['if-none-match'];
    if (clientEtag && clientEtag === entry.etag) {
      return res.status(304).end();
    }

    res.set('X-Cache', 'HIT');
    res.set('ETag', entry.etag);
    res.set('Content-Type', 'application/json');
    return res.send(entry.body);
  }

  const originalJson = res.json.bind(res);
  res.json = (data) => {
    const body = JSON.stringify(data);
    const etag = '"' + crypto.createHash('md5').update(body).digest('hex').slice(0, 16) + '"';

    evictLRU();
    cache.set(key, {
      body,
      etag,
      expiresAt: Date.now() + ttl * 1000,
    });
    accessOrder.push(key);

    res.set('X-Cache', 'MISS');
    res.set('ETag', etag);
    return originalJson(data);
  };

  next();
}

responseCache.invalidatePrefix = invalidatePrefix;
module.exports = responseCache;
