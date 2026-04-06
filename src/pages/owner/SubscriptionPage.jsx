import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sidebar, Header } from '../../components/layout';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';
import { subscriptionsApi, brandingApi } from '../../lib/api';

const PLANS = [
  {
    id: 'STARTER',
    name: 'Starter',
    monthlyPrice: 1499,
    yearlyPrice: 14999,
    description: 'Perfect for single-branch pawnshops getting started.',
    features: ['1 Branch', 'Up to 500 Loans', '3 Employee Accounts', 'Basic Reports', 'Email Support'],
    icon: 'rocket_launch',
    color: 'emerald',
  },
  {
    id: 'PROFESSIONAL',
    name: 'Professional',
    monthlyPrice: 2999,
    yearlyPrice: 29999,
    description: 'For growing pawnshops that need more power.',
    features: ['Up to 5 Branches', 'Unlimited Loans', '15 Employee Accounts', 'Advanced Analytics', 'Priority Support', 'Auction Management'],
    icon: 'workspace_premium',
    color: 'blue',
    popular: true,
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    monthlyPrice: 4999,
    yearlyPrice: 49999,
    description: 'For large operations with multiple branches.',
    features: ['Unlimited Branches', 'Unlimited Loans', 'Unlimited Employees', 'Custom Reports', 'Dedicated Support', 'API Access', 'White-label Options'],
    icon: 'diamond',
    color: 'amber',
  },
];

const PAYMENT_METHODS = [
  { id: 'gcash', name: 'GCash', icon: 'account_balance_wallet' },
  { id: 'maya', name: 'Maya', icon: 'credit_card' },
  { id: 'card', name: 'Credit/Debit Card', icon: 'payment' },
  { id: 'grab_pay', name: 'GrabPay', icon: 'smartphone' },
];

// ── Payment Confirmation Modal ────────────────────────────
const PaymentModal = ({ plan, billingCycle, onConfirm, onCancel, loading, error }) => {
  const price = billingCycle === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice;
  const colorMap = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/30' },
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/30' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/30' },
  };
  const c = colorMap[plan.color];

  // Step tracking: 'review' → 'processing' → 'redirecting'
  const step = loading === 'creating' ? 'processing' : loading === 'redirecting' ? 'redirecting' : 'review';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={!loading ? onCancel : undefined}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-sm shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center`}>
              <span className={`material-symbols-outlined text-lg ${c.text}`}>
                {step === 'review' ? 'shopping_cart' : step === 'processing' ? 'sync' : 'open_in_new'}
              </span>
            </div>
            <div>
              <h3 className="text-base font-display font-bold text-neutral-800 dark:text-white">
                {step === 'review' ? 'Confirm Subscription' : step === 'processing' ? 'Creating Checkout...' : 'Redirecting...'}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {step === 'review' ? 'Review your order before payment' : step === 'processing' ? 'Setting up secure payment' : 'Opening PayMongo checkout'}
              </p>
            </div>
          </div>
          {!loading && (
            <button
              onClick={onCancel}
              className="p-1.5 rounded-sm text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Plan Summary */}
          <div className={`p-4 rounded-sm border ${c.border} ${c.bg}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <span className={`material-symbols-outlined ${c.text}`}>{plan.icon}</span>
                <span className="text-sm font-bold text-neutral-800 dark:text-white">{plan.name} Plan</span>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-white/80 dark:bg-neutral-800/80 rounded-full text-neutral-600 dark:text-neutral-300">
                {billingCycle === 'YEARLY' ? 'Annual' : 'Monthly'}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-display font-extrabold text-neutral-800 dark:text-white">
                {'\u20B1'}{price.toLocaleString()}
              </span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                /{billingCycle === 'YEARLY' ? 'year' : 'month'}
              </span>
            </div>
            {billingCycle === 'YEARLY' && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                {'\u20B1'}{Math.round(price / 12).toLocaleString()}/mo billed annually &middot; Save 17%
              </p>
            )}
          </div>

          {/* Order Breakdown */}
          <div className="space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Subtotal</span>
              <span className="text-neutral-800 dark:text-white font-medium">{'\u20B1'}{price.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Tax</span>
              <span className="text-neutral-400 dark:text-neutral-500">Included</span>
            </div>
            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-2.5 flex justify-between">
              <span className="text-sm font-bold text-neutral-800 dark:text-white">Total Due</span>
              <span className="text-lg font-display font-extrabold text-neutral-800 dark:text-white">{'\u20B1'}{price.toLocaleString()}</span>
            </div>
          </div>

          {/* Payment Methods */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2.5">Available Payment Methods</p>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(method => (
                <div
                  key={method.id}
                  className="flex items-center gap-2 px-3 py-2.5 bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/50 rounded-sm"
                >
                  <span className="material-symbols-outlined text-base text-neutral-400">{method.icon}</span>
                  <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">{method.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-sm">
              <span className="material-symbols-outlined text-red-500 text-base">error</span>
              <span className="text-xs font-medium text-red-600 dark:text-red-400">{error}</span>
            </div>
          )}

          {/* Security Note */}
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="material-symbols-outlined text-sm">lock</span>
            <span>Secure checkout powered by PayMongo. You will be redirected to complete payment.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-neutral-200 dark:border-neutral-800 flex gap-3">
          {!loading ? (
            <>
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 text-sm font-semibold rounded-sm border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-[2] py-2.5 flex items-center justify-center gap-2 text-sm font-bold rounded-sm bg-primary hover:bg-primary-hover text-white dark:text-neutral-900 shadow-lg shadow-primary/20 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">lock</span>
                Proceed to Payment
              </button>
            </>
          ) : (
            <div className="w-full py-2.5 flex items-center justify-center gap-2.5 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
              <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
              {step === 'processing' ? 'Creating secure checkout session...' : 'Redirecting to PayMongo...'}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ── Main Subscription Page ────────────────────────────────
const SubscriptionPage = () => {
  const { profile, subscriptionActive, refreshSubscription } = useAuth();
  const navigation = getNavigationByRole(profile?.role);
  const [currentPath] = useState('/admin/subscription');
  const [billingCycle, setBillingCycle] = useState('MONTHLY');
  const [subscription, setSubscription] = useState(null);
  const [fetchingStatus, setFetchingStatus] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');

  // Modal state
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(null); // null | 'creating' | 'redirecting'
  const [checkoutError, setCheckoutError] = useState('');

  const currentUser = {
    name: profile?.full_name || 'Owner',
    role: profile?.role || 'OWNER',
    initials: (profile?.full_name || 'O').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
    email: profile?.email || '',
  };

  // Check URL params for payment status and verify with PayMongo
  const [verifyError, setVerifyError] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const subId = params.get('sub');
    if (status === 'success' && subId) {
      window.history.replaceState({}, '', '/admin/subscription');
      setSuccessMessage('Verifying payment...');
      setVerifyError('');
      subscriptionsApi.verify(subId).then((result) => {
        if (result.verified) {
          setSuccessMessage('Payment successful! Your subscription is now active.');
          refreshSubscription();
        } else {
          setSuccessMessage('');
          setVerifyError('Payment has not been confirmed yet. If you completed payment, it may take a moment to process. Please refresh or try again.');
        }
      }).catch((err) => {
        setSuccessMessage('');
        setVerifyError(err.message || 'Payment verification failed. Please try again or contact support.');
      });
    } else if (status === 'cancelled') {
      window.history.replaceState({}, '', '/admin/subscription');
      setVerifyError('Payment was cancelled. You can try subscribing again when ready.');
    }
  }, [refreshSubscription]);

  // Fetch current subscription
  useEffect(() => {
    const fetchSub = async () => {
      try {
        const data = await subscriptionsApi.get();
        setSubscription(data);
      } catch {
        // No subscription found
      } finally {
        setFetchingStatus(false);
      }
    };
    fetchSub();
  }, [subscriptionActive]);

  // Poll for subscription status after successful verification only (max 20 attempts = 60s)
  useEffect(() => {
    if (!successMessage || verifyError) return;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 20) {
        clearInterval(interval);
        setSuccessMessage('');
        setVerifyError('Subscription activation is taking longer than expected. Please refresh the page.');
        return;
      }
      const active = await refreshSubscription();
      if (active) {
        clearInterval(interval);
        // First-time setup: redirect to wizard if branding not configured
        try {
          const branding = await brandingApi.get();
          const isFirstSetup = !branding || !branding.brand_color;
          if (isFirstSetup) {
            window.history.pushState({}, '', '/admin/branding/setup');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
        } catch {
          // Silently fail — user stays on subscription page
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [successMessage, verifyError, refreshSubscription]);

  const openPaymentModal = (plan) => {
    setSelectedPlan(plan);
    setCheckoutError('');
    setCheckoutLoading(null);
  };

  const closePaymentModal = () => {
    setSelectedPlan(null);
    setCheckoutError('');
    setCheckoutLoading(null);
  };

  const handleConfirmPayment = async () => {
    if (!selectedPlan) return;
    setCheckoutError('');
    setCheckoutLoading('creating');
    try {
      const result = await subscriptionsApi.checkout({
        plan_name: selectedPlan.id,
        billing_cycle: billingCycle,
      });
      setCheckoutLoading('redirecting');
      // Small delay for UX before redirect
      setTimeout(() => {
        window.location.href = result.checkout_url;
      }, 600);
    } catch (err) {
      setCheckoutError(err.message || 'Failed to create checkout session. Please try again.');
      setCheckoutLoading(null);
    }
  };

  const isPaid = subscription?.payment_status === 'PAID';

  return (
    <div className="admin-layout">
      <Sidebar
        navigation={navigation}
        currentPath={currentPath}
      />

      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
          {/* Success Banner */}
          {successMessage && (
            <div className="sub-success-banner">
              <span className="material-symbols-outlined text-emerald-500">check_circle</span>
              <span>{successMessage}</span>
              <button onClick={() => setSuccessMessage('')} className="ml-auto text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          )}

          {/* Payment Error Banner */}
          {verifyError && (
            <div className="flex items-center gap-3 p-4 mb-4 bg-red-500/10 border border-red-500/20 rounded-sm">
              <span className="material-symbols-outlined text-red-500">error</span>
              <span className="text-sm text-red-600 dark:text-red-400">{verifyError}</span>
              <button onClick={() => setVerifyError('')} className="ml-auto text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          )}

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">
              Subscription
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              {subscriptionActive
                ? 'Manage your subscription plan and billing.'
                : 'Choose a plan to unlock all features and start managing your pawnshop.'}
            </p>
          </div>

          {/* Paywall Banner */}
          {!subscriptionActive && !fetchingStatus && (
            <div className="sub-paywall-banner">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <span className="material-symbols-outlined text-amber-500 text-2xl">lock</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-800 dark:text-white">Features Locked</h3>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Subscribe to a plan below to unlock all features. Your data is safe and waiting.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Current Plan Card */}
          {isPaid && subscriptionActive && (
            <div className="sub-current-plan">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                    <span className="material-symbols-outlined text-emerald-500 text-2xl">verified</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-neutral-800 dark:text-white">{subscription?.plan_name} Plan</h3>
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-full">Active</span>
                    </div>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {subscription?.billing_cycle === 'YEARLY' ? 'Annual' : 'Monthly'} billing
                      {subscription?.end_date && ` \u00b7 Renews ${new Date(subscription.end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <span className={`text-sm font-semibold transition-colors ${billingCycle === 'MONTHLY' ? 'text-neutral-800 dark:text-white' : 'text-neutral-400'}`}>Monthly</span>
            <button
              onClick={() => setBillingCycle(b => b === 'MONTHLY' ? 'YEARLY' : 'MONTHLY')}
              className="sub-billing-toggle cursor-pointer"
              aria-label="Toggle billing cycle"
            >
              <div className={`sub-billing-toggle-dot ${billingCycle === 'YEARLY' ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <span className={`text-sm font-semibold transition-colors ${billingCycle === 'YEARLY' ? 'text-neutral-800 dark:text-white' : 'text-neutral-400'}`}>
              Yearly
              <span className="ml-1.5 text-xs font-bold text-emerald-500">Save 17%</span>
            </span>
          </div>

          {/* Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {PLANS.map(plan => {
              const price = billingCycle === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice;
              const isCurrentPlan = isPaid && subscription?.plan_name === plan.id;
              const colorMap = {
                emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/30', ring: 'ring-emerald-500/20' },
                blue: { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/30', ring: 'ring-blue-500/20' },
                amber: { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/30', ring: 'ring-amber-500/20' },
              };
              const c = colorMap[plan.color];

              return (
                <div
                  key={plan.id}
                  className={`sub-plan-card ${plan.popular ? `sub-plan-popular ${c.border}` : ''} ${isCurrentPlan ? `ring-2 ${c.ring}` : ''}`}
                >
                  {plan.popular && (
                    <div className="sub-popular-badge">Most Popular</div>
                  )}

                  {/* Plan Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center`}>
                      <span className={`material-symbols-outlined ${c.text}`}>{plan.icon}</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-neutral-800 dark:text-white">{plan.name}</h3>
                    </div>
                  </div>

                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">{plan.description}</p>

                  {/* Price */}
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-display font-extrabold text-neutral-800 dark:text-white">
                        {'\u20B1'}{price.toLocaleString()}
                      </span>
                      <span className="text-sm text-neutral-400">
                        /{billingCycle === 'YEARLY' ? 'year' : 'month'}
                      </span>
                    </div>
                    {billingCycle === 'YEARLY' && (
                      <p className="text-xs text-neutral-400 mt-1">
                        {'\u20B1'}{Math.round(price / 12).toLocaleString()}/month billed annually
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="space-y-2.5 mb-6 flex-1">
                    {plan.features.map(feature => (
                      <li key={feature} className="flex items-center gap-2.5 text-sm text-neutral-600 dark:text-neutral-300">
                        <span className={`material-symbols-outlined text-base ${c.text}`}>check_circle</span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  {isCurrentPlan ? (
                    <button disabled className="sub-plan-btn-current">
                      <span className="material-symbols-outlined text-lg">check</span>
                      Current Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => openPaymentModal(plan)}
                      className={`sub-plan-btn cursor-pointer ${plan.popular ? 'sub-plan-btn-primary' : 'sub-plan-btn-outline'}`}
                    >
                      {subscriptionActive ? 'Switch Plan' : 'Subscribe Now'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Payment Methods Info */}
          <div className="sub-payment-info">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-neutral-400 text-lg">lock</span>
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Secure Payment via PayMongo</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {['GCash', 'Maya', 'Credit/Debit Card', 'Bank Transfer', 'GrabPay'].map(method => (
                <span key={method} className="sub-payment-method">{method}</span>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Payment Confirmation Modal */}
      {selectedPlan && (
        <PaymentModal
          plan={selectedPlan}
          billingCycle={billingCycle}
          onConfirm={handleConfirmPayment}
          onCancel={closePaymentModal}
          loading={checkoutLoading}
          error={checkoutError}
        />
      )}
    </div>
  );
};

export default SubscriptionPage;
