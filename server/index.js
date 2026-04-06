require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const responseCache = require('./middleware/cache');

// Middleware
const auth = require('./middleware/auth');
const tenantScope = require('./middleware/tenantScope');
const superAdminScope = require('./middleware/superAdminScope');
const showcaseHandler = require('./middleware/subdomainResolver');

// Routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const customerRoutes = require('./routes/customers');
const employeeRoutes = require('./routes/employees');
const pawnItemRoutes = require('./routes/pawnItems');
const pawnTicketRoutes = require('./routes/pawnTickets');
const transactionRoutes = require('./routes/transactions');
const auctionRoutes = require('./routes/auctions');
const noticeRoutes = require('./routes/notices');
const branchRoutes = require('./routes/branches');
const subscriptionRoutes = require('./routes/subscriptions');
const reportRoutes = require('./routes/reports');
const renewalRoutes = require('./routes/renewals');
const paymentRoutes = require('./routes/payments');
const dispositionRoutes = require('./routes/dispositions');
const loanSettingRoutes = require('./routes/loanSettings');
const pricingRoutes = require('./routes/pricing');
const appraisalRoutes = require('./routes/appraisals');
const cronRoutes = require('./routes/cron');
const tenantRoutes = require('./routes/tenants');
const brandingRoutes = require('./routes/branding');
const auditLogRoutes = require('./routes/auditLogs');
const exportRoutes = require('./routes/exports');

// Customer-facing routes
const customerAuthRoutes = require('./routes/customerAuth');
const customerDashboardRoutes = require('./routes/customerDashboard');
const customerLoanRoutes = require('./routes/customerLoans');
const customerItemRoutes = require('./routes/customerItems');
const customerPaymentRoutes = require('./routes/customerPayments');
const customerPaymentWebhook = require('./routes/customerPaymentWebhook');
const customerAuctionRoutes = require('./routes/customerAuctions');
const customerProfileRoutes = require('./routes/customerProfile');
const customerNotificationRoutes = require('./routes/customerNotifications');
const customerPushTokenRoutes = require('./routes/customerPushToken');
const customerScope = require('./middleware/customerScope');
const subscriptionWebhook = require('./routes/subscriptionWebhook');

const app = express();
const PORT = process.env.PORT || 5000;

// Global middleware
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression({ threshold: 1024 }));
const allowedOrigins = [
  process.env.CLIENT_URL,
  'https://www.obsidian-platform.tech',
  'https://obsidian-platform.tech',
  'https://obsidian-pmtp-mng.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id'],
}));
// PayMongo webhooks need raw body for signature verification — register BEFORE json parser
app.use('/api/customer/payments/webhook', express.raw({ type: 'application/json' }), customerPaymentWebhook);
app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }), subscriptionWebhook);

app.use(express.json({ limit: '10mb' }));

// Public showcase page (no auth needed)
app.get('/s/:slug', showcaseHandler);

// Root route
app.get('/', (_req, res) => res.json({ name: 'Obsidian PMTP API', status: 'running', docs: '/api/health' }));

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Public routes (no auth required)
app.use('/api/auth', authRoutes);
app.use('/api/locations', responseCache, require('./routes/locations'));

// Auth-only routes (no tenant scope needed)
app.use('/api/upload', auth, require('./routes/upload'));

// Super Admin routes (auth + superAdminScope, NO tenantScope)
app.use('/api/tenants', auth, superAdminScope, tenantRoutes);
app.use('/api/backup', auth, superAdminScope, require('./routes/backup'));

// Protected routes (auth + tenant scope + response cache)
app.use('/api/dashboard', auth, tenantScope, responseCache, dashboardRoutes);
app.use('/api/customers', auth, tenantScope, customerRoutes);
app.use('/api/employees', auth, tenantScope, employeeRoutes);
app.use('/api/pawn-items', auth, tenantScope, responseCache, pawnItemRoutes);
app.use('/api/pawn-tickets', auth, tenantScope, responseCache, pawnTicketRoutes);
app.use('/api/transactions', auth, tenantScope, transactionRoutes);
app.use('/api/auctions', auth, tenantScope, responseCache, auctionRoutes);
app.use('/api/notices', auth, tenantScope, noticeRoutes);
app.use('/api/branches', auth, tenantScope, branchRoutes);
app.use('/api/subscriptions', auth, tenantScope, subscriptionRoutes);
app.use('/api/reports', auth, tenantScope, reportRoutes);
app.use('/api/renewals', auth, tenantScope, renewalRoutes);
app.use('/api/payments', auth, tenantScope, paymentRoutes);
app.use('/api/dispositions', auth, tenantScope, dispositionRoutes);
app.use('/api/loan-settings', auth, tenantScope, loanSettingRoutes);
app.use('/api/pricing', auth, tenantScope, pricingRoutes);
app.use('/api/appraisals', auth, tenantScope, appraisalRoutes);
app.use('/api/cron', auth, tenantScope, cronRoutes);
app.use('/api/branding', auth, tenantScope, brandingRoutes);
app.use('/api/audit-logs', auth, tenantScope, auditLogRoutes);
app.use('/api/exports', exportRoutes);

// Access requests
const { handlePublicPost: arPublicPost, handlePublicTenantInfo: arTenantInfo, adminRouter: arAdminRouter } = require('./routes/accessRequests');
app.post('/api/access-requests', arPublicPost);                          // public, no auth
app.get('/api/access-requests/tenant/:tenantId', arTenantInfo);          // public, no auth
app.use('/api/access-requests/admin', auth, tenantScope, arAdminRouter); // auth required

// Customer public routes (no auth)
app.use('/api/customer-auth', customerAuthRoutes);

// Customer protected routes (auth + customerScope + response cache)
app.use('/api/customer/dashboard', auth, customerScope, responseCache, customerDashboardRoutes);
app.use('/api/customer/loans', auth, customerScope, responseCache, customerLoanRoutes);
app.use('/api/customer/items', auth, customerScope, responseCache, customerItemRoutes);
app.use('/api/customer/payments', auth, customerScope, customerPaymentRoutes);
app.use('/api/customer/auctions', auth, customerScope, responseCache, customerAuctionRoutes);
app.use('/api/customer/profile', auth, customerScope, customerProfileRoutes);
app.use('/api/customer/notifications', auth, customerScope, customerNotificationRoutes);
app.use('/api/customer/push-token', auth, customerScope, customerPushTokenRoutes);

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Only start listening when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🟢 Obsidian API running on http://localhost:${PORT} [build: ${new Date().toLocaleTimeString()}]`);
  });
}

module.exports = app;
