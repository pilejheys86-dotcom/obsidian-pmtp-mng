import { useAuth } from '../../../context'

const fmt = (val) => {
  const num = Number(val)
  if (isNaN(num)) return '\u20B10.00'
  return `\u20B1${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const fmtDate = (iso) => {
  if (!iso) return '---'
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PawnTicketPrint({ ticket, item }) {
  const { profile } = useAuth()

  const tenantName = profile?.tenants?.business_name || 'Pawnshop'
  const bspReg = profile?.tenants?.bsp_registration_no || ''
  const branchName = profile?.branches?.branch_name || ''
  const branchAddress = [profile?.branches?.address, profile?.branches?.city_municipality].filter(Boolean).join(', ')

  const lt = item?.specific_attrs?.loan_terms || ticket?.loan_terms || {}
  const customerName = item?.customers
    ? `${item.customers.first_name} ${item.customers.last_name}`
    : ticket?.customer_name || '---'
  const ticketNo = ticket?.ticket_number || lt.ticket_number || '---'
  const ticketDate = ticket?.created_at || lt.loan_date || new Date().toISOString()

  return (
    <>
      <style>{`
        @media print {
          @page { size: 160mm 50mm landscape; margin: 0; }
          body * { visibility: hidden !important; }
          .pawn-ticket-print, .pawn-ticket-print * { visibility: visible !important; }
          .pawn-ticket-print {
            position: fixed !important;
            left: 0 !important; top: 0 !important;
            width: 160mm !important; height: 50mm !important;
            background: white !important; color: black !important;
            padding: 2mm 3mm !important;
            font-size: 6.5pt !important;
            line-height: 1.3 !important;
            overflow: hidden !important;
          }
          .pawn-ticket-print .print-hide { display: none !important; }
        }
      `}</style>

      <div className="pawn-ticket-print bg-white text-black border border-neutral-300 rounded-sm overflow-hidden"
        style={{ width: '160mm', height: '50mm', padding: '2mm 3mm', fontSize: '6.5pt', lineHeight: 1.3 }}>

        {/* ── Row 1: Header ── */}
        <div className="flex items-start justify-between border-b border-black pb-[1mm] mb-[1mm]">
          <div>
            <p className="font-bold uppercase" style={{ fontSize: '8pt' }}>{tenantName}</p>
            {branchAddress && <p className="text-neutral-600" style={{ fontSize: '5.5pt' }}>{branchName} — {branchAddress}</p>}
            {bspReg && <p className="text-neutral-600" style={{ fontSize: '5.5pt' }}>BSP Reg. No.: {bspReg}</p>}
          </div>
          <div className="text-right">
            <p className="font-bold uppercase" style={{ fontSize: '7pt' }}>Pawn Ticket</p>
            <p style={{ fontSize: '5.5pt' }}>No: <span className="font-bold font-mono">{ticketNo}</span></p>
            <p style={{ fontSize: '5.5pt' }}>Date: {fmtDate(ticketDate)}</p>
          </div>
        </div>

        {/* ── Row 2: Main content — 3 columns ── */}
        <div className="flex gap-[2mm]" style={{ height: '28mm' }}>

          {/* Column 1: Pawner & Item */}
          <div className="flex-1 min-w-0 space-y-[1mm]">
            <div>
              <p className="text-neutral-500 uppercase" style={{ fontSize: '5pt', letterSpacing: '0.5px' }}>Pawner</p>
              <p className="font-bold truncate">{customerName}</p>
            </div>
            <div>
              <p className="text-neutral-500 uppercase" style={{ fontSize: '5pt', letterSpacing: '0.5px' }}>Item Pledged</p>
              <p className="font-semibold truncate">{item?.general_desc || '---'}</p>
              <p className="text-neutral-600">{item?.category}{item?.item_condition ? ` / ${item.item_condition}` : ''}</p>
              {item?.category === 'JEWELRY' && item?.weight_grams && (
                <p className="text-neutral-600">{item.weight_grams}g {item.karat ? `${item.karat}K` : ''}</p>
              )}
            </div>
          </div>

          {/* Column 2: Loan Terms */}
          <div className="flex-1 min-w-0 border-l border-neutral-300 pl-[2mm] space-y-[0.5mm]">
            <p className="text-neutral-500 uppercase" style={{ fontSize: '5pt', letterSpacing: '0.5px' }}>Loan Details</p>
            <div className="flex justify-between"><span>Principal</span><span className="font-bold">{fmt(lt.principal_loan)}</span></div>
            <div className="flex justify-between"><span>Interest ({lt.interest_rate || 0}%/mo)</span><span>{fmt(lt.advance_interest)}</span></div>
            <div className="flex justify-between"><span>Service Charge</span><span>{fmt(lt.service_charge)}</span></div>
            <div className="flex justify-between border-t border-black pt-[0.5mm] mt-[0.5mm]">
              <span className="font-bold">Net Proceeds</span>
              <span className="font-bold">{fmt(lt.net_proceeds)}</span>
            </div>
          </div>

          {/* Column 3: Dates & Redemption Info */}
          <div className="flex-1 min-w-0 border-l border-neutral-300 pl-[2mm] space-y-[0.5mm]">
            <p className="text-neutral-500 uppercase" style={{ fontSize: '5pt', letterSpacing: '0.5px' }}>Important Dates</p>
            <div className="flex justify-between"><span>Loan Date</span><span className="font-semibold">{fmtDate(lt.loan_date)}</span></div>
            <div className="flex justify-between"><span>Maturity</span><span className="font-semibold">{fmtDate(lt.maturity_date)}</span></div>
            <div className="flex justify-between"><span>Expiry</span><span className="font-semibold">{fmtDate(lt.expiry_date)}</span></div>
            <div className="flex justify-between"><span>Next Payment</span><span className="font-semibold">{fmtDate(lt.next_payment_due_date)}</span></div>
            <div className="flex justify-between"><span>Grace Period</span><span className="font-semibold">{lt.grace_period_days || 90} days</span></div>
          </div>
        </div>

        {/* ── Row 3: Footer — Signatures + Legal ── */}
        <div className="flex items-end justify-between border-t border-black pt-[1mm] mt-[1mm]">
          <div className="flex gap-[6mm]">
            <div className="text-center">
              <div className="border-b border-black" style={{ width: '20mm', height: '4mm' }}></div>
              <p style={{ fontSize: '5pt' }}>Appraiser</p>
            </div>
            <div className="text-center">
              <div className="border-b border-black" style={{ width: '20mm', height: '4mm' }}></div>
              <p style={{ fontSize: '5pt' }}>Cashier</p>
            </div>
            <div className="text-center">
              <div className="border-b border-black" style={{ width: '20mm', height: '4mm' }}></div>
              <p style={{ fontSize: '5pt' }}>Pawner</p>
            </div>
          </div>
          <p className="text-neutral-500 text-right" style={{ fontSize: '4.5pt', maxWidth: '55mm' }}>
            Non-transferable. Item remains in custody of pawnshop until fully redeemed.
          </p>
        </div>
      </div>
    </>
  )
}
