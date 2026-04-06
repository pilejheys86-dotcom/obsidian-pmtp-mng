/**
 * Global test setup — sets dummy env vars before any module loads.
 */
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.IMAGEKIT_PUBLIC_KEY = 'test-public-key';
process.env.IMAGEKIT_PRIVATE_KEY = 'test-private-key';
process.env.VITE_IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/test';
process.env.PORT = '0'; // random port for tests
