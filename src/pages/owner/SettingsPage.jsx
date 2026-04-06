import { useState, useEffect } from 'react';
import { Sidebar, Header } from '../../components/layout';
import { getNavigationByRole } from '../../config';
import { useTheme, useAuth } from '../../context';
import { brandingApi } from '../../lib/api';

const SHOWCASE_BASE = import.meta.env.VITE_SHOWCASE_URL || window.location.origin;

// Build sidebar user object from auth profile
function buildSidebarUser(profile) {
  const name = profile?.full_name || 'User';
  const parts = name.split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { name, role: profile?.role || '', initials };
}

// Toggle Switch Component
const ToggleSwitch = ({ id, checked, onChange, label, description, icon }) => (
  <div className="profile-toggle-item">
    <div className="flex items-center gap-3">
      <div className="profile-toggle-icon">
        <span className="material-symbols-outlined text-xl">{icon}</span>
      </div>
      <div>
        <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">{label}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
      </div>
    </div>
    <label className="toggle-switch">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        className="toggle-checkbox"
      />
      <span className="toggle-slider"></span>
    </label>
  </div>
);

// Settings categories (branding is role-gated below)
const baseCategories = [
  { icon: 'palette', label: 'Appearance', id: 'appearance' },
  { icon: 'notifications_active', label: 'Notifications', id: 'notifications' },
  { icon: 'security', label: 'Security', id: 'security' },
  { icon: 'backup', label: 'Backup & Data', id: 'backup' },
  { icon: 'integration_instructions', label: 'Integrations', id: 'integrations' },
];
const brandingCategory = { icon: 'language', label: 'Branding', id: 'branding' };

const SettingsPage = () => {
  const { isDarkMode, toggleTheme } = useTheme();
  const { profile } = useAuth();
  const currentUser = buildSidebarUser(profile);
  const navigation = getNavigationByRole(profile?.role);
  const canManageBranding = ['OWNER', 'MANAGER'].includes(profile?.role);
  const settingsCategories = canManageBranding
    ? [baseCategories[0], brandingCategory, ...baseCategories.slice(1)]
    : baseCategories;
  const [currentPath, setCurrentPath] = useState('/admin/settings');
  const [activeCategory, setActiveCategory] = useState('appearance');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Settings state
  const [settings, setSettings] = useState({
    compactSidebar: false,
    animationsEnabled: true,
    autoSave: true,
    emailNotifications: true,
    pushNotifications: false,
    desktopAlerts: true,
    soundEffects: false,
    twoFactorAuth: false,
    sessionTimeout: '30',
    autoBackup: true,
    backupFrequency: 'daily',
  });

  // Branding state
  const [branding, setBranding] = useState({
    subdomain: '',
    tagline: '',
    is_published: false,
  });
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingMessage, setBrandingMessage] = useState(null);
  const [subdomainStatus, setSubdomainStatus] = useState(null);
  const [subdomainChecking, setSubdomainChecking] = useState(false);

  // Load branding on mount
  useEffect(() => {
    if (activeCategory === 'branding') {
      setBrandingLoading(true);
      brandingApi.get()
        .then(data => {
          if (data) {
            setBranding({
              subdomain: data.subdomain || '',
              tagline: data.tagline || '',
              is_published: data.is_published || false,
            });
          }
        })
        .catch(() => {})
        .finally(() => setBrandingLoading(false));
    }
  }, [activeCategory]);

  // Debounced subdomain check
  useEffect(() => {
    if (!branding.subdomain || branding.subdomain.length < 3) {
      setSubdomainStatus(null);
      return;
    }
    setSubdomainChecking(true);
    const timer = setTimeout(() => {
      brandingApi.checkSubdomain(branding.subdomain)
        .then(setSubdomainStatus)
        .catch(() => setSubdomainStatus(null))
        .finally(() => setSubdomainChecking(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [branding.subdomain]);

  // Save branding
  const handleBrandingSave = async () => {
    setBrandingSaving(true);
    setBrandingMessage(null);
    try {
      await brandingApi.update(branding);
      setBrandingMessage({ type: 'success', text: 'Branding saved successfully!' });
    } catch (err) {
      setBrandingMessage({ type: 'error', text: err.message });
    } finally {
      setBrandingSaving(false);
    }
  };

  const handleBrandingChange = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setBranding(prev => ({ ...prev, [key]: value }));
  };

  const handleNavigate = (path, item) => {
    setCurrentPath(path);
  };

  const handleSettingChange = (key) => () => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectChange = (key) => (e) => {
    setSettings(prev => ({ ...prev, [key]: e.target.value }));
  };

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <Sidebar
        navigation={navigation}
        currentPath={currentPath}
        onNavigate={handleNavigate}
      />

      {/* Main Content */}
      <main className="admin-main">
        <Header user={currentUser} />

        {/* Settings Content */}
        <div className="admin-content custom-scrollbar">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Left Sidebar - Categories */}
              <div className="w-full lg:w-1/4 space-y-6">
                <nav className="sub-nav">
                  {settingsCategories.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveCategory(item.id)}
                      className={`sub-nav-link ${activeCategory === item.id ? 'active' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-xl">{item.icon}</span>
                        {item.label}
                      </div>
                      {activeCategory === item.id && (
                        <span className="material-symbols-outlined text-lg">chevron_right</span>
                      )}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Right Content - Settings */}
              <div className="w-full lg:w-3/4 space-y-6">
                {/* Appearance Settings */}
                {activeCategory === 'appearance' && (
                  <div className="profile-section">
                    <div className="profile-section-header">
                      <div className="profile-section-icon">
                        <span className="material-symbols-outlined">palette</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">
                          Appearance
                        </h3>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                          Customize how the application looks.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <ToggleSwitch
                        id="dark-mode"
                        icon="dark_mode"
                        label="Dark Mode"
                        description="Switch to a dark color theme for reduced eye strain"
                        checked={isDarkMode}
                        onChange={toggleTheme}
                      />
                      <ToggleSwitch
                        id="compact-sidebar"
                        icon="view_sidebar"
                        label="Compact Sidebar"
                        description="Use a narrower sidebar for more content space"
                        checked={settings.compactSidebar}
                        onChange={handleSettingChange('compactSidebar')}
                      />
                      <ToggleSwitch
                        id="animations"
                        icon="animation"
                        label="Enable Animations"
                        description="Show smooth transitions and animations"
                        checked={settings.animationsEnabled}
                        onChange={handleSettingChange('animationsEnabled')}
                      />
                    </div>
                  </div>
                )}

                {/* Branding Settings */}
                {activeCategory === 'branding' && (
                  <div className="profile-section">
                    <div className="profile-section-header">
                      <div className="profile-section-icon">
                        <span className="material-symbols-outlined">language</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">
                          Business Branding
                        </h3>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                          Configure your public showcase page and app download link.
                        </p>
                      </div>
                    </div>

                    {brandingLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Subdomain */}
                        <div>
                          <label className="form-label">Subdomain</label>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                              {SHOWCASE_BASE}/s/
                            </span>
                            <input
                              type="text"
                              className="profile-input flex-1"
                              placeholder="your-business"
                              value={branding.subdomain}
                              onChange={handleBrandingChange('subdomain')}
                              maxLength={63}
                            />
                          </div>
                          {subdomainChecking && (
                            <p className="text-xs text-neutral-400 mt-1">Checking availability...</p>
                          )}
                          {subdomainStatus && !subdomainChecking && (
                            <p className={`text-xs mt-1 ${subdomainStatus.available ? 'text-emerald-600' : 'text-red-500'}`}>
                              {subdomainStatus.available ? 'Available!' : subdomainStatus.reason || 'Taken'}
                            </p>
                          )}
                        </div>

                        {/* Tagline */}
                        <div>
                          <label className="form-label">Tagline</label>
                          <input
                            type="text"
                            className="profile-input"
                            placeholder="Your trusted pawnshop since 1995"
                            value={branding.tagline}
                            onChange={handleBrandingChange('tagline')}
                            maxLength={255}
                          />
                          <p className="text-xs text-neutral-400 mt-1">{branding.tagline.length}/255</p>
                        </div>

                        {/* Publish Toggle */}
                        <ToggleSwitch
                          id="publish-showcase"
                          icon="public"
                          label="Publish Showcase"
                          description={
                            branding.subdomain && branding.is_published
                              ? `Live at ${SHOWCASE_BASE}/s/${branding.subdomain}`
                              : 'Make your showcase page publicly accessible'
                          }
                          checked={branding.is_published}
                          onChange={handleBrandingChange('is_published')}
                        />

                        {/* Preview Link */}
                        {branding.subdomain && branding.is_published && (
                          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-sm border border-emerald-200 dark:border-emerald-800">
                            <p className="text-sm text-emerald-800 dark:text-emerald-300">
                              Your showcase is live at{' '}
                              <a
                                href={`${SHOWCASE_BASE}/s/${branding.subdomain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-bold underline"
                              >
                                {SHOWCASE_BASE}/s/{branding.subdomain}
                              </a>
                            </p>
                          </div>
                        )}

                        {/* Save button + message */}
                        {brandingMessage && (
                          <p className={`text-sm ${brandingMessage.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                            {brandingMessage.text}
                          </p>
                        )}
                        <button
                          className="btn-primary"
                          onClick={handleBrandingSave}
                          disabled={brandingSaving}
                        >
                          {brandingSaving ? 'Saving...' : 'Save Branding'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Notification Settings */}
                {activeCategory === 'notifications' && (
                  <div className="profile-section">
                    <div className="profile-section-header">
                      <div className="profile-section-icon">
                        <span className="material-symbols-outlined">notifications_active</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">
                          Notifications
                        </h3>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                          Control how you receive alerts and notifications.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <ToggleSwitch
                        id="email-notifications"
                        icon="mail"
                        label="Email Notifications"
                        description="Receive important updates via email"
                        checked={settings.emailNotifications}
                        onChange={handleSettingChange('emailNotifications')}
                      />
                      <ToggleSwitch
                        id="push-notifications"
                        icon="smartphone"
                        label="Push Notifications"
                        description="Receive push notifications on mobile devices"
                        checked={settings.pushNotifications}
                        onChange={handleSettingChange('pushNotifications')}
                      />
                      <ToggleSwitch
                        id="desktop-alerts"
                        icon="desktop_windows"
                        label="Desktop Alerts"
                        description="Show notification popups on desktop"
                        checked={settings.desktopAlerts}
                        onChange={handleSettingChange('desktopAlerts')}
                      />
                      <ToggleSwitch
                        id="sound-effects"
                        icon="volume_up"
                        label="Sound Effects"
                        description="Play sounds for notifications"
                        checked={settings.soundEffects}
                        onChange={handleSettingChange('soundEffects')}
                      />
                    </div>
                  </div>
                )}

                {/* Security Settings */}
                {activeCategory === 'security' && (
                  <div className="profile-section">
                    <div className="profile-section-header">
                      <div className="profile-section-icon">
                        <span className="material-symbols-outlined">security</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">
                          Security
                        </h3>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                          Manage your security preferences.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <ToggleSwitch
                        id="two-factor"
                        icon="verified_user"
                        label="Two-Factor Authentication"
                        description="Add an extra layer of security to your account"
                        checked={settings.twoFactorAuth}
                        onChange={handleSettingChange('twoFactorAuth')}
                      />
                      <div className="profile-toggle-item">
                        <div className="flex items-center gap-3">
                          <div className="profile-toggle-icon">
                            <span className="material-symbols-outlined text-xl">timer</span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Session Timeout</p>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">Automatically log out after inactivity</p>
                          </div>
                        </div>
                        <select
                          value={settings.sessionTimeout}
                          onChange={handleSelectChange('sessionTimeout')}
                          className="profile-select w-32"
                        >
                          <option value="15">15 minutes</option>
                          <option value="30">30 minutes</option>
                          <option value="60">1 hour</option>
                          <option value="120">2 hours</option>
                          <option value="never">Never</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* Password Change Section */}
                    <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-700">
                      <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-4">
                        Change Password
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="form-label">Current Password</label>
                          <input type="password" className="profile-input" placeholder="" />
                        </div>
                        <div></div>
                        <div>
                          <label className="form-label">New Password</label>
                          <input type="password" className="profile-input" placeholder="" />
                        </div>
                        <div>
                          <label className="form-label">Confirm New Password</label>
                          <input type="password" className="profile-input" placeholder="" />
                        </div>
                      </div>
                      <button className="btn-primary mt-4">
                        Update Password
                      </button>
                    </div>
                  </div>
                )}

                {/* Backup & Data Settings */}
                {activeCategory === 'backup' && (
                  <div className="profile-section">
                    <div className="profile-section-header">
                      <div className="profile-section-icon">
                        <span className="material-symbols-outlined">backup</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">
                          Backup & Data
                        </h3>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                          Manage data backups and exports.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <ToggleSwitch
                        id="auto-backup"
                        icon="cloud_upload"
                        label="Automatic Backup"
                        description="Automatically backup data to cloud storage"
                        checked={settings.autoBackup}
                        onChange={handleSettingChange('autoBackup')}
                      />
                      <div className="profile-toggle-item">
                        <div className="flex items-center gap-3">
                          <div className="profile-toggle-icon">
                            <span className="material-symbols-outlined text-xl">schedule</span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Backup Frequency</p>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">How often to create backups</p>
                          </div>
                        </div>
                        <select
                          value={settings.backupFrequency}
                          onChange={handleSelectChange('backupFrequency')}
                          className="profile-select w-32"
                        >
                          <option value="hourly">Hourly</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* Manual Actions */}
                    <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-700">
                      <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-4">
                        Manual Actions
                      </h4>
                      <div className="flex flex-wrap gap-3">
                        <button className="btn-outline flex items-center gap-2">
                          <span className="material-symbols-outlined text-lg">cloud_download</span>
                          Export Data
                        </button>
                        <button className="btn-outline flex items-center gap-2">
                          <span className="material-symbols-outlined text-lg">upload</span>
                          Import Data
                        </button>
                        <button className="btn-outline flex items-center gap-2">
                          <span className="material-symbols-outlined text-lg">backup</span>
                          Backup Now
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Integrations Settings */}
                {activeCategory === 'integrations' && (
                  <div className="profile-section">
                    <div className="profile-section-header">
                      <div className="profile-section-icon">
                        <span className="material-symbols-outlined">integration_instructions</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">
                          Integrations
                        </h3>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                          Connect with third-party services.
                        </p>
                      </div>
                    </div>
                    
                    {/* Integration Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* SMS Service */}
                      <div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-sm">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-sm flex items-center justify-center">
                              <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400">sms</span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">SMS Service</p>
                              <p className="text-xs text-emerald-600 dark:text-emerald-400">Connected</p>
                            </div>
                          </div>
                          <button className="btn-outline text-xs px-3 py-1.5">Configure</button>
                        </div>
                      </div>
                      
                      {/* Email Service */}
                      <div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-sm">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-sm flex items-center justify-center">
                              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">mail</span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Email Service</p>
                              <p className="text-xs text-emerald-600 dark:text-emerald-400">Connected</p>
                            </div>
                          </div>
                          <button className="btn-outline text-xs px-3 py-1.5">Configure</button>
                        </div>
                      </div>
                      
                      {/* Payment Gateway */}
                      <div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-sm">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-sm flex items-center justify-center">
                              <span className="material-symbols-outlined text-purple-600 dark:text-purple-400">credit_card</span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Payment Gateway</p>
                              <p className="text-xs text-neutral-500 dark:text-neutral-400">Not connected</p>
                            </div>
                          </div>
                          <button className="btn-primary text-xs px-3 py-1.5">Connect</button>
                        </div>
                      </div>
                      
                      {/* Accounting Software */}
                      <div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-sm">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-sm flex items-center justify-center">
                              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">calculate</span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Accounting</p>
                              <p className="text-xs text-neutral-500 dark:text-neutral-400">Not connected</p>
                            </div>
                          </div>
                          <button className="btn-primary text-xs px-3 py-1.5">Connect</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;
