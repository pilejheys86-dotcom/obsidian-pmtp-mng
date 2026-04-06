const { jsPDF } = require('jspdf');

/**
 * Generate a pawn ticket PDF from ticket data.
 * Returns a Buffer containing the PDF.
 * Uses jsPDF (pure JS) — no Chromium/Puppeteer needed.
 */
const generatePawnTicketPdf = async ({ ticket, item, businessName, branchName, bspRegNo }) => {
  const fmt = (val) => `₱${Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  const customerName = item.customers
    ? `${item.customers.first_name} ${item.customers.last_name}`
    : 'N/A';
  const itemDesc = [item.brand, item.model, item.description].filter(Boolean).join(' - ') || item.category;
  const loanTerms = item.specific_attrs?.loan_terms || ticket;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentW = pw - margin * 2;
  let y = margin;

  // ── Helpers ──
  const center = (text, size, style = 'normal') => {
    doc.setFontSize(size).setFont('helvetica', style);
    doc.text(text, pw / 2, y, { align: 'center' });
    y += size * 0.45;
  };

  const sectionTitle = (text) => {
    y += 4;
    doc.setFontSize(9).setFont('helvetica', 'bold').setTextColor(120, 113, 108);
    doc.text(text.toUpperCase(), margin, y);
    y += 1.5;
    doc.setDrawColor(231, 229, 228).line(margin, y, pw - margin, y);
    y += 5;
    doc.setTextColor(28, 25, 23);
  };

  const row = (label, value) => {
    doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(120, 113, 108);
    doc.text(label, margin, y);
    doc.setTextColor(28, 25, 23).setFont('helvetica', 'normal');
    doc.text(String(value || '—'), pw - margin, y, { align: 'right' });
    y += 5.5;
  };

  const boldRow = (label, value, valueFontSize = 12) => {
    doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(28, 25, 23);
    doc.text(label, margin, y);
    doc.setFontSize(valueFontSize);
    doc.text(String(value), pw - margin, y, { align: 'right' });
    y += 6;
  };

  // ── Header ──
  doc.setTextColor(28, 25, 23);
  center(businessName, 16, 'bold');
  if (branchName) { doc.setTextColor(120, 113, 108); center(branchName, 10); }
  if (bspRegNo) { doc.setTextColor(120, 113, 108); center(`BSP Reg. No.: ${bspRegNo}`, 9); }

  y += 2;
  doc.setDrawColor(28, 25, 23).setLineWidth(0.5).line(margin, y, pw - margin, y);
  y += 8;

  // ── Title ──
  doc.setTextColor(28, 25, 23);
  center('PAWN TICKET', 14, 'bold');
  center(loanTerms.ticket_number || ticket.ticket_number, 12);
  y += 2;

  // ── Pawner ──
  sectionTitle('Pawner');
  row('Name', customerName);

  // ── Pledged Item ──
  sectionTitle('Pledged Item');
  row('Description', itemDesc);
  row('Category', item.category);
  if (item.condition) row('Condition', item.condition);
  if (item.weight_grams) row('Weight', `${item.weight_grams}g`);
  if (item.karat) row('Karat', `${item.karat}K`);
  row('Appraised Value', fmt(item.appraised_value));

  // ── Loan Details ──
  sectionTitle('Loan Details');
  row('Principal Loan', fmt(loanTerms.principal_loan));
  row('Interest Rate', `${loanTerms.interest_rate}% / month`);
  row('Advance Interest', fmt(loanTerms.advance_interest));
  row(`Service Charge (${loanTerms.service_charge_pct || 5}%)`, fmt(loanTerms.service_charge_amount || loanTerms.service_charge));

  // Net proceeds highlight
  y += 2;
  doc.setFillColor(245, 245, 244);
  doc.roundedRect(margin, y - 4, contentW, 10, 2, 2, 'F');
  boldRow('Net Proceeds (Cash Received)', fmt(loanTerms.net_proceeds), 13);
  y += 2;

  row('Loan Date', fmtDate(loanTerms.loan_date || ticket.loan_date));
  boldRow('Maturity Date', fmtDate(loanTerms.maturity_date || ticket.maturity_date), 10);
  row('Expiry Date', fmtDate(loanTerms.expiry_date || ticket.expiry_date));
  row('Grace Period', `${loanTerms.grace_period_days} days`);

  // ── Signatures ──
  y += 16;
  const sigY = y + 12;
  const sigW = contentW / 3;
  const labels = ['Appraiser', 'Cashier', 'Customer'];
  labels.forEach((label, i) => {
    const x = margin + i * sigW + sigW / 2;
    doc.setDrawColor(28, 25, 23).setLineWidth(0.3);
    doc.line(x - 20, sigY, x + 20, sigY);
    doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(28, 25, 23);
    doc.text(label, x, sigY + 5, { align: 'center' });
  });

  // ── Footer ──
  y = sigY + 18;
  doc.setDrawColor(231, 229, 228).setLineWidth(0.3).line(margin, y, pw - margin, y);
  y += 5;
  doc.setFontSize(7).setTextColor(120, 113, 108);
  doc.text('This pawn ticket is non-transferable. / Ang pawn ticket na ito ay hindi maaaring ilipat sa ibang tao.', pw / 2, y, { align: 'center' });

  return Buffer.from(doc.output('arraybuffer'));
};

module.exports = { generatePawnTicketPdf };
