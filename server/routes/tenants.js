const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination, sanitizeSearch, buildSearchFilter, generateTempPassword } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
const {
  sendTenantBlockedEmail,
  sendTenantDeactivatedEmail,
  sendTenantApprovedEmail,
  sendTenantRejectedEmail,
  sendTenantReactivatedEmail,
  sendSuperAdminWelcomeEmail,
} = require('../services/email');

// ── Helper: log audit action ───────────────────────────────────────────────
const logAudit = async (adminId, action, targetType, targetId, details, ip) => {
  await supabaseAdmin.from('platform_audit_logs').insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
    ip_address: ip || null,
  });
};

// ── Helper: get tenant owner contact info ──────────────────────────────────
const getOwnerContact = async (tenantId) => {
  try {
    // 1. Try tenant_users (OWNER role) — the main user table
    const { data: tu, error: tuErr } = await supabaseAdmin
      .from('tenant_users')
      .select('full_name, email')
      .eq('tenant_id', tenantId)
      .eq('role', 'OWNER')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (!tuErr && tu && tu.email) {
      return { fullName: tu.full_name, email: tu.email };
    }

    // 3. Last resort: use tenant's contact_email
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('business_name, contact_email')
      .eq('id', tenantId)
      .single();

    if (tenant?.contact_email) {
      return { fullName: tenant.business_name, email: tenant.contact_email };
    }

    console.warn(`[EMAIL] No owner email found for tenant ${tenantId}`);
    return null;
  } catch (err) {
    console.error(`[EMAIL] getOwnerContact error for tenant ${tenantId}:`, err.message);
    return null;
  }
};

// ── GET /tenants/stats — Platform-wide statistics ──────────────────────────
router.get('/stats', async (req, res) => {
  try {
    // Total tenants
    const { count: total } = await supabaseAdmin
      .from('tenants')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null);

    // Active tenants
    const { count: active } = await supabaseAdmin
      .from('tenants')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ACTIVE')
      .is('deleted_at', null);

    // Blocked/suspended tenants
    const { count: blocked } = await supabaseAdmin
      .from('tenants')
      .select('*', { count: 'exact', head: true })
      .in('status', ['SUSPENDED', 'DEACTIVATED'])
      .is('deleted_at', null);

    // Subscriptions expiring within 7 days
    const now = new Date();
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: expiringSoon } = await supabaseAdmin
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .lte('end_date', sevenDaysOut)
      .gte('end_date', now.toISOString())
      .is('deleted_at', null);

    // Total revenue from all paid subscriptions
    const { data: subs } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_name, billing_cycle')
      .eq('payment_status', 'PAID')
      .is('deleted_at', null);

    const planPrices = { basic: 29, professional: 79, enterprise: 199 };
    const totalRevenue = (subs || []).reduce((sum, s) => {
      const price = planPrices[s.plan_name?.toLowerCase()] || 0;
      return sum + (s.billing_cycle === 'YEARLY' ? price * 12 : price);
    }, 0);

    // Active users (tenant_users — unified table)
    const { count: activeUsers } = await supabaseAdmin
      .from('tenant_users')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .is('deleted_at', null);

    const { count: inactiveUsers } = await supabaseAdmin
      .from('tenant_users')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', false)
      .is('deleted_at', null);

    res.json({ total: total || 0, active: active || 0, blocked: blocked || 0, expiringSoon: expiringSoon || 0, totalRevenue, activeUsers, inactiveUsers });
  } catch (err) {
    console.error('[TENANTS] Stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch platform stats' });
  }
});

// ── GET /tenants — List all tenants with pagination, search, filters ───────
router.get('/', asyncHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const { from, to } = getPagination(page, limit);
    const search = req.query.search || '';
    const status = req.query.status || '';
    const plan = req.query.plan || '';
    const sort = req.query.sort || 'newest';

    let query = supabaseAdmin
      .from('tenants')
      .select('*, subscriptions(*)', { count: 'exact' })
      .is('deleted_at', null);

    // Search by business name or email (ILIKE + full-text search)
    const searchFilter = buildSearchFilter(search, ['business_name', 'contact_email']);
    if (searchFilter) {
      query = query.or(searchFilter);
    }

    // Filter by status
    if (status === 'active') query = query.eq('status', 'ACTIVE');
    else if (status === 'blocked') query = query.in('status', ['SUSPENDED', 'DEACTIVATED']);
    else if (status === 'pending') query = query.eq('status', 'PENDING');
    else if (status === 'rejected') query = query.eq('status', 'REJECTED');
    else if (status === 'trial') query = query.eq('status', 'ACTIVE'); // trial handled at subscription level

    // Sort
    if (sort === 'oldest') query = query.order('created_at', { ascending: true });
    else query = query.order('created_at', { ascending: false });

    query = query.range(from, to);

    const { data: tenants, error, count } = await query;

    if (error) {
      console.error('[TENANTS] List error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch tenants' });
    }

    const { data: enriched, error: enrichError } = await supabaseAdmin.rpc('get_tenant_list_enriched', {
      p_limit: limit,
      p_offset: from,
    });
    if (enrichError) return res.status(400).json({ error: enrichError.message });

    res.json({
      data: enriched.data || [],
      pagination: { page, limit, total: enriched.total || 0 },
    });
  } catch (err) {
    console.error('[TENANTS] List error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
}));

// ── GET /tenants/analytics — Analytics data by type ───────────────────────
router.get('/analytics', async (req, res) => {
  try {
    const { type, period = 'monthly' } = req.query;
    const validTypes = ['user_growth', 'tenant_activity', 'revenue_trend', 'daily_activity'];

    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid analytics type. Valid: ${validTypes.join(', ')}` });
    }

    if (type === 'daily_activity') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();

      // Today's new registrations (tenant_owners created today)
      const { count: newTenantsToday } = await supabaseAdmin
        .from('tenants')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayISO)
        .is('deleted_at', null);

      // Today's transactions across all tenants
      const { count: transactionsToday } = await supabaseAdmin
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayISO)
        .is('deleted_at', null);

      // Today's new pawn tickets
      const { count: newLoansToday } = await supabaseAdmin
        .from('pawn_tickets')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayISO)
        .is('deleted_at', null);

      // Today's audit log entries (proxy for admin logins/actions)
      const { count: adminActionsToday } = await supabaseAdmin
        .from('platform_audit_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayISO);

      // This month's stats
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthISO = monthStart.toISOString();

      const { count: newTenantsMonth } = await supabaseAdmin
        .from('tenants')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', monthISO)
        .is('deleted_at', null);

      const { count: transactionsMonth } = await supabaseAdmin
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', monthISO)
        .is('deleted_at', null);

      const { count: newLoansMonth } = await supabaseAdmin
        .from('pawn_tickets')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', monthISO)
        .is('deleted_at', null);

      const { count: adminActionsMonth } = await supabaseAdmin
        .from('platform_audit_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', monthISO);

      return res.json({
        today: {
          new_tenants: newTenantsToday || 0,
          transactions: transactionsToday || 0,
          new_loans: newLoansToday || 0,
          admin_actions: adminActionsToday || 0,
        },
        this_month: {
          new_tenants: newTenantsMonth || 0,
          transactions: transactionsMonth || 0,
          new_loans: newLoansMonth || 0,
          admin_actions: adminActionsMonth || 0,
        },
      });
    }

    // Shared: parse from/to date filters + determine granularity
    const { from: fromDate, to: toDate } = req.query;
    const fromISO = fromDate || null;
    const toISO = toDate ? `${toDate}T23:59:59.999Z` : null;

    // Use daily granularity for ranges ≤31 days, monthly otherwise
    const startForGranularity = fromISO ? new Date(fromISO) : new Date(new Date().setMonth(new Date().getMonth() - 12));
    const endForGranularity = toISO ? new Date(toISO) : new Date();
    const daySpan = Math.ceil((endForGranularity - startForGranularity) / (1000 * 60 * 60 * 24));
    const useDaily = daySpan <= 31;

    const bucketKey = (dateStr) => useDaily ? dateStr.slice(0, 10) : dateStr.slice(0, 7);

    const generateKeys = (start, end) => {
      const keys = [];
      if (useDaily) {
        const cursor = new Date(start);
        cursor.setHours(0, 0, 0, 0);
        const endD = new Date(end);
        endD.setHours(23, 59, 59, 999);
        while (cursor <= endD) {
          keys.push(cursor.toISOString().slice(0, 10));
          cursor.setDate(cursor.getDate() + 1);
        }
      } else {
        const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
        while (cursor <= end) {
          keys.push(cursor.toISOString().slice(0, 7));
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }
      return keys;
    };

    // Format label for frontend display
    const formatLabel = (key) => {
      if (useDaily) {
        const d = new Date(key + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      return key; // 'YYYY-MM'
    };

    if (type === 'user_growth') {
      const isDaily = period === 'daily';
      const lookback = new Date();
      if (isDaily) {
        lookback.setDate(lookback.getDate() - 30);
      } else {
        lookback.setMonth(lookback.getMonth() - 12);
      }

      const [{ data: owners }, { data: employees }] = await Promise.all([
        supabaseAdmin.from('tenant_owners').select('created_at').gte('created_at', lookback.toISOString()).is('deleted_at', null),
        supabaseAdmin.from('employees').select('created_at').gte('created_at', lookback.toISOString()).is('deleted_at', null),
      ]);

      const allUsers = [...(owners || []), ...(employees || [])];
      const dateMap = {};
      allUsers.forEach(u => {
        const key = isDaily ? u.created_at.slice(0, 10) : u.created_at.slice(0, 7);
        dateMap[key] = (dateMap[key] || 0) + 1;
      });

      const data = [];
      if (isDaily) {
        for (let i = 29; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          data.push({ month: key, count: dateMap[key] || 0 });
        }
      } else {
        for (let i = 11; i >= 0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          const key = d.toISOString().slice(0, 7);
          data.push({ month: key, count: dateMap[key] || 0 });
        }
      }

      return res.json({ data });
    }

    if (type === 'tenant_activity') {
      const { data: tenants } = await supabaseAdmin
        .from('tenants')
        .select('id, business_name')
        .eq('status', 'ACTIVE')
        .is('deleted_at', null);

      const results = await Promise.all((tenants || []).map(async (t) => {
        let q = supabaseAdmin
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', t.id)
          .is('deleted_at', null);
        if (fromISO) q = q.gte('created_at', fromISO);
        if (toISO) q = q.lte('created_at', toISO);
        const { count } = await q;
        return { tenant_name: t.business_name, transaction_count: count || 0 };
      }));

      results.sort((a, b) => b.transaction_count - a.transaction_count);
      return res.json({ data: results.slice(0, 10) });
    }

    if (type === 'revenue_trend') {
      const isDaily = period === 'daily';
      const lookback = new Date();
      if (isDaily) {
        lookback.setDate(lookback.getDate() - 30);
      } else {
        lookback.setMonth(lookback.getMonth() - 12);
      }

      const { data: subs } = await supabaseAdmin
        .from('subscriptions')
        .select('plan_name, billing_cycle, created_at')
        .eq('payment_status', 'PAID')
        .gte('created_at', lookback.toISOString())
        .is('deleted_at', null);

      const planPrices = { basic: 29, professional: 79, enterprise: 199 };
      const dateMap = {};
      (subs || []).forEach(s => {
        const key = isDaily ? s.created_at.slice(0, 10) : s.created_at.slice(0, 7);
        const monthly = planPrices[s.plan_name?.toLowerCase()] || 0;
        dateMap[key] = (dateMap[key] || 0) + monthly;
      });

      const data = [];
      if (isDaily) {
        for (let i = 29; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          data.push({ month: key, revenue: dateMap[key] || 0 });
        }
      } else {
        for (let i = 11; i >= 0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          const key = d.toISOString().slice(0, 7);
          data.push({ month: key, revenue: dateMap[key] || 0 });
        }
      }

      return res.json({ data });
    }
  } catch (err) {
    console.error('[TENANTS] Analytics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// ── GET /tenants/list — Lightweight tenant list for dropdowns ──────────────
router.get('/list', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id, business_name')
      .is('deleted_at', null)
      .order('business_name', { ascending: true });

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('[TENANTS] List (light) error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tenant list' });
  }
});

// ── GET /tenants/admins — List all super admins with pagination & search ────
router.get('/admins', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const { from, to } = getPagination(page, limit);
    const search = req.query.search || '';
    const status = req.query.status || '';

    let query = supabaseAdmin
      .from('super_admins')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    const searchFilter = buildSearchFilter(search, ['full_name', 'email']);
    if (searchFilter) query = query.or(searchFilter);

    if (status === 'active') query = query.eq('is_active', true);
    else if (status === 'inactive') query = query.eq('is_active', false);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data: data || [], total: count || 0 });
  } catch (err) {
    console.error('[ADMINS] List error:', err.message);
    res.status(500).json({ error: 'Failed to fetch admin list' });
  }
});

// ── POST /tenants/admins — Create a new super admin ───────────────────────
router.post('/admins', async (req, res) => {
  try {
    const { email, full_name } = req.body;
    if (!email || !full_name) {
      return res.status(400).json({ error: 'Email and full name are required.' });
    }

    // Check if email is already a super admin
    const { data: existing } = await supabaseAdmin
      .from('super_admins')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'A super admin with this email already exists.' });
    }

    // Generate temp password
    const tempPassword = generateTempPassword();

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name, role: 'superadmin' },
    });

    if (authError) {
      // If auth user already exists (e.g. was a tenant user), link them
      if (authError.message.includes('already been registered')) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const existingAuth = users.find(u => u.email === email);
        if (!existingAuth) {
          return res.status(500).json({ error: 'Auth user exists but could not be found.' });
        }

        // Reset their password to the temp one
        await supabaseAdmin.auth.admin.updateUserById(existingAuth.id, { password: tempPassword });

        // Insert super admin record
        const { error: insertErr } = await supabaseAdmin
          .from('super_admins')
          .insert({ id: existingAuth.id, email, full_name, is_active: true });

        if (insertErr) throw insertErr;

        // Audit log
        await logAudit(req.adminProfile.id, 'CREATE_ADMIN', 'SUPER_ADMIN', existingAuth.id,
          { email, full_name, linked_existing_auth: true }, req.ip);

        // Send welcome email
        const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/login`;
        await sendSuperAdminWelcomeEmail({ to: email, fullName: full_name, email, tempPassword, loginUrl }).catch(
          err => console.error('[ADMINS] Welcome email failed:', err.message)
        );

        return res.status(201).json({ message: 'Super admin created successfully.', id: existingAuth.id });
      }
      throw authError;
    }

    // Insert super admin record
    const { error: insertErr } = await supabaseAdmin
      .from('super_admins')
      .insert({ id: authData.user.id, email, full_name, is_active: true });

    if (insertErr) throw insertErr;

    // Audit log
    await logAudit(req.adminProfile.id, 'CREATE_ADMIN', 'SUPER_ADMIN', authData.user.id,
      { email, full_name }, req.ip);

    // Send welcome email with credentials
    const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/login`;
    await sendSuperAdminWelcomeEmail({ to: email, fullName: full_name, email, tempPassword, loginUrl }).catch(
      err => console.error('[ADMINS] Welcome email failed:', err.message)
    );

    res.status(201).json({ message: 'Super admin created successfully.', id: authData.user.id });
  } catch (err) {
    console.error('[ADMINS] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create super admin.' });
  }
});

// ── PATCH /tenants/admins/:id/toggle — Activate/deactivate a super admin ──
router.patch('/admins/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deactivation
    if (id === req.adminProfile.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    }

    // Get current state
    const { data: admin, error: fetchErr } = await supabaseAdmin
      .from('super_admins')
      .select('id, email, full_name, is_active')
      .eq('id', id)
      .single();

    if (fetchErr || !admin) {
      return res.status(404).json({ error: 'Admin not found.' });
    }

    const newStatus = !admin.is_active;

    const { error: updateErr } = await supabaseAdmin
      .from('super_admins')
      .update({ is_active: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateErr) throw updateErr;

    await logAudit(req.adminProfile.id, newStatus ? 'REACTIVATE_ADMIN' : 'DEACTIVATE_ADMIN',
      'SUPER_ADMIN', id, { email: admin.email, full_name: admin.full_name }, req.ip);

    res.json({ message: `Admin ${newStatus ? 'activated' : 'deactivated'} successfully.`, is_active: newStatus });
  } catch (err) {
    console.error('[ADMINS] Toggle error:', err.message);
    res.status(500).json({ error: 'Failed to update admin status.' });
  }
});

// ── GET /tenants/reports — Generate platform reports ──────────────────────
router.get('/reports', async (req, res) => {
  try {
    const { type, from: fromDate, to: toDate, tenant_id } = req.query;
    const validTypes = ['activity', 'registrations', 'usage'];

    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid report type. Valid: ${validTypes.join(', ')}` });
    }

    if (type === 'activity') {
      let tenantQuery = supabaseAdmin.from('tenants').select('id, business_name').is('deleted_at', null);
      if (tenant_id) tenantQuery = tenantQuery.eq('id', tenant_id);
      const { data: tenants } = await tenantQuery;

      const data = await Promise.all((tenants || []).map(async (t) => {
        const [txRes, loanRes, custRes] = await Promise.all([
          supabaseAdmin.from('transactions').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id).is('deleted_at', null),
          supabaseAdmin.from('pawn_tickets').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id).eq('status', 'ACTIVE').is('deleted_at', null),
          supabaseAdmin.from('customers').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id).is('deleted_at', null),
        ]);
        return {
          tenant_name: t.business_name,
          total_transactions: txRes.count || 0,
          active_loans: loanRes.count || 0,
          customers: custRes.count || 0,
        };
      }));

      return res.json({ data });
    }

    if (type === 'registrations') {
      const [{ data: owners }, { data: emps }] = await Promise.all([
        supabaseAdmin.from('tenant_owners').select('created_at').is('deleted_at', null),
        supabaseAdmin.from('employees').select('created_at').is('deleted_at', null),
      ]);

      const allUsers = [...(owners || []), ...(emps || [])];
      const monthMap = {};
      allUsers.forEach(u => {
        const month = u.created_at.slice(0, 7);
        if (fromDate && month < fromDate.slice(0, 7)) return;
        if (toDate && month > toDate.slice(0, 7)) return;
        monthMap[month] = (monthMap[month] || 0) + 1;
      });

      const months = Object.keys(monthMap).sort();
      let cumulative = 0;
      const data = months.map(m => {
        cumulative += monthMap[m];
        return { month: m, new_users: monthMap[m], cumulative };
      });

      return res.json({ data });
    }

    if (type === 'usage') {
      const { data: tenants } = await supabaseAdmin.from('tenants').select('id').eq('status', 'ACTIVE').is('deleted_at', null);
      const tenantCount = (tenants || []).length || 1;

      const [loanRes, custRes] = await Promise.all([
        supabaseAdmin.from('pawn_tickets').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').is('deleted_at', null),
        supabaseAdmin.from('customers').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      ]);

      const results = await Promise.all((tenants || []).map(async (t) => {
        const { count } = await supabaseAdmin.from('transactions').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id).is('deleted_at', null);
        return { id: t.id, count: count || 0 };
      }));
      results.sort((a, b) => b.count - a.count);

      let mostActiveName = '—';
      if (results[0]) {
        const { data: t } = await supabaseAdmin.from('tenants').select('business_name').eq('id', results[0].id).single();
        mostActiveName = t?.business_name || '—';
      }

      return res.json({
        avg_loans_per_tenant: Math.round((loanRes.count || 0) / tenantCount),
        avg_customers_per_tenant: Math.round((custRes.count || 0) / tenantCount),
        most_active_tenant: { name: mostActiveName, transaction_count: results[0]?.count || 0 },
      });
    }
  } catch (err) {
    console.error('[TENANTS] Reports error:', err.message);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ── GET /tenants/sales — Sales and revenue overview ───────────────────────
router.get('/sales', async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;

    // Calculate date boundary based on period
    const now = new Date();
    let dateFrom = null;
    if (period === 'daily') {
      dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - 1);
    } else if (period === 'weekly') {
      dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - 7);
    } else {
      dateFrom = new Date(now);
      dateFrom.setMonth(dateFrom.getMonth() - 1);
    }

    let subsQuery = supabaseAdmin
      .from('subscriptions')
      .select('plan_name, billing_cycle, tenant_id')
      .eq('payment_status', 'PAID')
      .is('deleted_at', null);

    if (dateFrom) {
      subsQuery = subsQuery.gte('created_at', dateFrom.toISOString());
    }

    const { data: subs } = await subsQuery;

    const planPrices = { basic: 29, professional: 79, enterprise: 199 };
    const totalPlatformRevenue = (subs || []).reduce((sum, s) => {
      return sum + (planPrices[s.plan_name?.toLowerCase()] || 0);
    }, 0);

    let txQuery = supabaseAdmin
      .from('transactions')
      .select('principal_paid, interest_paid, penalty_paid, tenant_id, created_at, trans_type')
      .is('deleted_at', null);

    if (dateFrom) {
      txQuery = txQuery.gte('created_at', dateFrom.toISOString());
    }

    const { data: allTx } = await txQuery;

    const totalTxVolume = (allTx || []).reduce((sum, t) =>
      sum + Number(t.principal_paid || 0) + Number(t.interest_paid || 0) + Number(t.penalty_paid || 0), 0);

    const activeTenantCount = new Set((subs || []).map(s => s.tenant_id)).size || 1;

    const tenantVolumes = {};
    (allTx || []).forEach(t => {
      tenantVolumes[t.tenant_id] = (tenantVolumes[t.tenant_id] || 0) +
        Number(t.principal_paid || 0) + Number(t.interest_paid || 0) + Number(t.penalty_paid || 0);
    });

    const tenantTxCounts = {};
    (allTx || []).forEach(t => {
      tenantTxCounts[t.tenant_id] = (tenantTxCounts[t.tenant_id] || 0) + 1;
    });

    const tenantIds = Object.keys(tenantVolumes);
    const { data: tenantNames } = await supabaseAdmin
      .from('tenants')
      .select('id, business_name')
      .in('id', tenantIds.length > 0 ? tenantIds : ['00000000-0000-0000-0000-000000000000']);

    const tenantNameMap = {};
    (tenantNames || []).forEach(t => { tenantNameMap[t.id] = t.business_name; });

    const subPlanMap = {};
    (subs || []).forEach(s => { subPlanMap[s.tenant_id] = s.plan_name; });

    const topTenants = tenantIds
      .map(id => ({
        tenant_name: tenantNameMap[id] || 'Unknown',
        plan: subPlanMap[id] || 'basic',
        transaction_count: tenantTxCounts[id] || 0,
        transaction_volume: tenantVolumes[id] || 0,
        subscription_amount: planPrices[(subPlanMap[id] || 'basic').toLowerCase()] || 0,
      }))
      .sort((a, b) => b.transaction_volume - a.transaction_volume)
      .slice(0, 10);

    const topTenantName = topTenants[0]?.tenant_name || '—';

    // Recent transactions summary (last 20)
    const { data: recentTx } = await supabaseAdmin
      .from('transactions')
      .select('id, trans_type, principal_paid, interest_paid, penalty_paid, tenant_id, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20);

    const recentTransactions = (recentTx || []).map(t => ({
      id: t.id,
      type: t.trans_type,
      amount: Number(t.principal_paid || 0) + Number(t.interest_paid || 0) + Number(t.penalty_paid || 0),
      tenant_name: tenantNameMap[t.tenant_id] || 'Unknown',
      date: t.created_at,
    }));

    res.json({
      kpis: {
        total_platform_revenue: totalPlatformRevenue,
        total_transaction_volume: totalTxVolume,
        avg_revenue_per_tenant: Math.round(totalPlatformRevenue / activeTenantCount),
        top_performing_tenant: topTenantName,
      },
      top_tenants: topTenants,
      recent_transactions: recentTransactions,
    });
  } catch (err) {
    console.error('[TENANTS] Sales error:', err.message);
    res.status(500).json({ error: 'Failed to fetch sales data' });
  }
});

// ── GET /tenants/audit-logs — Platform audit trail with filters ────────────
router.get('/audit-logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { from, to } = getPagination(page, limit);
    const { from: fromDate, to: toDate, admin_id, action } = req.query;

    let query = supabaseAdmin
      .from('platform_audit_logs')
      .select('*, super_admins(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', `${toDate}T23:59:59.999Z`);
    if (admin_id) query = query.eq('admin_id', admin_id);
    if (action) query = query.eq('action', action);

    query = query.range(from, to);

    const { data: logs, error, count } = await query;

    if (error) {
      console.error('[AUDIT] Logs error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch audit logs' });
    }

    res.json({ data: logs || [], total: count || 0, page, limit });
  } catch (err) {
    console.error('[AUDIT] Logs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// ── GET /tenants/platform-settings — Fetch platform settings ──────────────
router.get('/platform-settings', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('platform_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    res.json(data || {
      system_title: 'Obsidian',
      logo_url: null,
      max_tenants: 100,
      max_users_per_tenant: 50,
    });
  } catch (err) {
    console.error('[SETTINGS] Get error:', err.message);
    res.status(500).json({ error: 'Failed to fetch platform settings' });
  }
});

// ── PUT /tenants/platform-settings — Update platform settings ─────────────
router.put('/platform-settings', async (req, res) => {
  try {
    const { system_title, logo_url, max_tenants, max_users_per_tenant } = req.body;

    const { data: existing } = await supabaseAdmin
      .from('platform_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    const payload = {
      system_title: system_title || 'Obsidian',
      logo_url: logo_url || null,
      max_tenants: max_tenants || 100,
      max_users_per_tenant: max_users_per_tenant || 50,
      updated_at: new Date().toISOString(),
      updated_by: req.adminProfile.id,
    };

    let error;
    if (existing) {
      ({ error } = await supabaseAdmin.from('platform_settings').update(payload).eq('id', existing.id));
    } else {
      ({ error } = await supabaseAdmin.from('platform_settings').insert(payload));
    }

    if (error) throw error;

    await logAudit(req.adminProfile.id, 'SETTINGS_UPDATED', 'PLATFORM_SETTINGS', existing?.id || 'new', payload, req.ip);

    res.json({ message: 'Platform settings updated.' });
  } catch (err) {
    console.error('[SETTINGS] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update platform settings' });
  }
});

// ── GET /tenants/:id — Single tenant details ───────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('*, subscriptions(*), tenant_branding(subdomain, is_published)')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error || !tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Owner info
    const { data: owner } = await supabaseAdmin
      .from('tenant_owners')
      .select('full_name, id')
      .eq('tenant_id', id)
      .is('deleted_at', null)
      .limit(1)
      .single();

    // Counts
    const [branchRes, customerRes, employeeRes, loanRes] = await Promise.all([
      supabaseAdmin.from('branches').select('*', { count: 'exact', head: true }).eq('tenant_id', id).is('deleted_at', null),
      supabaseAdmin.from('customers').select('*', { count: 'exact', head: true }).eq('tenant_id', id).is('deleted_at', null),
      supabaseAdmin.from('employees').select('*', { count: 'exact', head: true }).eq('tenant_id', id).is('deleted_at', null),
      supabaseAdmin.from('pawn_tickets').select('*', { count: 'exact', head: true }).eq('tenant_id', id).eq('status', 'ACTIVE').is('deleted_at', null),
    ]);

    const sub = Array.isArray(tenant.subscriptions)
      ? tenant.subscriptions.filter(s => !s.deleted_at).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
      : tenant.subscriptions;

    let frontendStatus = 'active';
    if (tenant.status === 'SUSPENDED' || tenant.status === 'DEACTIVATED') frontendStatus = 'blocked';
    if (tenant.status === 'PENDING') frontendStatus = 'pending';
    if (tenant.status === 'REJECTED') frontendStatus = 'rejected';
    if (sub?.payment_status === 'OVERDUE') frontendStatus = 'expired';

    res.json({
      id: tenant.id,
      business_name: tenant.business_name,
      bsp_registration_no: tenant.bsp_registration_no,
      tin_number: tenant.tin_number,
      email: tenant.contact_email,
      status: frontendStatus,
      blocked_reason: tenant.blocked_reason || null,
      owner_name: owner?.full_name || null,
      branches_count: branchRes.count || 0,
      customers_count: customerRes.count || 0,
      employees_count: employeeRes.count || 0,
      active_loans: loanRes.count || 0,
      plan: sub?.plan_name || 'basic',
      subscription: sub ? {
        id: sub.id,
        plan: sub.plan_name,
        billing_cycle: sub.billing_cycle,
        amount: planPrice(sub.plan_name, sub.billing_cycle),
        payment_status: sub.payment_status,
        start_date: sub.start_date,
        end_date: sub.end_date,
        next_due_date: sub.end_date,
        last_payment_date: sub.payment_status === 'PAID' ? sub.updated_at : null,
      } : null,
      tenant_branding: tenant.tenant_branding || null,
      created_at: tenant.created_at,
    });
  } catch (err) {
    console.error('[TENANTS] Detail error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tenant details' });
  }
});

// ── POST /tenants/:id/block — Suspend a tenant ────────────────────────────
router.post('/:id/block', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A reason is required to block a tenant' });
    }

    // Verify tenant exists and is not already blocked
    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('id, status, business_name')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchErr || !tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (tenant.status === 'SUSPENDED' || tenant.status === 'DEACTIVATED') {
      return res.status(400).json({ error: 'Tenant is already blocked' });
    }

    // Update tenant status
    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({
        status: 'SUSPENDED',
        blocked_reason: reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) {
      console.error('[TENANTS] Block error:', updateErr.message);
      return res.status(500).json({ error: 'Failed to block tenant' });
    }

    // Deactivate all tenant users
    await supabaseAdmin.from('tenant_owners')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', id);
    await supabaseAdmin.from('employees')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', id);

    // Audit log
    await logAudit(
      req.adminProfile.id,
      'TENANT_BLOCKED',
      'TENANT',
      id,
      { reason: reason.trim(), business_name: tenant.business_name },
      req.ip
    );

    // Notify owner via email
    const ownerBlock = await getOwnerContact(id);
    console.log('[EMAIL] Block — owner contact:', ownerBlock);
    if (ownerBlock?.email) {
      sendTenantBlockedEmail({ to: ownerBlock.email, fullName: ownerBlock.fullName, businessName: tenant.business_name, reason: reason.trim() })
        .then(() => console.log('[EMAIL] Block notification sent to', ownerBlock.email))
        .catch(err => console.error('[EMAIL] Block notification failed:', err.message));
    } else {
      console.warn('[EMAIL] Block — no email address found, skipping notification');
    }

    res.json({ message: `Tenant "${tenant.business_name}" has been blocked.` });
  } catch (err) {
    console.error('[TENANTS] Block error:', err.message);
    res.status(500).json({ error: 'Failed to block tenant' });
  }
});

// ── POST /tenants/:id/reactivate — Restore a suspended tenant ──────────────
router.post('/:id/reactivate', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('id, status, business_name')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchErr || !tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (tenant.status === 'ACTIVE') {
      return res.status(400).json({ error: 'Tenant is already active' });
    }

    // Restore tenant
    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({
        status: 'ACTIVE',
        blocked_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) {
      console.error('[TENANTS] Reactivate error:', updateErr.message);
      return res.status(500).json({ error: 'Failed to reactivate tenant' });
    }

    // Re-activate all tenant users (except soft-deleted ones)
    await supabaseAdmin.from('tenant_owners')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('tenant_id', id);
    await supabaseAdmin.from('employees')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('tenant_id', id);

    // Audit log
    await logAudit(
      req.adminProfile.id,
      'TENANT_REACTIVATED',
      'TENANT',
      id,
      { business_name: tenant.business_name },
      req.ip
    );

    // Notify owner via email
    const ownerReact = await getOwnerContact(id);
    if (ownerReact?.email) {
      sendTenantReactivatedEmail({ to: ownerReact.email, fullName: ownerReact.fullName, businessName: tenant.business_name, loginUrl: process.env.CLIENT_URL || '' })
        .catch(err => console.error('[EMAIL] Reactivate notification failed:', err.message));
    }

    res.json({ message: `Tenant "${tenant.business_name}" has been reactivated.` });
  } catch (err) {
    console.error('[TENANTS] Reactivate error:', err.message);
    res.status(500).json({ error: 'Failed to reactivate tenant' });
  }
});

// ── POST /tenants/:id/approve — Approve a pending tenant ──────────────────
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('id, status, business_name')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchErr || !tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Allow approval for PENDING or ACTIVE tenants with SUBMITTED KYC
    if (tenant.status !== 'PENDING' && tenant.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Tenant cannot be approved in its current state' });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateErr) throw updateErr;

    // Update owner's KYC status to APPROVED in tenant_users
    await supabaseAdmin
      .from('tenant_users')
      .update({ kyc_status: 'APPROVED', is_active: true, updated_at: new Date().toISOString() })
      .eq('tenant_id', id)
      .eq('role', 'OWNER');

    // Auto-create a Free subscription so tenant can use the system immediately
    const now = new Date();
    const freeEnd = new Date(now);
    freeEnd.setFullYear(freeEnd.getFullYear() + 100); // effectively never expires

    // Check if subscription already exists
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('tenant_id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!existingSub) {
      await supabaseAdmin.from('subscriptions').insert({
        tenant_id: id,
        plan_name: 'Free',
        billing_cycle: 'MONTHLY',
        start_date: now.toISOString(),
        end_date: freeEnd.toISOString(),
        payment_status: 'PAID',
        amount: 0,
        currency: 'PHP',
      });
    }

    // Seed default loan settings + gold rates so appraisals work immediately
    const { error: seedErr } = await supabaseAdmin.rpc('seed_tenant_defaults', { p_tenant_id: id });
    if (seedErr) console.error('[TENANTS] Seed defaults warning:', seedErr.message);

    await logAudit(req.adminProfile.id, 'TENANT_APPROVED', 'TENANT', id, { business_name: tenant.business_name }, req.ip);

    // Notify owner via email
    const ownerApprove = await getOwnerContact(id);
    if (ownerApprove?.email) {
      sendTenantApprovedEmail({ to: ownerApprove.email, fullName: ownerApprove.fullName, businessName: tenant.business_name, loginUrl: process.env.CLIENT_URL || '' })
        .catch(err => console.error('[EMAIL] Approve notification failed:', err.message));
    }

    res.json({ message: `Tenant "${tenant.business_name}" has been approved and given a Free plan.` });
  } catch (err) {
    console.error('[TENANTS] Approve error:', err.message);
    res.status(500).json({ error: 'Failed to approve tenant' });
  }
});

// ── POST /tenants/:id/reject — Reject a pending tenant ────────────────────
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('id, status, business_name')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchErr || !tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (tenant.status !== 'PENDING' && tenant.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Tenant cannot be rejected in its current state' });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({
        status: 'REJECTED',
        blocked_reason: reason?.trim() || 'Rejected by platform admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) throw updateErr;

    // Update owner's KYC status to REJECTED
    await supabaseAdmin
      .from('tenant_users')
      .update({ kyc_status: 'REJECTED', updated_at: new Date().toISOString() })
      .eq('tenant_id', id)
      .eq('role', 'OWNER');

    await logAudit(req.adminProfile.id, 'TENANT_REJECTED', 'TENANT', id, { business_name: tenant.business_name, reason: reason?.trim() }, req.ip);

    // Notify owner via email
    const ownerReject = await getOwnerContact(id);
    if (ownerReject?.email) {
      sendTenantRejectedEmail({ to: ownerReject.email, fullName: ownerReject.fullName, businessName: tenant.business_name, reason: reason?.trim() })
        .catch(err => console.error('[EMAIL] Reject notification failed:', err.message));
    }

    res.json({ message: `Tenant "${tenant.business_name}" has been rejected.` });
  } catch (err) {
    console.error('[TENANTS] Reject error:', err.message);
    res.status(500).json({ error: 'Failed to reject tenant' });
  }
});

// ── POST /tenants/:id/deactivate — Deactivate a tenant ────────────────────
router.post('/:id/deactivate', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('id, status, business_name')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchErr || !tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (tenant.status === 'DEACTIVATED') {
      return res.status(400).json({ error: 'Tenant is already deactivated' });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({
        status: 'DEACTIVATED',
        blocked_reason: reason?.trim() || 'Deactivated by platform admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) throw updateErr;

    await supabaseAdmin.from('tenant_owners')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', id);
    await supabaseAdmin.from('employees')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', id);

    await logAudit(req.adminProfile.id, 'TENANT_DEACTIVATED', 'TENANT', id, { business_name: tenant.business_name, reason: reason?.trim() }, req.ip);

    // Notify owner via email
    const ownerDeact = await getOwnerContact(id);
    console.log('[EMAIL] Deactivate — owner contact:', ownerDeact);
    if (ownerDeact?.email) {
      sendTenantDeactivatedEmail({ to: ownerDeact.email, fullName: ownerDeact.fullName, businessName: tenant.business_name, reason: reason?.trim() })
        .then(() => console.log('[EMAIL] Deactivate notification sent to', ownerDeact.email))
        .catch(err => console.error('[EMAIL] Deactivate notification failed:', err.message));
    } else {
      console.warn('[EMAIL] Deactivate — no email address found, skipping notification');
    }

    res.json({ message: `Tenant "${tenant.business_name}" has been deactivated.` });
  } catch (err) {
    console.error('[TENANTS] Deactivate error:', err.message);
    res.status(500).json({ error: 'Failed to deactivate tenant' });
  }
});

// ── PATCH /tenants/:id/plan — Update subscription plan ─────────────────────
router.patch('/:id/plan', async (req, res) => {
  try {
    const { id } = req.params;
    const { plan_name, billing_cycle } = req.body;

    const validPlans = ['basic', 'professional', 'enterprise'];
    const validCycles = ['MONTHLY', 'YEARLY'];

    if (plan_name && !validPlans.includes(plan_name.toLowerCase())) {
      return res.status(400).json({ error: `Invalid plan. Must be one of: ${validPlans.join(', ')}` });
    }
    if (billing_cycle && !validCycles.includes(billing_cycle)) {
      return res.status(400).json({ error: `Invalid billing cycle. Must be one of: ${validCycles.join(', ')}` });
    }

    // Get tenant's latest subscription
    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('tenant_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (subErr || !sub) {
      return res.status(404).json({ error: 'Subscription not found for this tenant' });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (plan_name) updates.plan_name = plan_name.toLowerCase();
    if (billing_cycle) updates.billing_cycle = billing_cycle;

    const { error: updateErr } = await supabaseAdmin
      .from('subscriptions')
      .update(updates)
      .eq('id', sub.id);

    if (updateErr) {
      console.error('[TENANTS] Plan update error:', updateErr.message);
      return res.status(500).json({ error: 'Failed to update plan' });
    }

    // Audit log
    await logAudit(
      req.adminProfile.id,
      'PLAN_UPDATED',
      'SUBSCRIPTION',
      sub.id,
      { tenant_id: id, from: sub.plan_name, to: plan_name || sub.plan_name, billing_cycle: billing_cycle || sub.billing_cycle },
      req.ip
    );

    res.json({ message: 'Subscription plan updated successfully.' });
  } catch (err) {
    console.error('[TENANTS] Plan update error:', err.message);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

// ── GET /tenants/:id/users — List tenant's users ───────────────────────────
router.get('/:id/users', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: owner } = await supabaseAdmin.from('tenant_owners')
      .select('id, full_name, is_active, branch_id, branches(branch_name), created_at')
      .eq('tenant_id', id)
      .is('deleted_at', null)
      .single();

    const { data: empList } = await supabaseAdmin.from('employees')
      .select('id, full_name, role, is_active, branch_id, branches(branch_name), created_at')
      .eq('tenant_id', id)
      .is('deleted_at', null);

    const users = [];
    if (owner) users.push({ ...owner, role: 'OWNER' });
    if (empList) users.push(...empList);

    res.json({ data: users });
  } catch (err) {
    console.error('[TENANTS] Users error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tenant users' });
  }
});

// ── GET /tenants/:id/activity — Tenant activity summary ────────────────────
router.get('/:id/activity', async (req, res) => {
  try {
    const { id } = req.params;

    const [ticketsRes, transRes, customersRes] = await Promise.all([
      supabaseAdmin.from('pawn_tickets').select('status', { count: 'exact' }).eq('tenant_id', id).is('deleted_at', null),
      supabaseAdmin.from('transactions').select('trans_type, principal_paid, interest_paid, penalty_paid').eq('tenant_id', id).is('deleted_at', null),
      supabaseAdmin.from('customers').select('*', { count: 'exact', head: true }).eq('tenant_id', id).is('deleted_at', null),
    ]);

    const tickets = ticketsRes.data || [];
    const transactions = transRes.data || [];

    const totalRevenue = transactions.reduce((sum, t) =>
      sum + Number(t.principal_paid || 0) + Number(t.interest_paid || 0) + Number(t.penalty_paid || 0), 0);

    res.json({
      total_tickets: tickets.length,
      active_tickets: tickets.filter(t => t.status === 'ACTIVE').length,
      total_transactions: transactions.length,
      total_revenue: totalRevenue,
      total_customers: customersRes.count || 0,
    });
  } catch (err) {
    console.error('[TENANTS] Activity error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tenant activity' });
  }
});

// ── Helper: plan price lookup ──────────────────────────────────────────────
function planPrice(planName, cycle) {
  const prices = { free: 0, basic: 29, professional: 79, enterprise: 199 };
  const monthly = prices[(planName || 'free').toLowerCase()] || 0;
  if (cycle === 'YEARLY') return monthly * 12 * 0.8; // 20% yearly discount
  return monthly;
}

// ── GET /tenants/health — Per-tenant health scores ────────────────────────
router.get('/health', async (req, res) => {
  try {
    const { sort = 'health_score', status } = req.query;

    let tenantQuery = supabaseAdmin
      .from('tenants')
      .select('id, business_name, status, created_at')
      .is('deleted_at', null);

    if (status) tenantQuery = tenantQuery.eq('status', status);

    const { data: tenants, error: tenantErr } = await tenantQuery;
    if (tenantErr) throw tenantErr;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sinceIso = thirtyDaysAgo.toISOString();

    // Fetch sub status, tx count, active loans for all tenants in parallel
    const enriched = await Promise.all((tenants || []).map(async (tenant) => {
      const [
        { data: sub },
        { count: txCount },
        { count: activeLoans },
      ] = await Promise.all([
        supabaseAdmin
          .from('subscriptions')
          .select('payment_status, plan_name, billing_cycle')
          .eq('tenant_id', tenant.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .gte('created_at', sinceIso)
          .is('deleted_at', null),
        supabaseAdmin
          .from('pawn_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('status', 'ACTIVE')
          .is('deleted_at', null),
      ]);

      const paymentStatus = sub?.payment_status || 'PENDING';
      const txCountVal    = txCount || 0;
      const activeLoanVal = activeLoans || 0;

      // Activity score (40%)
      let activityScore = 0;
      if (txCountVal >= 11) activityScore = 40;
      else if (txCountVal >= 1) activityScore = 20;

      // Subscription score (30%)
      let subScore = 0;
      if (paymentStatus === 'PAID')    subScore = 30;
      else if (paymentStatus === 'PENDING') subScore = 15;

      // Loan volume score (30%)
      const loanScore = activeLoanVal > 0 ? 30 : 0;

      const health_score = activityScore + subScore + loanScore;
      let health_status = 'critical';
      if (health_score >= 70)      health_status = 'healthy';
      else if (health_score >= 30) health_status = 'warning';

      return {
        tenant_id: tenant.id,
        business_name: tenant.business_name,
        status: tenant.status,
        plan_name: sub?.plan_name || null,
        payment_status: paymentStatus,
        tx_count_30d: txCountVal,
        active_loans: activeLoanVal,
        health_score,
        health_status,
        last_activity: null, // could be enhanced with last tx date
      };
    }));

    // Sort
    if (sort === 'health_score') {
      enriched.sort((a, b) => b.health_score - a.health_score);
    } else if (sort === 'last_activity') {
      enriched.sort((a, b) => b.tx_count_30d - a.tx_count_30d);
    }

    const summary = enriched.reduce(
      (acc, t) => {
        acc[t.health_status] = (acc[t.health_status] || 0) + 1;
        return acc;
      },
      { healthy: 0, warning: 0, critical: 0 }
    );

    res.json({ tenants: enriched, summary });
  } catch (err) {
    console.error('[TENANTS] Health error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tenant health' });
  }
});

// ── GET /tenants/subscription-analytics — SaaS billing analytics ──────────
router.get('/subscription-analytics', async (req, res) => {
  try {
    const periodMonths = parseInt(req.query.period) || 6;

    const { data: subs, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, tenant_id, plan_name, billing_cycle, payment_status, created_at, paid_at, end_date')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (subErr) throw subErr;

    const allSubs = subs || [];

    // Current MRR from PAID subscriptions
    const activePaid = allSubs.filter(s => s.payment_status === 'PAID');
    const currentMrr = activePaid.reduce((sum, s) => {
      return sum + planPrice(s.plan_name, s.billing_cycle) / (s.billing_cycle === 'YEARLY' ? 12 : 1);
    }, 0);

    // Plan distribution
    const planDistribution = {};
    allSubs.forEach(s => {
      const key = (s.plan_name || 'unknown').toLowerCase();
      planDistribution[key] = (planDistribution[key] || 0) + 1;
    });

    // Payment status counts
    const paymentStatusCounts = {};
    allSubs.forEach(s => {
      paymentStatusCounts[s.payment_status] = (paymentStatusCounts[s.payment_status] || 0) + 1;
    });

    // MRR trend and new/churned per month (last N months)
    const now = new Date();
    const monthlyData = {};
    for (let i = periodMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = { month: key, mrr: 0, new_subscriptions: 0, churned: 0 };
    }

    allSubs.forEach(s => {
      const createdMonth = (s.created_at || '').slice(0, 7);
      if (monthlyData[createdMonth]) {
        monthlyData[createdMonth].new_subscriptions += 1;
        if (s.payment_status === 'PAID') {
          monthlyData[createdMonth].mrr += planPrice(s.plan_name, s.billing_cycle) / (s.billing_cycle === 'YEARLY' ? 12 : 1);
        }
      }
      if (['CANCELLED', 'OVERDUE'].includes(s.payment_status)) {
        const updatedMonth = (s.end_date || s.created_at || '').slice(0, 7);
        if (monthlyData[updatedMonth]) {
          monthlyData[updatedMonth].churned += 1;
        }
      }
    });

    const mrrTrend = Object.values(monthlyData);

    // Churn rate: churned / (churned + active) roughly
    const totalChurned = allSubs.filter(s => ['CANCELLED', 'OVERDUE'].includes(s.payment_status)).length;
    const churnRate = allSubs.length > 0 ? ((totalChurned / allSubs.length) * 100).toFixed(1) : '0.0';

    res.json({
      current_mrr: Math.round(currentMrr * 100) / 100,
      mrr_trend: mrrTrend,
      churn_rate: Number(churnRate),
      plan_distribution: planDistribution,
      payment_status_counts: paymentStatusCounts,
      period_months: periodMonths,
    });
  } catch (err) {
    console.error('[TENANTS] Subscription analytics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch subscription analytics' });
  }
});

// ── GET /tenants/pawn-volume — Platform-wide pawn activity KPIs ───────────
router.get('/pawn-volume', async (req, res) => {
  try {
    const periodDays = parseInt(req.query.period) || 30;

    const since = new Date();
    since.setDate(since.getDate() - periodDays);
    const sinceIso = since.toISOString();

    const [
      { data: tickets },
      { data: transactions },
      { count: itemsInVault },
      { count: totalCustomers },
    ] = await Promise.all([
      supabaseAdmin
        .from('pawn_tickets')
        .select('loan_amount, loan_date')
        .gte('loan_date', sinceIso)
        .is('deleted_at', null),
      supabaseAdmin
        .from('transactions')
        .select('trans_type, principal_paid, interest_paid, penalty_paid, created_at')
        .gte('created_at', sinceIso)
        .is('deleted_at', null),
      supabaseAdmin
        .from('pawn_items')
        .select('*', { count: 'exact', head: true })
        .eq('inventory_status', 'IN_VAULT')
        .is('deleted_at', null),
      supabaseAdmin
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null),
    ]);

    const ticketArr = tickets || [];
    const txArr     = transactions || [];

    const total_loans_issued       = ticketArr.length;
    const total_principal_disbursed = ticketArr.reduce((s, t) => s + Number(t.loan_amount || 0), 0);
    const avg_loan_value           = total_loans_issued > 0 ? total_principal_disbursed / total_loans_issued : 0;

    const total_interest_collected = txArr.reduce((s, t) => s + Number(t.interest_paid || 0), 0);

    // Daily trend
    const trendMap = {};
    for (let i = periodDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      trendMap[key] = { date: key, loans_issued: 0, disbursed: 0, interest: 0 };
    }

    ticketArr.forEach(t => {
      const day = (t.loan_date || '').slice(0, 10);
      if (trendMap[day]) {
        trendMap[day].loans_issued += 1;
        trendMap[day].disbursed    += Number(t.loan_amount || 0);
      }
    });

    txArr.forEach(t => {
      const day = (t.created_at || '').slice(0, 10);
      if (trendMap[day]) {
        trendMap[day].interest += Number(t.interest_paid || 0);
      }
    });

    res.json({
      kpis: {
        total_loans_issued,
        total_principal_disbursed: Math.round(total_principal_disbursed * 100) / 100,
        total_interest_collected:  Math.round(total_interest_collected  * 100) / 100,
        total_items_in_vault: itemsInVault || 0,
        total_customers: totalCustomers || 0,
        avg_loan_value: Math.round(avg_loan_value * 100) / 100,
      },
      trend: Object.values(trendMap),
    });
  } catch (err) {
    console.error('[TENANTS] Pawn volume error:', err.message);
    res.status(500).json({ error: 'Failed to fetch pawn volume' });
  }
});

// ── GET /tenants/rankings — Tenant rankings by metric ─────────────────────
router.get('/rankings', async (req, res) => {
  try {
    const { metric = 'revenue', limit: limitParam = '10' } = req.query;
    const periodDays = parseInt(req.query.period) || 30;
    const topN        = Math.min(parseInt(limitParam) || 10, 100);

    const validMetrics = ['revenue', 'loans', 'customers', 'transactions'];
    if (!validMetrics.includes(metric)) {
      return res.status(400).json({ error: `Invalid metric. Valid: ${validMetrics.join(', ')}` });
    }

    const since = new Date();
    since.setDate(since.getDate() - periodDays);
    const sinceIso = since.toISOString();

    const { data: tenants, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, business_name')
      .is('deleted_at', null);

    if (tenantErr) throw tenantErr;

    const { data: branches } = await supabaseAdmin
      .from('branches')
      .select('tenant_id')
      .is('deleted_at', null);

    const branchCountMap = {};
    (branches || []).forEach(b => {
      branchCountMap[b.tenant_id] = (branchCountMap[b.tenant_id] || 0) + 1;
    });

    const tenantValues = await Promise.all((tenants || []).map(async (tenant) => {
      let value = 0;

      if (metric === 'revenue') {
        const { data: txs } = await supabaseAdmin
          .from('transactions')
          .select('interest_paid, penalty_paid')
          .eq('tenant_id', tenant.id)
          .gte('created_at', sinceIso)
          .is('deleted_at', null);
        value = (txs || []).reduce((s, t) => s + Number(t.interest_paid || 0) + Number(t.penalty_paid || 0), 0);

      } else if (metric === 'loans') {
        const { count } = await supabaseAdmin
          .from('pawn_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .gte('loan_date', sinceIso)
          .is('deleted_at', null);
        value = count || 0;

      } else if (metric === 'customers') {
        const { count } = await supabaseAdmin
          .from('customers')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .is('deleted_at', null);
        value = count || 0;

      } else if (metric === 'transactions') {
        const { count } = await supabaseAdmin
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .gte('created_at', sinceIso)
          .is('deleted_at', null);
        value = count || 0;
      }

      return {
        tenant_id: tenant.id,
        business_name: tenant.business_name,
        branch_count: branchCountMap[tenant.id] || 0,
        value,
      };
    }));

    // Sort descending
    tenantValues.sort((a, b) => b.value - a.value);

    const platform_total = tenantValues.reduce((s, t) => s + t.value, 0);

    const rankings = tenantValues.slice(0, topN).map((t, i) => ({
      rank: i + 1,
      tenant_id: t.tenant_id,
      business_name: t.business_name,
      branch_count: t.branch_count,
      value: Math.round(t.value * 100) / 100,
      pct_of_platform: platform_total > 0 ? Number(((t.value / platform_total) * 100).toFixed(1)) : 0,
    }));

    res.json({
      metric,
      period_days: periodDays,
      platform_total: Math.round(platform_total * 100) / 100,
      rankings,
    });
  } catch (err) {
    console.error('[TENANTS] Rankings error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tenant rankings' });
  }
});

module.exports = router;

