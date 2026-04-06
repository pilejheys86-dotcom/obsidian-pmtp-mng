import { useState } from 'react'
import { createPortal } from 'react-dom'
import { appraisalsApi } from '../../../lib/api'

const formatCurrency = (val) => {
  const num = Number(val)
  if (isNaN(num)) return '\u20B10.00'
  return `\u20B1${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatDate = (iso) => {
  if (!iso) return '---'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function IssueTicketModal({ item, onClose, onSuccess }) {
  const [remarks, setRemarks] = useState('')
  const [loading, setLoading] = useState(false)

  if (!item || typeof document === 'undefined') return null

  const loanTerms = item.specific_attrs?.loan_terms || {}
  const customerName = item.customers
    ? `${item.customers.first_name} ${item.customers.last_name}`
    : 'Unknown'
  const customerId = item.customers?.id || item.customer_id || ''

  const handleConfirm = async () => {
    try {
      setLoading(true)
      const result = await appraisalsApi.issue(item.id, { remarks })
      onSuccess(result)
    } catch (err) {
      console.error('Issue ticket error:', err)
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-display font-bold text-neutral-800 dark:text-neutral-100">Issue Pawn Ticket</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors">
            <span className="material-symbols-rounded text-xl">close</span>
          </button>
        </div>

        <div className="space-y-5">
          {/* Section 1: Ticket Summary */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700/20 border-b border-neutral-200 dark:border-neutral-700">
              <h3 className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Ticket Summary</h3>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500 dark:text-neutral-400">Customer</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-100">{customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500 dark:text-neutral-400">Customer ID</span>
                <span className="font-mono text-neutral-600 dark:text-neutral-300">{customerId?.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500 dark:text-neutral-400">Item</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-100">{item.general_desc || '---'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500 dark:text-neutral-400">Category / Condition</span>
                <span className="text-neutral-600 dark:text-neutral-300">{item.category} / {item.item_condition}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500 dark:text-neutral-400">Appraised Value</span>
                <span className="font-bold text-primary">{formatCurrency(item.appraised_value)}</span>
              </div>
              {loanTerms.ticket_number && (
                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">Ticket Number</span>
                  <span className="font-mono font-semibold text-neutral-800 dark:text-neutral-100">{loanTerms.ticket_number}</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Loan Details */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700/20 border-b border-neutral-200 dark:border-neutral-700">
              <h3 className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Loan Details</h3>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500 dark:text-neutral-400">Principal</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-100">{formatCurrency(loanTerms.principal || loanTerms.principal_loan)}</span>
              </div>
              {loanTerms.interest_rate != null && (
                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">Interest Rate</span>
                  <span className="text-neutral-600 dark:text-neutral-300">{loanTerms.interest_rate}%</span>
                </div>
              )}
              {loanTerms.advance_interest != null && (
                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">Advance Interest</span>
                  <span className="text-neutral-600 dark:text-neutral-300">{formatCurrency(loanTerms.advance_interest)}</span>
                </div>
              )}
              {loanTerms.service_charge != null && (
                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">Service Charge</span>
                  <span className="text-neutral-600 dark:text-neutral-300">{formatCurrency(loanTerms.service_charge)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-neutral-100 dark:border-neutral-700/40">
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">Net Proceeds</span>
                <span className="font-bold text-lg text-primary">{formatCurrency(loanTerms.net_proceeds)}</span>
              </div>
              {loanTerms.loan_date && (
                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">Loan Date</span>
                  <span className="text-neutral-600 dark:text-neutral-300">{formatDate(loanTerms.loan_date)}</span>
                </div>
              )}
              {loanTerms.maturity_date && (
                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">Maturity Date</span>
                  <span className="text-neutral-600 dark:text-neutral-300">{formatDate(loanTerms.maturity_date)}</span>
                </div>
              )}
              {loanTerms.expiry_date && (
                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">Expiry Date</span>
                  <span className="text-neutral-600 dark:text-neutral-300">{formatDate(loanTerms.expiry_date)}</span>
                </div>
              )}
              {(loanTerms.grace_period_days != null || loanTerms.grace_period != null) && (
                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">Grace Period</span>
                  <span className="text-neutral-600 dark:text-neutral-300">{loanTerms.grace_period_days ?? loanTerms.grace_period} days</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Disbursement */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700/20 border-b border-neutral-200 dark:border-neutral-700">
              <h3 className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Disbursement</h3>
            </div>
            <div className="p-4 space-y-4 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500 dark:text-neutral-400">Amount</span>
                <span className="font-bold text-primary">{formatCurrency(loanTerms.net_proceeds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500 dark:text-neutral-400">Payment Method</span>
                <span className="text-neutral-600 dark:text-neutral-300">CASH</span>
              </div>
              <div>
                <label className="form-label">Remarks (optional)</label>
                <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="form-input w-full min-h-[60px] resize-y" placeholder="Additional notes..." rows={2} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
            <button type="button" onClick={handleConfirm} disabled={loading}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
              {loading ? (
                <><span className="material-symbols-rounded animate-spin text-lg">progress_activity</span>Issuing...</>
              ) : (
                <><span className="material-symbols-rounded text-lg">receipt_long</span>Confirm & Issue Ticket</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
