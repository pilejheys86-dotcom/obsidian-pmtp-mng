import { useState, useEffect, useRef } from 'react';
import { Sidebar, Header, SettingsNav } from '../../components/layout';
import { getNavigationByRole } from '../../config';
import { useTheme, useAuth } from '../../context';
import { authApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';

function buildSidebarUser(profile) {
  const name = profile?.full_name || 'User';
  const parts = name.split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { name, role: profile?.role || '', initials };
}

const SECTIONS = [
  { id: 'account',     label: 'Account',     icon: 'person'   },
  { id: 'security',    label: 'Security',    icon: 'shield'   },
  { id: 'preferences', label: 'Preferences', icon: 'tune'     },
];

const TIMEOUT_OPTIONS = [
  { value: '5',  label: '5 minutes'  },
  { value: '10', label: '10 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour'     },
  { value: '0',  label: 'Never'      },
];

// ── Shared form components ──────────────────────────────────────────────────
const AccountRow = ({ label, value, buttonText, onClick, danger = false }) => (
  <div className="account-row">
    <div className="flex-1">
      <p className={`text-sm font-medium ${danger ? 'text-red-400' : 'text-neutral-800 dark:text-neutral-200'}`}>{label}</p>
      {value && <p className="text-sm text-neutral-500 dark:text-neutral-400">{value}</p>}
    </div>
    {buttonText && (
      <button onClick={onClick} className={`account-row-btn ${danger ? 'text-red-400 border-red-400/30 hover:bg-red-500/10' : ''}`}>
        {buttonText}
      </button>
    )}
  </div>
);

const EditableRow = ({ label, value, field, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (draft.trim() === (value || '')) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(field, draft.trim()); setEditing(false); }
    catch { /* keep open */ }
    finally { setSaving(false); }
  };

  const handleCancel = () => { setDraft(value || ''); setEditing(false); };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  };

  if (editing) {
    return (
      <div className="account-row">
        <div className="flex-1">
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-2">{label}</p>
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            className="profile-input w-full max-w-sm"
            autoFocus
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving}
            className="account-row-btn !bg-neutral-900 !text-white dark:!bg-white dark:!text-neutral-900">
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={handleCancel} className="account-row-btn">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <AccountRow
      label={label}
      value={value || 'Not set'}
      buttonText={`Change ${label.toLowerCase()}`}
      onClick={() => { setDraft(value || ''); setEditing(true); }}
    />
  );
};

const ToggleRow = ({ label, description, checked, onChange }) => (
  <div className="account-row">
    <div className="flex-1">
      <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{label}</p>
      {description && <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">{description}</p>}
    </div>
    <label className="toggle-switch-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="toggle-checkbox" />
      <span className="toggle-slider-sm" />
    </label>
  </div>
);

// ── Change Password Form ───────────────────────────────────────────────────
const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: pw => pw.length >= 8 },
  { label: 'Uppercase letter',      test: pw => /[A-Z]/.test(pw) },
  { label: 'Lowercase letter',      test: pw => /[a-z]/.test(pw) },
  { label: 'Number',                test: pw => /\d/.test(pw) },
  { label: 'Special character',     test: pw => /[^A-Za-z0-9]/.test(pw) },
];

const PasswordInput = ({ label, value, onChange, show, onToggle }) => (
  <div>
    <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">{label}</label>
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="profile-input w-full pr-10"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        tabIndex={-1}
      >
        <span className="material-symbols-outlined text-lg">{show ? 'visibility_off' : 'visibility'}</span>
      </button>
    </div>
  </div>
);

const ChangePasswordForm = ({ email, onDone }) => {
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const ruleResults = PASSWORD_RULES.map(r => ({ ...r, met: r.test(newPw) }));
  const allRulesMet = ruleResults.every(r => r.met);
  const passwordsMatch = newPw === confirm;
  const sameAsCurrent = current && newPw && current === newPw;
  const canSubmit = current && newPw && confirm && allRulesMet && passwordsMatch && !sameAsCurrent;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError('');
    setSaving(true);

    try {
      // Step 1: Re-authenticate with current password
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: current });
      if (signInErr) {
        setError('Current password is incorrect');
        setSaving(false);
        return;
      }

      // Step 2: Update password via Supabase (invalidates other sessions automatically)
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) {
        const msg = updateErr.message?.toLowerCase() || '';
        if (msg.includes('same') || msg.includes('different')) {
          setError('New password must be different from your current password');
        } else if (msg.includes('weak') || msg.includes('strength')) {
          setError('Password does not meet security requirements');
        } else {
          setError('Failed to update password. Please try again.');
        }
        setSaving(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div className="py-5 border-b border-neutral-200/60 dark:border-neutral-800/60">
        <div className="flex items-center gap-2 p-3 rounded-sm bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 text-green-600 dark:text-green-400 text-sm">
          <span className="material-symbols-outlined text-base">check_circle</span>
          Password updated successfully
        </div>
      </div>
    );
  }

  return (
    <div className="py-5 border-b border-neutral-200/60 dark:border-neutral-800/60">
      <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-4">Change Password</p>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 text-sm">
          <span className="material-symbols-outlined text-base">error</span>
          {error}
        </div>
      )}

      <div className="space-y-4 max-w-sm">
        <PasswordInput label="Current Password" value={current} onChange={setCurrent} show={showCurrent} onToggle={() => setShowCurrent(v => !v)} />

        <div>
          <PasswordInput label="New Password" value={newPw} onChange={setNewPw} show={showNew} onToggle={() => setShowNew(v => !v)} />
          {newPw && (
            <div className="mt-2 space-y-0.5">
              {ruleResults.map(r => (
                <div key={r.label} className="flex items-center gap-1.5 text-xs">
                  <span className={`material-symbols-outlined text-sm ${r.met ? 'text-green-500' : 'text-neutral-400 dark:text-neutral-600'}`}>
                    {r.met ? 'check_circle' : 'circle'}
                  </span>
                  <span className={r.met ? 'text-green-600 dark:text-green-400' : 'text-neutral-500 dark:text-neutral-500'}>{r.label}</span>
                </div>
              ))}
            </div>
          )}
          {sameAsCurrent && (
            <p className="text-xs text-red-500 mt-1.5">New password must be different from current password</p>
          )}
        </div>

        <div>
          <PasswordInput label="Confirm New Password" value={confirm} onChange={setConfirm} show={showConfirm} onToggle={() => setShowConfirm(v => !v)} />
          {confirm && !passwordsMatch && (
            <p className="text-xs text-red-500 mt-1.5">Passwords don't match</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-5">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || saving}
          className="account-row-btn !bg-neutral-900 !text-white dark:!bg-white dark:!text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Updating...' : 'Update password'}
        </button>
        <button onClick={onDone} disabled={saving} className="account-row-btn">Cancel</button>
      </div>
    </div>
  );
};

// ── Page ───────────────────────────────────────────────────────────────────
const ProfilePage = () => {
  const { isDarkMode, toggleTheme } = useTheme();
  const { profile, fetchProfile, user, inactivityMinutes, setInactivityTimeout } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  const currentUser = buildSidebarUser(profile);
  const navigation = getNavigationByRole(profile?.role);
  const [currentPath, setCurrentPath] = useState('/admin/profile');
  const [activeSection, setActiveSection] = useState('account');
  const [preferences, setPreferences] = useState(() => ({
    compactSidebar: false,
    hideOperations: localStorage.getItem('pref_hide_operations') === 'true',
  }));
  const sectionRefs = useRef({});

  // IntersectionObserver — keeps active nav item in sync while scrolling
  useEffect(() => {
    const observers = [];
    SECTIONS.forEach(({ id }) => {
      const el = sectionRefs.current[id];
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach(o => o.disconnect());
  }, []);

  const scrollTo = (id) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleFieldSave = async (field, value) => {
    await authApi.updateProfile({ [field]: value });
    await fetchProfile();
  };

  return (
    <div className="admin-layout">
      {/* Main sidebar */}
      <Sidebar
        navigation={navigation}
        currentPath={currentPath}
        onNavigate={setCurrentPath}
      />

      {/* Secondary settings nav — sits between sidebar and content */}
      <SettingsNav
        items={SECTIONS}
        activeId={activeSection}
        onSelect={scrollTo}
        title="Account Settings"
      />

      {/* Main content */}
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
          <div className="max-w-2xl mx-auto md:px-8 md:py-6">

            <section ref={el => sectionRefs.current['account'] = el} id="account" className="scroll-mt-6">
              <h2 className="text-base font-bold text-neutral-800 dark:text-neutral-100 pb-4">Account</h2>
              <div className="account-row">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-10 h-10 rounded-full bg-neutral-600 flex items-center justify-center overflow-hidden">
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
                      : <span className="text-sm font-bold text-white">{currentUser.initials}</span>}
                  </div>
                  <span className="text-sm text-neutral-800 dark:text-neutral-200">{profile?.full_name || 'User'}</span>
                </div>
              </div>
              <EditableRow label="Full Name" value={profile?.full_name} field="full_name" onSave={handleFieldSave} />
              <AccountRow label="Email" value={profile?.email || 'Not set'} />
              <EditableRow label="Phone" value={profile?.phone_number} field="phone_number" onSave={handleFieldSave} />
              <AccountRow label="Role" value={profile?.role || 'Unknown'} />
            </section>

            <section ref={el => sectionRefs.current['security'] = el} id="security" className="scroll-mt-6 mt-10">
              <h2 className="text-base font-bold text-neutral-800 dark:text-neutral-100 pb-4">Security</h2>
              {changingPassword ? (
                <ChangePasswordForm email={user?.email} onDone={() => setChangingPassword(false)} />
              ) : (
                <AccountRow label="Password" value="••••••••" buttonText="Change password" onClick={() => setChangingPassword(true)} />
              )}
              <div className="account-row">
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Auto sign-out</p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">Automatically sign out after a period of inactivity</p>
                </div>
                <select
                  value={String(inactivityMinutes)}
                  onChange={e => setInactivityTimeout(e.target.value)}
                  className="profile-select w-auto"
                >
                  {TIMEOUT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </section>

            <section ref={el => sectionRefs.current['preferences'] = el} id="preferences" className="scroll-mt-6 mt-10">
              <h2 className="text-base font-bold text-neutral-800 dark:text-neutral-100 pb-4">Preferences</h2>
              <ToggleRow
                label="Dark Mode"
                description="Use dark theme across the application"
                checked={isDarkMode}
                onChange={toggleTheme}
              />
              <ToggleRow
                label="Compact Sidebar"
                description="Use a narrower sidebar for more content space"
                checked={preferences.compactSidebar}
                onChange={() => setPreferences(p => ({ ...p, compactSidebar: !p.compactSidebar }))}
              />
              {profile?.role === 'OWNER' && (
                <ToggleRow
                  label="Show Operations"
                  description="Show the Operations section (Appraisals, Loans, Inventory, etc.) in the sidebar"
                  checked={!preferences.hideOperations}
                  onChange={() => {
                    setPreferences(p => {
                      const next = !p.hideOperations;
                      localStorage.setItem('pref_hide_operations', next);
                      window.dispatchEvent(new Event('pref_change'));
                      return { ...p, hideOperations: next };
                    });
                  }}
                />
              )}
            </section>

          </div>
        </div>
      </main>
    </div>
  );
};

export default ProfilePage;
