const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination, generateTicketNumber, generateReceiptNumber } = require('../utils/helpers');
const { sendDisbursementEmail } = require('../services/email');
const { generatePawnTicketPdf } = require('../utils/pawnTicketPdf');
const asyncHandler = require('../utils/asyncHandler');
const { logTenantAudit } = require('../utils/auditLog');

const isValidUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));

// POST /api/appraisals/calculate — Gold appraisal calculation (no side effects)
router.post('/calculate', async (req, res) => {
  const { weight_grams, karat, item_condition } = req.body;
  if (!weight_grams || !karat || !item_condition) {
    return res.status(400).json({ error: 'weight_grams, karat, and item_condition are required' });
  }

  // Look up gold rate for this karat
  const { data: goldRate, error: rateErr } = await supabaseAdmin
    .from('gold_rates')
    .select('rate_per_gram, purity_decimal')
    .eq('tenant_id', req.tenantId)
    .eq('karat', Number(karat))
    .is('deleted_at', null)
    .single();

  if (rateErr || !goldRate) {
    return res.status(422).json({ error: `No gold rate found for ${karat}K` });
  }

  // Look up condition multiplier from item_conditions (managed in Pricing module)
  const { data: condRow } = await supabaseAdmin
    .from('item_conditions')
    .select('multiplier_pct')
    .eq('tenant_id', req.tenantId)
    .eq('condition_name', item_condition)
    .eq('is_active', true)
    .single();

  if (!condRow) {
    return res.status(422).json({ error: `Unknown or inactive condition: ${item_condition}` });
  }

  // Fetch LTV ratio from tenant loan settings
  const { data: loanSettings } = await supabaseAdmin
    .from('tenant_loan_settings')
    .select('ltv_ratio')
    .eq('tenant_id', req.tenantId)
    .maybeSingle();

  const ltvRatio = loanSettings?.ltv_ratio || 0.70;
  const condMult = condRow.multiplier_pct / 100;
  const meltValue = Number(weight_grams) * goldRate.rate_per_gram * goldRate.purity_decimal;
  const fairMarketValue = meltValue * condMult;
  const maxLoan = fairMarketValue * ltvRatio;

  res.json({
    success: true,
    rate_per_gram: goldRate.rate_per_gram,
    purity_decimal: goldRate.purity_decimal,
    condition_mult: condMult,
    ltv_ratio: ltvRatio,
    melt_value: Math.round(meltValue * 100) / 100,
    fair_market_value: Math.round(fairMarketValue * 100) / 100,
    appraised_value: Math.round(fairMarketValue * 100) / 100,  // same as FMV for backward compat
    max_loan: Math.round(maxLoan * 100) / 100,
  });
});

// GET /api/appraisals/stats — KPI counts
router.get('/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const [
      { count: pendingAppraisal },
      { count: pendingApproval },
      { count: readyForRelease },
      completedTodayRes,
      { count: declined },
      { count: appraisedToday },
      { count: approvedToday },
      { count: issuedToday },
      cashDisbursedRes,
    ] = await Promise.all([
      supabaseAdmin
        .from('pawn_items')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', req.tenantId)
        .eq('inventory_status', 'PENDING_APPRAISAL')
        .is('deleted_at', null),
      supabaseAdmin
        .from('pawn_items')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', req.tenantId)
        .eq('inventory_status', 'APPRAISED'),
      // Ready for release: APPRAISED items with an APPROVED assessment (loan_terms set)
      (async () => {
        const { data: approvedItems } = await supabaseAdmin
          .from('appraisal_assessments')
          .select('item_id')
          .eq('tenant_id', req.tenantId)
          .eq('outcome', 'APPROVED');
        const approvedIds = (approvedItems || []).map(a => a.item_id);
        if (approvedIds.length === 0) return { count: 0 };
        return supabaseAdmin
          .from('pawn_items')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', req.tenantId)
          .eq('inventory_status', 'APPRAISED')
          .in('id', approvedIds);
      })(),
      (async () => {
        return supabaseAdmin
          .from('pawn_items')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', req.tenantId)
          .eq('inventory_status', 'IN_VAULT')
          .gte('updated_at', todayISO);
      })(),
      supabaseAdmin
        .from('appraisal_assessments')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', req.tenantId)
        .eq('outcome', 'DECLINED'),
      // Role-scoped: items appraised today by current user
      (async () => {
        const query = supabaseAdmin
          .from('appraisal_assessments')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', req.tenantId)
          .gte('created_at', todayISO);
        if (['APPRAISER'].includes(req.userRole)) {
          query.eq('assessed_by', req.userId);
        }
        return query;
      })(),
      // Role-scoped: items approved today
      (async () => {
        const query = supabaseAdmin
          .from('appraisal_assessments')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', req.tenantId)
          .eq('outcome', 'APPROVED')
          .gte('updated_at', todayISO);
        if (['MANAGER'].includes(req.userRole)) {
          query.eq('assessed_by', req.userId);
        }
        return query;
      })(),
      // Role-scoped: items issued today
      (async () => {
        const query = supabaseAdmin
          .from('appraisal_assessments')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', req.tenantId)
          .eq('outcome', 'ISSUED')
          .gte('updated_at', todayISO);
        if (['CASHIER'].includes(req.userRole)) {
          // For cashier, scope by the item's specific_attrs.issued_by
          // We can't easily filter JSONB here, so we return tenant-wide for now
        }
        return query;
      })(),
      // Cash disbursed today
      (async () => {
        return supabaseAdmin
          .from('transactions')
          .select('principal_paid')
          .eq('tenant_id', req.tenantId)
          .eq('trans_type', 'DISBURSEMENT')
          .gte('trans_date', todayISO);
      })(),
    ]);

    const cashDisbursedToday = (cashDisbursedRes.data || []).reduce(
      (sum, t) => sum + (Number(t.principal_paid) || 0), 0
    );

    res.json({
      pendingAppraisal: pendingAppraisal || 0,
      pendingApproval: pendingApproval || 0,
      readyForRelease: readyForRelease || 0,
      completedToday: completedTodayRes.count || 0,
      declined: declined || 0,
      appraisedToday: appraisedToday || 0,
      approvedToday: approvedToday || 0,
      issuedToday: issuedToday || 0,
      cashDisbursedToday,
    });
  } catch (err) {
    console.error('[appraisals] stats error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/appraisals/queue — Items in appraisal pipeline
router.get('/queue', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  const { from, to } = getPagination(page, limit);
  const status = req.query.status || '';

  try {
    let query = supabaseAdmin
      .from('pawn_items')
      .select('*, customers(id, first_name, last_name)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .in('inventory_status', status ? [status] : ['PENDING_APPRAISAL', 'UNDER_APPRAISAL', 'APPRAISED'])
      .order('created_at', { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: 'Unable to fetch appraisal queue.' });
    res.json({ data: data || [], total: count || 0, page, limit });
  } catch (err) {
    console.error('[appraisals] queue error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/appraisals/submit — Appraiser appraises an existing intake item
router.post('/submit', async (req, res) => {
  if (req.userRole !== 'APPRAISER' && req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only appraisers can submit appraisals' });
  }

  const {
    item_id, category, condition, description,
    brand, model, serial_number, weight_grams, karat,
    appraised_value, fair_market_value, accessories, notes,
  } = req.body;

  if (!appraised_value || Number(appraised_value) <= 0) {
    return res.status(400).json({ error: 'appraised_value is required and must be positive' });
  }

  let item;

  if (item_id) {
    // Existing item from intake queue (appraiser/cashier flow)
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('pawn_items')
      .select('*')
      .eq('id', item_id)
      .eq('tenant_id', req.tenantId)
      .is('deleted_at', null)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Item not found' });
    }
    if (existing.inventory_status !== 'PENDING_APPRAISAL') {
      return res.status(422).json({ error: `Item is in ${existing.inventory_status} status, expected PENDING_APPRAISAL` });
    }
    item = existing;
  } else {
    // New item created by owner directly (owner appraisal flow)
    const { customer_id } = req.body;
    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required when creating a new item' });
    }
    const { data: newItem, error: createErr } = await supabaseAdmin
      .from('pawn_items')
      .insert({
        tenant_id: req.tenantId,
        customer_id,
        branch_id: req.branchId,
        category: category || 'JEWELRY',
        general_desc: description?.trim() || 'Item',
        item_condition: condition || null,
        brand: brand?.trim() || null,
        model: model?.trim() || null,
        serial_number: serial_number?.trim() || null,
        weight_grams: weight_grams ? Number(weight_grams) : null,
        karat: karat ? Number(karat) : null,
        accessories: accessories || [],
        inventory_status: 'PENDING_APPRAISAL',
        specific_attrs: { submitted_by: req.userId, submitted_at: new Date().toISOString() },
      })
      .select()
      .single();

    if (createErr || !newItem) {
      return res.status(400).json({ error: createErr?.message || 'Failed to create item' });
    }
    item = newItem;
  }

  // Check serial number uniqueness if provided
  if (serial_number?.trim()) {
    const { data: existing } = await supabaseAdmin
      .from('pawn_items')
      .select('id')
      .eq('tenant_id', req.tenantId)
      .eq('serial_number', serial_number.trim())
      .neq('id', item.id)
      .is('deleted_at', null)
      .limit(1);

    if (existing?.length) {
      return res.status(409).json({ error: `Serial number "${serial_number}" is already registered to another item` });
    }
  }

  // Build specific_attrs
  const specificAttrs = {
    ...(item.specific_attrs || {}),
    appraised_by: req.userId,
    appraised_at: new Date().toISOString(),
    accessories: accessories || [],
    notes: notes?.trim() || null,
  };

  // Update the item with appraisal data
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('pawn_items')
    .update({
      category: category || item.category,
      item_condition: condition || null,
      general_desc: description?.trim() || item.general_desc,
      brand: brand?.trim() || null,
      model: model?.trim() || null,
      serial_number: serial_number?.trim() || null,
      weight_grams: weight_grams ? Number(weight_grams) : null,
      karat: karat ? Number(karat) : null,
      appraised_value: Number(appraised_value),
      fair_market_value: Number(fair_market_value || appraised_value),
      inventory_status: 'APPRAISED',
      specific_attrs: specificAttrs,
    })
    .eq('id', item.id)
    .select()
    .single();

  if (updateErr) return res.status(400).json({ error: updateErr.message });

  // Create appraisal assessment record
  const assessmentData = {
    item_id: item.id,
    tenant_id: req.tenantId,
    assessed_by: req.userId,
    category: category || item.category,
    item_condition: condition || item.item_condition || null,
    weight_grams: weight_grams ? Number(weight_grams) : null,
    karat: karat ? Number(karat) : null,
    fair_market_value: Number(fair_market_value || appraised_value),
    appraised_value: Number(appraised_value),
    offered_amount: Number(appraised_value),
    outcome: 'PENDING',
  };

  // For jewelry, store gold rate snapshot
  if ((category || item.category) === 'JEWELRY' && weight_grams && karat) {
    const { data: goldRate } = await supabaseAdmin
      .from('gold_rates')
      .select('rate_per_gram, purity_decimal')
      .eq('tenant_id', req.tenantId)
      .eq('karat', Number(karat))
      .is('deleted_at', null)
      .single();

    if (goldRate) {
      // Look up condition multiplier from item_conditions (managed in Pricing module)
      let conditionMultiplier = 1.0;
      if (condition) {
        const { data: condRow } = await supabaseAdmin
          .from('item_conditions')
          .select('multiplier_pct')
          .eq('tenant_id', req.tenantId)
          .eq('condition_name', condition)
          .eq('is_active', true)
          .single();
        if (condRow) conditionMultiplier = condRow.multiplier_pct / 100;
      }
      assessmentData.gold_rate_used = goldRate.rate_per_gram;
      assessmentData.purity_decimal_used = goldRate.purity_decimal;
      assessmentData.condition_multiplier = conditionMultiplier;
      assessmentData.melt_value = Number(weight_grams) * goldRate.rate_per_gram * goldRate.purity_decimal;
    }
  }

  const { error: assessErr } = await supabaseAdmin.from('appraisal_assessments').insert(assessmentData);
  if (assessErr) console.error('[appraisals] Assessment insert failed:', assessErr.message);

  logTenantAudit(req, {
    action: 'APPRAISAL_SUBMITTED', category: 'APPRAISAL',
    description: `Submitted appraisal for ${description || updated.general_desc || 'item'} — ₱${Number(appraised_value).toLocaleString()}`,
    target_type: 'pawn_item', target_id: item.id,
  });

  res.status(200).json(updated);
});

// POST /appraisals/intake — Cashier accepts item from customer (minimal data)
router.post('/intake', async (req, res) => {
  if (!['CASHIER', 'OWNER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only cashiers and owners can accept items' });
  }

  const { customer_id, category, description } = req.body;

  if (!customer_id || !category) {
    return res.status(400).json({ error: 'customer_id and category are required' });
  }

  const validCategories = ['JEWELRY', 'GADGET', 'VEHICLE', 'APPLIANCE', 'OTHER'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${validCategories.join(', ')}` });
  }

  // Verify customer belongs to tenant
  const { data: customer, error: custErr } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name')
    .eq('id', customer_id)
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .single();

  if (custErr || !customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const { data: item, error: itemErr } = await supabaseAdmin
    .from('pawn_items')
    .insert({
      tenant_id: req.tenantId,
      branch_id: req.branchId,
      customer_id,
      category,
      general_desc: description?.trim() || category,
      inventory_status: 'PENDING_APPRAISAL',
      specific_attrs: {
        submitted_by: req.userId,
        submitted_at: new Date().toISOString(),
      },
    })
    .select()
    .single();

  if (itemErr) return res.status(400).json({ error: itemErr.message });

  logTenantAudit(req, {
    action: 'ITEM_INTAKE', category: 'APPRAISAL',
    description: `Accepted ${category || 'item'} from customer`,
    target_type: 'pawn_item', target_id: item.id,
  });

  res.status(201).json(item);
});

// GET /appraisals/my-items — Items submitted by current user with status
router.get('/my-items', async (req, res) => {
  if (!['CASHIER', 'OWNER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { data, error } = await supabaseAdmin
    .from('pawn_items')
    .select('id, category, general_desc, inventory_status, created_at, customer_id, customers(first_name, last_name)')
    .eq('tenant_id', req.tenantId)
    .filter('specific_attrs->>submitted_by', 'eq', req.userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });

  const STATUS_LABELS = {
    PENDING_APPRAISAL: 'Awaiting Appraisal',
    APPRAISED: 'Awaiting Approval',
    APPRAISED: 'Ready for Release',
    VAULT: 'Issued',
    REDEEMED: 'Redeemed',
    FORFEITED: 'Forfeited',
    DECLINED: 'Declined',
    REJECTED: 'Rejected',
  };

  const items = (data || []).map(item => ({
    ...item,
    status_label: STATUS_LABELS[item.inventory_status] || item.inventory_status,
    customer_name: item.customers
      ? `${item.customers.first_name} ${item.customers.last_name}`
      : 'Unknown',
  }));

  res.json(items);
});

// POST /api/appraisals/:id/approve — Manager approves → calculates loan terms, moves to APPRAISED
router.post('/:id/approve', asyncHandler(async (req, res) => {
  if (!isValidUuid(req.params.id)) return res.status(422).json({ error: 'Invalid item id' });
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can approve appraisals' });
  }

  const { principal_loan, offered_amount, storage_location } = req.body;
  if (!principal_loan || Number(principal_loan) <= 0) {
    return res.status(422).json({ error: 'principal_loan must be greater than 0' });
  }

  try {
    const { data: item } = await supabaseAdmin
      .from('pawn_items')
      .select('id, tenant_id, customer_id, appraised_value, fair_market_value, inventory_status, specific_attrs')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .eq('inventory_status', 'APPRAISED')
      .maybeSingle();

    if (!item) return res.status(404).json({ error: 'Item not found or not in APPRAISED state' });

    // Fetch tenant loan settings
    const { data: settings } = await supabaseAdmin
      .from('tenant_loan_settings')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    const interestRate = settings?.interest_rate || 3;
    const maturityMonths = settings?.maturity_months || 1;
    const graceDays = settings?.grace_period_days || 90;
    const serviceCharge = Number(settings?.service_charge ?? 10);
    const advanceInterestMonths = settings?.advance_interest_months || 1;
    const paymentCycleDays = settings?.payment_cycle_days || 30;
    const ltvRatio = settings?.ltv_ratio || 0.70;

    // Enforce LTV ratio against fair market value
    const fmv = Number(item.fair_market_value || item.appraised_value);
    const maxLoan = fmv * ltvRatio;
    if (Number(principal_loan) > maxLoan) {
      return res.status(422).json({
        error: `Loan amount cannot exceed ${(ltvRatio * 100).toFixed(0)}% of fair market value (max: ₱${maxLoan.toFixed(2)})`,
      });
    }

    const loanDate = new Date();
    const maturityDate = new Date(loanDate);
    maturityDate.setMonth(maturityDate.getMonth() + maturityMonths);
    const expiryDate = new Date(maturityDate);
    expiryDate.setDate(expiryDate.getDate() + graceDays);
    const nextPaymentDue = new Date(loanDate);
    nextPaymentDue.setDate(nextPaymentDue.getDate() + paymentCycleDays);

    const advanceInterest = Number(principal_loan) * (interestRate / 100) * advanceInterestMonths;
    const netProceeds = Number(principal_loan) - advanceInterest - serviceCharge;

    const ticketNumber = generateTicketNumber();

    const loanTerms = {
      principal_loan: Number(principal_loan),
      interest_rate: interestRate,
      advance_interest: advanceInterest,
      service_charge: serviceCharge,
      net_proceeds: netProceeds,
      loan_date: loanDate.toISOString(),
      maturity_date: maturityDate.toISOString(),
      expiry_date: expiryDate.toISOString(),
      grace_period_days: graceDays,
      next_payment_due_date: nextPaymentDue.toISOString(),
      payment_cycle_days: paymentCycleDays,
      maturity_months: maturityMonths,
      ticket_number: ticketNumber,
      ltv_ratio: ltvRatio,
    };

    // Fetch assessment ID for the RPC
    const { data: assessment } = await supabaseAdmin
      .from('appraisal_assessments')
      .select('id')
      .eq('item_id', item.id)
      .eq('tenant_id', req.tenantId)
      .eq('outcome', 'PENDING')
      .maybeSingle();

    const assessmentId = assessment?.id || null;
    const offeredAmount = offered_amount ? Number(offered_amount) : Number(principal_loan);

    const { data: result, error: rpcError } = await supabaseAdmin.rpc('approve_appraisal', {
      p_tenant_id: req.tenantId,
      p_item_id: item.id,
      p_assessment_id: assessmentId,
      p_offered_amount: offeredAmount,
    });
    if (rpcError || !result?.success) return res.status(400).json({ error: rpcError?.message || result?.error || 'Failed to approve appraisal' });

    // Store loan terms in specific_attrs so the issue endpoint can read them
    const existingAttrs = item.specific_attrs || {};
    await supabaseAdmin
      .from('pawn_items')
      .update({
        offered_amount: offeredAmount,
        storage_location: storage_location || null,
        specific_attrs: { ...existingAttrs, loan_terms: loanTerms, appraised_by: req.userId },
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .eq('tenant_id', req.tenantId);

    logTenantAudit(req, {
      action: 'APPRAISAL_APPROVED', category: 'APPRAISAL',
      description: `Approved appraisal for item`,
      target_type: 'pawn_item', target_id: item.id,
    });

    res.status(201).json({ item_id: item.id, loan_terms: loanTerms });
  } catch (err) {
    console.error('[appraisals] approve error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}));

// POST /api/appraisals/:id/issue — Cashier issues pawn ticket + disburses cash
router.post('/:id/issue', asyncHandler(async (req, res) => {
  if (!isValidUuid(req.params.id)) return res.status(422).json({ error: 'Invalid item id' });
  if (!['CASHIER', 'OWNER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only cashiers and owners can issue pawn tickets' });
  }

  try {
    const { data: item } = await supabaseAdmin
      .from('pawn_items')
      .select('*, customers(first_name, last_name)')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .eq('inventory_status', 'APPRAISED')
      .maybeSingle();

    if (!item) return res.status(404).json({ error: 'Item not found or not in APPRAISED state' });

    const loanTerms = item.specific_attrs?.loan_terms;
    if (!loanTerms) {
      return res.status(422).json({ error: 'Item has no loan terms. It must be approved first.' });
    }

    // Issue pawn ticket atomically via RPC
    const receiptNumber = generateReceiptNumber();
    const { data: result, error: rpcError } = await supabaseAdmin.rpc('issue_pawn_ticket', {
      p_tenant_id: req.tenantId,
      p_item_id: item.id,
      p_customer_id: item.customer_id,
      p_appraiser_id: item.specific_attrs.appraised_by || req.userId,
      p_principal_loan: loanTerms.principal_loan,
      p_interest_rate: loanTerms.interest_rate,
      p_service_charge: loanTerms.service_charge,
      p_advance_interest: loanTerms.advance_interest,
      p_net_proceeds: loanTerms.net_proceeds,
      p_maturity_months: loanTerms.maturity_months,
      p_grace_period_days: loanTerms.grace_period_days,
      p_penalty_rate: 0,
      p_payment_cycle_days: loanTerms.payment_cycle_days,
      p_receipt_number: receiptNumber,
      p_ticket_number: loanTerms.ticket_number,
    });
    if (rpcError || !result?.success) return res.status(400).json({ error: rpcError?.message || result?.error || 'Failed to issue ticket' });

    const ticket = { id: result.ticket_id, ticket_number: loanTerms.ticket_number, ...loanTerms };
    const transaction = result.transaction_id ? { id: result.transaction_id, receipt_number: receiptNumber } : null;

    // Fire-and-forget: send disbursement email with PDF to customer
    (async () => {
      try {
        // Fetch customer email
        const { data: customer } = await supabaseAdmin
          .from('customers')
          .select('email, first_name, last_name')
          .eq('id', item.customer_id)
          .single();

        if (!customer?.email) return; // No email on file, skip silently

        // Fetch tenant info for branding
        const { data: tenant } = await supabaseAdmin
          .from('tenants')
          .select('business_name, bsp_registration_no')
          .eq('id', req.tenantId)
          .single();

        // Fetch branch info
        const { data: branch } = await supabaseAdmin
          .from('branches')
          .select('branch_name')
          .eq('id', req.branchId || item.branch_id)
          .single();

        // Generate PDF
        const pdfBuffer = await generatePawnTicketPdf({
          ticket,
          item,
          businessName: tenant?.business_name || 'Pawnshop',
          branchName: branch?.branch_name || '',
          bspRegNo: tenant?.bsp_registration_no || '',
        });

        // Send email
        await sendDisbursementEmail({
          to: customer.email,
          customerName: `${customer.first_name} ${customer.last_name}`,
          ticket: {
            ticket_number: loanTerms.ticket_number,
            principal_loan: loanTerms.principal_loan,
            interest_rate: loanTerms.interest_rate,
            advance_interest: loanTerms.advance_interest,
            service_charge: loanTerms.service_charge,
            net_proceeds: loanTerms.net_proceeds,
            loan_date: loanTerms.loan_date,
            maturity_date: loanTerms.maturity_date,
            expiry_date: loanTerms.expiry_date,
            item_description: [item.brand, item.model, item.general_desc].filter(Boolean).join(' — ') || item.category,
            category: item.category,
          },
          businessName: tenant?.business_name || 'Pawnshop',
          branchName: branch?.branch_name || '',
          pdfBuffer,
        });
      } catch (emailErr) {
        console.error('Failed to send disbursement email:', emailErr.message);
      }
    })();

    logTenantAudit(req, {
      action: 'TICKET_ISSUED', category: 'LOAN',
      description: `Issued pawn ticket ${ticket.ticket_number} — ₱${Number(ticket.principal_loan).toLocaleString()}`,
      target_type: 'pawn_ticket', target_id: ticket.id,
    });

    res.status(201).json({ ticket, transaction: transaction || null });
  } catch (err) {
    console.error('[appraisals] issue error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}));

// POST /api/appraisals/:id/reject — Manager rejects
router.post('/:id/reject', async (req, res) => {
  if (!isValidUuid(req.params.id)) return res.status(422).json({ error: 'Invalid item id' });
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can reject appraisals' });
  }

  const { reason } = req.body;

  try {
    const { data, error } = await supabaseAdmin
      .from('pawn_items')
      .update({
        inventory_status: 'PENDING_APPRAISAL',
        condition_notes: reason?.trim() || 'Rejected by manager',
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .eq('inventory_status', 'APPRAISED')
      .select()
      .single();

    if (error || !data) return res.status(400).json({ error: 'Unable to reject appraisal.' });

    // Update assessment outcome
    await supabaseAdmin
      .from('appraisal_assessments')
      .update({ outcome: 'REJECTED' })
      .eq('item_id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .eq('outcome', 'PENDING');

    logTenantAudit(req, {
      action: 'APPRAISAL_REJECTED', category: 'APPRAISAL',
      description: `Rejected appraisal for item`,
      target_type: 'pawn_item', target_id: req.params.id,
    });

    res.json(data);
  } catch (err) {
    console.error('[appraisals] reject error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/appraisals/:id/decline — Customer declined the offer
router.post('/:id/decline', async (req, res) => {
  if (!isValidUuid(req.params.id)) return res.status(422).json({ error: 'Invalid item id' });
  if (!['OWNER', 'MANAGER', 'CASHIER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const { reason } = req.body;

  try {
    const { data, error } = await supabaseAdmin
      .from('pawn_items')
      .update({
        inventory_status: 'PENDING_APPRAISAL',
        condition_notes: reason?.trim() || 'Customer declined the offer',
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .in('inventory_status', ['APPRAISED', 'APPRAISED'])
      .select()
      .single();

    if (error || !data) return res.status(400).json({ error: 'Unable to decline. Item must be in APPRAISED or APPRAISED state.' });

    // Update assessment outcome
    await supabaseAdmin
      .from('appraisal_assessments')
      .update({ outcome: 'DECLINED' })
      .eq('item_id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .in('outcome', ['PENDING', 'APPROVED']);

    logTenantAudit(req, {
      action: 'APPRAISAL_DECLINED', category: 'APPRAISAL',
      description: `Declined appraisal for item`,
      target_type: 'pawn_item', target_id: req.params.id,
    });

    res.json(data);
  } catch (err) {
    console.error('[appraisals] decline error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/appraisals/:id/assessments — Assessment history for an item
router.get('/:id', async (req, res) => {
  if (!isValidUuid(req.params.id)) return res.status(422).json({ error: 'Invalid item id' });

  try {
    const { data, error } = await supabaseAdmin
      .from('pawn_items')
      .select('*, customers(id, first_name, last_name, email, mobile_number)')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    if (error || !data) return res.status(404).json({ error: 'Item not found.' });
    res.json(data);
  } catch (err) {
    console.error('[appraisals] get item error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/assessments', async (req, res) => {
  if (!isValidUuid(req.params.id)) return res.status(422).json({ error: 'Invalid item id' });

  try {
    const { data, error } = await supabaseAdmin
      .from('appraisal_assessments')
      .select('*')
      .eq('item_id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: 'Unable to fetch assessments.' });
    res.json(data || []);
  } catch (err) {
    console.error('[appraisals] assessments error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
