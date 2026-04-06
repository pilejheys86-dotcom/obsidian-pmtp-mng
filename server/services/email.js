const nodemailer = require('nodemailer');
const dns = require('dns');
const { promisify } = require('util');

dns.setDefaultResultOrder('ipv4first');
const resolve4 = promisify(dns.resolve4);

// ---------------------------------------------------------------------------
// Transport layer: Resend HTTP API (production) or SMTP/nodemailer (local dev)
// ---------------------------------------------------------------------------

const sendEmail = async ({ from, to, subject, html, attachments }) => {
  const resendKey = process.env.RESEND_API_KEY;

  if (resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from || process.env.SMTP_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(attachments?.length ? {
          attachments: attachments.map(a => ({
            filename: a.filename,
            content: a.content.toString('base64'),
          }))
        } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend API error ${res.status}: ${body}`);
    }

    return await res.json();
  }

  const transporter = await getSmtpTransporter();
  return transporter.sendMail({ from: from || process.env.SMTP_FROM, to, subject, html, attachments });
};

// ---------------------------------------------------------------------------
// SMTP transporter (lazy, IPv4-resolved, port fallback) — used only locally
// ---------------------------------------------------------------------------

let _transporter = null;

const createTransporter = (host, port, smtpHost) =>
  nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { servername: smtpHost },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

const getSmtpTransporter = async () => {
  if (_transporter) return _transporter;

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT);
  let host = smtpHost;

  try {
    const addresses = await resolve4(smtpHost);
    if (addresses.length > 0) host = addresses[0];
  } catch (_) {}

  const tryPorts = [...new Set([smtpPort, 587, 465, 2525])];
  for (const port of tryPorts) {
    const t = createTransporter(host, port, smtpHost);
    try {
      await t.verify();
      _transporter = t;
      console.info(`[EMAIL] SMTP connected on port ${port}`);
      return _transporter;
    } catch (_) {}
  }

  _transporter = createTransporter(host, smtpPort, smtpHost);
  return _transporter;
};

// ---------------------------------------------------------------------------
// Shared email shell — clean light design aligned to Obsidian branding
// ---------------------------------------------------------------------------

// HTML-based logo that works in all email clients (Gmail strips SVGs)
const LOGO_HTML = `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
  <tr>
    <td style="vertical-align:middle;padding-right:2px;">
      <!--[if mso]><v:rect style="width:7px;height:22px" fillcolor="#171717" stroked="f"><v:textbox inset="0,0,0,0"></v:textbox></v:rect><![endif]-->
      <div style="width:7px;height:22px;background:#171717;display:inline-block;vertical-align:middle;font-size:0;line-height:0;">&nbsp;</div>
    </td>
    <td style="vertical-align:middle;padding-right:2px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="width:7px;height:7px;background:#171717;font-size:0;line-height:0;">&nbsp;</td>
          <td style="width:7px;height:7px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="width:7px;height:7px;font-size:0;line-height:0;">&nbsp;</td>
          <td style="width:7px;height:7px;background:#171717;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>
    </td>
    <td style="vertical-align:middle;padding-right:10px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr><td style="width:7px;height:7px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="width:7px;height:15px;background:#171717;font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
    </td>
    <td style="vertical-align:middle;">
      <span style="font-size:20px;font-weight:300;color:#171717;letter-spacing:-0.5px;font-family:system-ui,-apple-system,sans-serif;">Obsidian</span>
    </td>
  </tr>
</table>`;

const emailShell = (bodyHtml, { subtitle = 'Pawnshop Management System' } = {}) => {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <!-- Logo -->
        <tr>
          <td style="padding:0 0 28px;text-align:center;">
            ${LOGO_HTML}
          </td>
        </tr>
        <!-- Card -->
        <tr>
          <td style="background:#ffffff;border:1px solid #e5e5e4;border-radius:12px;overflow:hidden;">
            ${bodyHtml}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 0 0;text-align:center;">
            <p style="margin:0;font-size:11px;color:#a3a3a3;line-height:1.6;">
              &copy; ${year} Obsidian &middot; ${subtitle}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

const sectionTag = (text, color = '#171717') =>
  `<p style="margin:0 0 8px;font-size:11px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:1.2px;">${text}</p>`;

const heading = (text) =>
  `<h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#171717;line-height:1.3;letter-spacing:-0.3px;">${text}</h1>`;

const bodyText = (text) =>
  `<p style="margin:0;font-size:14px;color:#737373;line-height:1.7;">${text}</p>`;

const otpBlock = (otp) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e5e5e4;border-radius:8px;margin:24px 0;">
  <tr><td style="padding:28px 24px;text-align:center;">
    <p style="margin:0 0 6px;font-size:10px;font-weight:600;color:#a3a3a3;text-transform:uppercase;letter-spacing:1px;">Verification Code</p>
    <p style="margin:0;font-size:36px;font-weight:800;color:#171717;letter-spacing:10px;font-family:'Courier New',monospace;">${otp}</p>
  </td></tr>
</table>`;

const warningBox = (text) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border:1px solid #fef08a;border-radius:8px;margin:16px 0;">
  <tr><td style="padding:12px 16px;">
    <p style="margin:0;font-size:12px;color:#854d0e;line-height:1.5;">${text}</p>
  </td></tr>
</table>`;

const ctaButton = (text, url) => `
<div style="text-align:center;padding:24px 0 8px;">
  <a href="${url}" style="display:inline-block;padding:12px 36px;background:#171717;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;border-radius:6px;">${text}</a>
</div>`;

const credentialRow = (label, value, isLast = false) => `
<tr><td style="padding:16px 20px;${isLast ? '' : 'border-bottom:1px solid #e5e5e4;'}">
  <p style="margin:0 0 4px;font-size:10px;font-weight:600;color:#a3a3a3;text-transform:uppercase;letter-spacing:0.8px;">${label}</p>
  <p style="margin:0;font-size:14px;font-weight:600;color:#171717;font-family:'Courier New',monospace;">${value}</p>
</td></tr>`;

const credentialCard = (rows) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e5e5e4;border-radius:8px;overflow:hidden;margin:20px 0;">
  ${rows.map((r, i) => credentialRow(r[0], r[1], i === rows.length - 1)).join('')}
</table>`;

const featureItem = (text, desc) => `
<tr><td style="padding:12px 16px;${desc ? 'border-bottom:1px solid #e5e5e4;' : ''}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="width:24px;vertical-align:top;"><span style="font-size:14px;color:#171717;">&#x2713;</span></td>
    <td>
      <p style="margin:0;font-size:13px;font-weight:600;color:#171717;">${text}</p>
      ${desc ? `<p style="margin:3px 0 0;font-size:11px;color:#a3a3a3;">${desc}</p>` : ''}
    </td>
  </tr></table>
</td></tr>`;

const detailRow = (label, value, bold = false) => `
<tr>
  <td style="padding:8px 0;color:#a3a3a3;font-size:13px;border-bottom:1px solid #f5f5f4;">${label}</td>
  <td style="padding:8px 0;text-align:right;font-size:13px;border-bottom:1px solid #f5f5f4;${bold ? 'font-weight:700;color:#171717;' : 'color:#525252;'}">${value}</td>
</tr>`;

const pad = (html) => `<td style="padding:32px 36px;">${html}</td>`;

// ---------------------------------------------------------------------------
// Email template functions
// ---------------------------------------------------------------------------

const sendVerificationEmail = async (to, fullName, verificationUrl) => {
  await sendEmail({
    to,
    subject: 'Verify your Obsidian account',
    html: emailShell(`<tr>${pad(`
      ${sectionTag('Email Verification')}
      ${heading(`Hi ${fullName},`)}
      ${bodyText('Please verify your email address to complete your registration.')}
      ${ctaButton('Verify Email', verificationUrl)}
      <p style="margin:16px 0 0;font-size:12px;color:#444;">If you didn't create this account, you can safely ignore this email.</p>
    `)}</tr>`),
  });
};

const sendPasswordResetEmail = async (to, fullName, otp) => {
  await sendEmail({
    to,
    subject: 'Your Obsidian Password Reset Code',
    html: emailShell(`<tr>${pad(`
      ${sectionTag('Password Reset')}
      ${heading(`Hi ${fullName},`)}
      ${bodyText('We received a request to reset your password. Enter the verification code below in the app to continue.')}
      ${otpBlock(otp)}
      ${warningBox('<strong>Expires in 10 minutes.</strong> If you didn\'t request this, you can safely ignore this email.')}
    `)}</tr>`),
  });
};

const sendSignupOtpEmail = async ({ to, fullName, otp }) => {
  await sendEmail({
    to,
    subject: 'Your Obsidian Verification Code',
    html: emailShell(`<tr>${pad(`
      ${sectionTag('Email Verification')}
      ${heading(`Hi ${fullName},`)}
      ${bodyText('You\'re creating an Obsidian account. Enter the code below to verify your email and complete registration.')}
      ${otpBlock(otp)}
      ${warningBox('<strong>Expires in 10 minutes.</strong> If you didn\'t request this, you can safely ignore this email.')}
    `)}</tr>`),
  });
};

const sendEmployeeInviteEmail = async (to, fullName, role, inviteUrl) => {
  await sendEmail({
    to,
    subject: 'You\'re invited to join Obsidian',
    html: emailShell(`<tr>${pad(`
      ${sectionTag('Team Invitation')}
      ${heading(`Hi ${fullName},`)}
      ${bodyText(`You've been added as a <strong style="color:#171717;">${role}</strong> on Obsidian Pawnshop MIS.`)}
      ${ctaButton('Accept Invitation', inviteUrl)}
    `)}</tr>`),
  });
};

const sendEmployeeWelcomeEmail = async ({ to, fullName, role, workEmail, defaultPassword, businessName, loginUrl }) => {
  const roleLabel = role.charAt(0) + role.slice(1).toLowerCase();
  await sendEmail({
    to,
    subject: `Welcome to ${businessName} — Your Obsidian Access`,
    html: emailShell(`<tr>${pad(`
      ${sectionTag('Account Created')}
      ${heading(`Welcome, ${fullName}!`)}
      ${bodyText(`You've been added as <strong style="color:#171717;">${roleLabel}</strong> at <strong style="color:#171717;">${businessName}</strong>. Below are your login credentials.`)}
      ${credentialCard([['Work Email', workEmail], ['Default Password', defaultPassword]])}
      ${warningBox('<strong>Security:</strong> Please change your password immediately after your first login.')}
      ${ctaButton('Log In to Obsidian', loginUrl)}
    `)}</tr>`, { subtitle: businessName }),
  });
};

const sendEmployeeOtpEmail = async ({ to, fullName, role, businessName, otp }) => {
  const roleLabel = role.charAt(0) + role.slice(1).toLowerCase();
  await sendEmail({
    to,
    subject: `Your Obsidian Verification Code — ${businessName}`,
    html: emailShell(`<tr>${pad(`
      ${sectionTag('Account Verification')}
      ${heading(`Hi ${fullName},`)}
      ${bodyText(`You've been added as <strong style="color:#171717;">${roleLabel}</strong> at <strong style="color:#171717;">${businessName}</strong>. Use the code below to verify your account.`)}
      ${otpBlock(otp)}
      ${warningBox('<strong>Expires in 10 minutes.</strong>')}
    `)}</tr>`, { subtitle: businessName }),
  });
};

const sendCustomerOtpEmail = async ({ to, fullName, businessName, otp }) => {
  await sendEmail({
    to,
    subject: `Your Verification Code — ${businessName}`,
    html: emailShell(`<tr>${pad(`
      ${sectionTag('Verify Your Account')}
      ${heading(`Welcome, ${fullName}!`)}
      ${bodyText(`You've been registered as a customer of <strong style="color:#171717;">${businessName}</strong>. Use the code below to set your password.`)}
      ${otpBlock(otp)}
      ${warningBox('<strong>Expires in 10 minutes.</strong> Open the Obsidian app, enter this code, and set your password.')}
    `)}</tr>`, { subtitle: 'Customer Portal' }),
  });
};

const sendCustomerWelcomeEmail = async ({ to, fullName, email, tempPassword, businessName }) => {
  await sendEmail({
    to,
    subject: `Welcome to ${businessName} — Your Account is Ready`,
    html: emailShell(`<tr>${pad(`
      ${sectionTag('Account Created')}
      ${heading(`Welcome, ${fullName}!`)}
      ${bodyText(`You've been registered as a customer of <strong style="color:#171717;">${businessName}</strong>. Use the credentials below to log in.`)}
      ${credentialCard([['Email (Username)', email], ['Temporary Password', tempPassword]])}
      ${warningBox('<strong>Security:</strong> Please change your password immediately after your first login.')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e5e5e4;border-radius:8px;overflow:hidden;margin:20px 0;">
        ${featureItem('Track Your Loans', 'View active tickets, maturity dates, and payment history')}
        ${featureItem('Make Payments', 'Pay interest, renew, or redeem your items online')}
        ${featureItem('Get Notified', null)}
      </table>
    `)}</tr>`, { subtitle: 'Customer Portal' }),
  });
};

const sendOwnerWelcomeEmail = async ({ to, fullName, businessName, loginUrl }) => {
  await sendEmail({
    to,
    subject: `Welcome to Obsidian — ${businessName} is ready!`,
    html: emailShell(`<tr>${pad(`
      ${sectionTag('Account Created')}
      ${heading(`Welcome, ${fullName}!`)}
      ${bodyText(`Your pawnshop <strong style="color:#171717;">${businessName}</strong> has been successfully registered on Obsidian. Your dashboard, inventory tools, and reporting features are ready.`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e5e5e4;border-radius:8px;overflow:hidden;margin:20px 0;">
        ${featureItem('Dashboard & Analytics', 'KPI cards, loan activity charts, portfolio overview')}
        ${featureItem('Customer & Loan Management', 'KYC verification, pawn tickets, renewals, payments')}
        ${featureItem('Inventory & Appraisals', 'Gold rate management, item tracking, auction tools')}
      </table>
      ${ctaButton('Sign In to Your Dashboard', loginUrl)}
      <p style="margin:8px 0 0;font-size:12px;color:#444;text-align:center;">Use the email and password you created during registration.</p>
    `)}</tr>`),
  });
};

const sendLoanNoticeEmail = async (to, customerName, noticeType, ticketNumber, details) => {
  const subjects = {
    MATURITY_WARNING: `Loan Maturity Reminder — ${ticketNumber}`,
    GRACE_PERIOD_START: `Grace Period Notice — ${ticketNumber}`,
    AUCTION_NOTICE: `Auction Notice — ${ticketNumber}`,
  };
  const tags = {
    MATURITY_WARNING: ['Maturity Reminder', '#F59E0B'],
    GRACE_PERIOD_START: ['Grace Period', '#EF4444'],
    AUCTION_NOTICE: ['Auction Notice', '#EF4444'],
  };
  const bodies = {
    MATURITY_WARNING: `Your pawn ticket <strong style="color:#171717;">${ticketNumber}</strong> will mature on <strong style="color:#171717;">${details.maturityDate}</strong>. Please settle or renew your loan before the maturity date to avoid penalties.`,
    GRACE_PERIOD_START: `Your pawn ticket <strong style="color:#171717;">${ticketNumber}</strong> has matured. You are now in the grace period. Please redeem or renew your loan to avoid forfeiture.`,
    AUCTION_NOTICE: `Your pawn ticket <strong style="color:#171717;">${ticketNumber}</strong> has been scheduled for auction on <strong style="color:#171717;">${details.auctionDate}</strong>. Contact us immediately if you wish to redeem your item.`,
  };
  const [tag, color] = tags[noticeType] || ['Notice', '#888'];

  await sendEmail({
    to,
    subject: subjects[noticeType],
    html: emailShell(`<tr>${pad(`
      ${sectionTag(tag, color)}
      ${heading(`Dear ${customerName},`)}
      ${bodyText(bodies[noticeType])}
    `)}</tr>`, { subtitle: 'Loan Notification' }),
  });
};

const sendTransactionReceiptEmail = async (to, customerName, transaction) => {
  await sendEmail({
    to,
    subject: `Transaction Receipt — ${transaction.receipt_number}`,
    html: emailShell(`<tr>${pad(`
      ${sectionTag('Transaction Receipt')}
      ${heading(`Dear ${customerName},`)}
      ${bodyText('Here is your transaction summary.')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;">
        ${detailRow('Receipt #', transaction.receipt_number, true)}
        ${detailRow('Type', transaction.trans_type)}
        ${detailRow('Payment Method', transaction.payment_method)}
        ${detailRow('Principal Paid', `₱${transaction.principal_paid}`)}
        ${detailRow('Interest Paid', `₱${transaction.interest_paid}`)}
        ${detailRow('Date', transaction.trans_date, true)}
      </table>
    `)}</tr>`),
  });
};

// ---------------------------------------------------------------------------
// Tenant Status Notifications
// ---------------------------------------------------------------------------

const tenantEmail = (tagline, tagColor, headingText, contentHtml) =>
  emailShell(`<tr>${pad(`
    ${sectionTag(tagline, tagColor)}
    ${heading(headingText)}
    ${contentHtml}
  `)}</tr>`);

const reasonBlock = (reason) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e5e5e4;border-radius:8px;overflow:hidden;margin:16px 0;">
  <tr><td style="padding:16px 20px;">
    <p style="margin:0 0 4px;font-size:10px;color:#a3a3a3;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Reason</p>
    <p style="margin:0;font-size:13px;color:#525252;line-height:1.6;">${reason || 'No reason provided'}</p>
  </td></tr>
</table>`;

const sendTenantBlockedEmail = async ({ to, fullName, businessName, reason }) => {
  await sendEmail({
    to,
    subject: `Your account has been suspended — ${businessName}`,
    html: tenantEmail('Account Suspended', '#EF4444', `${fullName}, your account has been suspended`, `
      ${bodyText(`Your pawnshop <strong style="color:#171717;">${businessName}</strong> has been suspended. All users have been temporarily disabled.`)}
      ${reasonBlock(reason)}
      <p style="margin:16px 0 0;font-size:12px;color:#555;">To resolve this, please reply to this email or contact support.</p>
    `),
  });
};

const sendTenantDeactivatedEmail = async ({ to, fullName, businessName, reason }) => {
  await sendEmail({
    to,
    subject: `Your account has been deactivated — ${businessName}`,
    html: tenantEmail('Account Deactivated', '#F59E0B', `${fullName}, your account has been deactivated`, `
      ${bodyText(`Your pawnshop <strong style="color:#171717;">${businessName}</strong> has been deactivated. All users can no longer access the system.`)}
      ${reasonBlock(reason)}
      <p style="margin:16px 0 0;font-size:12px;color:#555;">If you would like to reactivate, please reply to this email.</p>
    `),
  });
};

const sendTenantApprovedEmail = async ({ to, fullName, businessName, loginUrl }) => {
  await sendEmail({
    to,
    subject: `Your account has been approved — ${businessName}`,
    html: tenantEmail('Account Approved', '#16a34a', `Congratulations, ${fullName}!`, `
      ${bodyText(`Your pawnshop <strong style="color:#171717;">${businessName}</strong> has been approved and is now active on Obsidian.`)}
      ${ctaButton('Sign In to Your Dashboard', loginUrl || '#')}
    `),
  });
};

const sendTenantRejectedEmail = async ({ to, fullName, businessName, reason }) => {
  await sendEmail({
    to,
    subject: `Your registration has been declined — ${businessName}`,
    html: tenantEmail('Registration Declined', '#EF4444', `${fullName}, your registration was not approved`, `
      ${bodyText(`Your application to register <strong style="color:#171717;">${businessName}</strong> on Obsidian has been declined.`)}
      ${reasonBlock(reason)}
      <p style="margin:16px 0 0;font-size:12px;color:#555;">If you believe this was an error, please reply to this email.</p>
    `),
  });
};

const sendTenantReactivatedEmail = async ({ to, fullName, businessName, loginUrl }) => {
  await sendEmail({
    to,
    subject: `Your account has been reactivated — ${businessName}`,
    html: tenantEmail('Account Reactivated', '#22C55E', `Welcome back, ${fullName}!`, `
      ${bodyText(`Your pawnshop <strong style="color:#171717;">${businessName}</strong> has been reactivated. All your data is intact.`)}
      ${ctaButton('Sign In to Your Dashboard', loginUrl || '#')}
    `),
  });
};

// ---------------------------------------------------------------------------
// Super Admin Welcome
// ---------------------------------------------------------------------------

const sendSuperAdminWelcomeEmail = async ({ to, fullName, email, tempPassword, loginUrl }) => {
  await sendEmail({
    to,
    subject: 'Your Obsidian Platform Admin Access',
    html: emailShell(`<tr>${pad(`
      ${sectionTag('Admin Access Granted')}
      ${heading(`Welcome, ${fullName}!`)}
      ${bodyText('You have been added as a <strong style="color:#171717;">Platform Administrator</strong> on Obsidian.')}
      ${credentialCard([['Email', email], ['Temporary Password', tempPassword]])}
      ${warningBox('<strong>Security:</strong> Please change your password immediately after your first login.')}
      ${ctaButton('Log In to Admin Portal', loginUrl)}
    `)}</tr>`, { subtitle: 'Platform Administration' }),
  });
};

// ---------------------------------------------------------------------------
// Loan Disbursement (with PDF attachment)
// ---------------------------------------------------------------------------

const sendDisbursementEmail = async ({ to, customerName, ticket, businessName, branchName, pdfBuffer }) => {
  const fmt = (val) => `₱${Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  const html = emailShell(`
    <tr>${pad(`
      ${sectionTag('Loan Disbursement')}
      ${heading(`Dear ${customerName},`)}
      ${bodyText('Your pawn loan has been processed. Here are the details.')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;">
        ${detailRow('Ticket Number', ticket.ticket_number, true)}
        ${detailRow('Item', ticket.item_description || ticket.category)}
        ${detailRow('Principal Loan', fmt(ticket.principal_loan), true)}
        ${detailRow('Interest Rate', `${ticket.interest_rate}% / month`)}
        ${detailRow('Advance Interest', `<span style="color:#ef4444;">- ${fmt(ticket.advance_interest)}</span>`)}
        ${detailRow('Service Charge', `<span style="color:#ef4444;">- ${fmt(ticket.service_charge)}</span>`)}
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e5e5e4;border-radius:8px;margin:0 0 20px;">
        <tr><td style="padding:16px 20px;text-align:center;">
          <p style="margin:0 0 4px;font-size:10px;color:#a3a3a3;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Net Proceeds (Cash Received)</p>
          <p style="margin:0;font-size:22px;font-weight:700;color:#171717;">${fmt(ticket.net_proceeds)}</p>
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse;">
        ${detailRow('Loan Date', fmtDate(ticket.loan_date))}
        ${detailRow('Maturity Date', fmtDate(ticket.maturity_date), true)}
        ${detailRow('Expiry Date', fmtDate(ticket.expiry_date))}
      </table>
      <p style="margin:0;font-size:12px;color:#444;line-height:1.5;">Present this ticket number when making payments or redeeming your item. Failure to renew or redeem before the expiry date will result in forfeiture.</p>
    `)}</tr>
  `, { subtitle: businessName || 'Pawnshop Management System' });

  const emailPayload = { to, subject: `Pawn Ticket #${ticket.ticket_number} — Loan Disbursement Confirmation`, html };
  if (pdfBuffer) {
    emailPayload.attachments = [{ filename: `PawnTicket-${ticket.ticket_number}.pdf`, content: pdfBuffer }];
  }
  await sendEmail(emailPayload);
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendSignupOtpEmail,
  sendEmployeeInviteEmail,
  sendEmployeeWelcomeEmail,
  sendEmployeeOtpEmail,
  sendCustomerOtpEmail,
  sendCustomerWelcomeEmail,
  sendOwnerWelcomeEmail,
  sendLoanNoticeEmail,
  sendTransactionReceiptEmail,
  sendTenantBlockedEmail,
  sendTenantDeactivatedEmail,
  sendTenantApprovedEmail,
  sendTenantRejectedEmail,
  sendTenantReactivatedEmail,
  sendSuperAdminWelcomeEmail,
  sendDisbursementEmail,
};
