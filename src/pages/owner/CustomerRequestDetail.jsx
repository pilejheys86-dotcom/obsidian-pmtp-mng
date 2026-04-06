import { useState, useEffect } from 'react';
import { Sidebar, Header } from '../../components/layout';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';
import { accessRequestsApi } from '../../lib/api';

function buildSidebarUser(profile) {
  const name = profile?.full_name || 'User';
  const parts = name.split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { name, role: profile?.role || '', initials };
}

const STATUS_CONFIG = {
  PENDING:  { label: 'Pending',  color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  APPROVED: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const CustomerRequestDetail = ({ requestId }) => {
  const { profile } = useAuth();
  const currentUser = buildSidebarUser(profile);
  const navigation  = getNavigationByRole(profile?.role);
  const canAction   = ['OWNER', 'MANAGER'].includes(profile?.role);

  const [req, setReq]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing]   = useState(null);
  const [notes, setNotes]     = useState('');
  const [message, setMessage] = useState(null);

  const navigate = (path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };

  useEffect(() => {
    if (!requestId) return;
    accessRequestsApi.get(requestId)
      .then(setReq)
      .catch(() => setMessage({ type: 'error', text: 'Failed to load request.' }))
      .finally(() => setLoading(false));
  }, [requestId]);

  const handleApprove = async () => {
    setActing('approve'); setMessage(null);
    try {
      const updated = await accessRequestsApi.approve(requestId);
      setReq(updated);
      setMessage({ type: 'success', text: 'Request approved. Welcome email sent to customer.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setActing(null);
    }
  };

  const handleReject = async () => {
    setActing('reject'); setMessage(null);
    try {
      const updated = await accessRequestsApi.reject(requestId, notes);
      setReq(updated);
      setMessage({ type: 'success', text: 'Request rejected.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setActing(null);
    }
  };

  const statusCfg = req ? (STATUS_CONFIG[req.status] || STATUS_CONFIG.PENDING) : null;

  return (
    <div className="admin-layout">
      <Sidebar navigation={navigation} currentPath="/admin/customers" onNavigate={() => {}} />
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/admin/customers')}
              className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 mb-5 transition-colors">
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Back to Customers
            </button>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
              </div>
            ) : !req ? (
              <div className="profile-section text-center py-10">
                <p className="text-neutral-500">Request not found.</p>
              </div>
            ) : (
              <div className="profile-section">
                <div className="profile-section-header">
                  <div className="profile-section-icon">
                    <span className="material-symbols-outlined">person_add</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Access Request</h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      Submitted {new Date(req.requested_at).toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' })}
                    </p>
                  </div>
                  <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${statusCfg.color}`}>{statusCfg.label}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  {[
                    { label: 'Full Name',     value: req.full_name },
                    { label: 'Email',         value: req.email },
                    { label: 'Mobile Number', value: req.mobile_number || '—' },
                    { label: 'Status',        value: req.status },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-neutral-50 dark:bg-neutral-800/50 rounded-sm p-3 border border-neutral-200 dark:border-neutral-700">
                      <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">{label}</p>
                      <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 break-all">{value}</p>
                    </div>
                  ))}
                </div>

                {req.notes && (
                  <div className="mt-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-sm p-3 border border-neutral-200 dark:border-neutral-700">
                    <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">Staff Notes</p>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">{req.notes}</p>
                  </div>
                )}

                {canAction && req.status === 'PENDING' && (
                  <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-700 space-y-4">
                    <div>
                      <label className="form-label">Notes <span className="text-neutral-400 font-normal">(optional)</span></label>
                      <textarea className="profile-input resize-none" rows={3} value={notes}
                        onChange={e => setNotes(e.target.value)} placeholder="Add a note before approving or rejecting..." />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={handleApprove} disabled={acting !== null}
                        className="btn-primary flex items-center gap-2 text-sm">
                        {acting === 'approve' ? 'Approving...' : <><span className="material-symbols-outlined text-base">check_circle</span> Approve</>}
                      </button>
                      <button onClick={handleReject} disabled={acting !== null}
                        className="btn-outline flex items-center gap-2 text-sm text-red-500 border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/20">
                        {acting === 'reject' ? 'Rejecting...' : <><span className="material-symbols-outlined text-base">cancel</span> Reject</>}
                      </button>
                    </div>
                  </div>
                )}

                {message && (
                  <p className={`text-sm mt-4 ${message.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>{message.text}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default CustomerRequestDetail;
