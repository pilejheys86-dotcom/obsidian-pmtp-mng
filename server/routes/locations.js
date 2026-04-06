const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Load PH locations data once at startup
const locationsPath = path.join(__dirname, '..', 'data', 'ph_locations.json');
let phLocations = {};

try {
  phLocations = JSON.parse(fs.readFileSync(locationsPath, 'utf-8'));
} catch (err) {
  console.error('[locations] Failed to load ph_locations.json:', err.message);
}

// Cache PSGC city list (loaded once, reused for all barangay lookups)
let psgcCitiesCache = null;
let psgcCacheTime = 0;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

const getPsgcCities = async () => {
  if (psgcCitiesCache && Date.now() - psgcCacheTime < CACHE_TTL) {
    return psgcCitiesCache;
  }
  const res = await fetch('https://psgc.gitlab.io/api/cities-municipalities/');
  if (!res.ok) throw new Error('PSGC API unavailable');
  psgcCitiesCache = await res.json();
  psgcCacheTime = Date.now();
  console.log(`[locations] PSGC cities cached: ${psgcCitiesCache.length} entries`);
  return psgcCitiesCache;
};

// GET /api/locations/provinces — List all province names
router.get('/provinces', (_req, res) => {
  const provinces = Object.keys(phLocations).sort();
  res.json(provinces);
});

// GET /api/locations/cities/:province — List cities for a province (with zip)
router.get('/cities/:province', (req, res) => {
  const province = decodeURIComponent(req.params.province).toUpperCase();
  const cities = phLocations[province];

  if (!cities) {
    return res.status(404).json({ error: 'Province not found' });
  }

  res.json(cities);
});

// GET /api/locations/barangays/:province/:city — List barangays via PSGC API
router.get('/barangays/:province/:city', async (req, res) => {
  const cityName = decodeURIComponent(req.params.city).toUpperCase();

  try {
    const allCities = await getPsgcCities();

    // Match city by name (fuzzy — handles parenthetical alternates like "BALAGTAS (BIGAA)")
    const matched = allCities.find((c) => {
      const name = c.name.toUpperCase();
      return name === cityName || name.startsWith(cityName) || cityName.startsWith(name);
    });

    if (!matched) {
      console.warn(`[locations] No PSGC match for city: ${cityName}`);
      return res.json([]);
    }

    const brgyRes = await fetch(`https://psgc.gitlab.io/api/cities-municipalities/${matched.code}/barangays/`);
    if (!brgyRes.ok) throw new Error('Failed to fetch barangays');

    const barangays = await brgyRes.json();
    res.json(barangays.map((b) => b.name).sort());
  } catch (err) {
    console.error('[locations] barangay fetch error:', err.message);
    res.json([]);
  }
});

module.exports = router;
