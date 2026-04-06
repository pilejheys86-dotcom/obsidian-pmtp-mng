# Employee KYC — Philippine ID Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the I-9 document upload in the Add Employee form with Philippine government ID KYC upload (ID type selector + front/back image uploads), wire the fields to the backend, and show KYC status on the employee list.

**Architecture:** The `employees` table already has `kyc_status`, `id_type`, `id_front_url`, `id_back_url` columns (defined in MasterSchema.md). No schema changes needed. The frontend Add Employee form Section 2 replaces the I-9 upload with an ID type dropdown and two FileUpload components. The backend employee creation endpoint accepts the new fields and sets `kyc_status = 'SUBMITTED'` when images are provided.

**Tech Stack:** React 18 frontend, Express.js backend, Supabase (PostgreSQL), ImageKit (image upload), TailwindCSS

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/pages/owner/AddEmployee.jsx:238-244` | Replace `i9File` state with `idType`, `idFront`, `idBack` |
| Modify | `src/pages/owner/AddEmployee.jsx:514-541` | Replace I-9 upload section with ID type dropdown + front/back uploads |
| Modify | `src/pages/owner/AddEmployee.jsx:329-356` | Update submit handler to send new fields |
| Modify | `server/routes/employees.js:253-390` | Accept `id_type`, `id_front_url`, `id_back_url` in payload; set `kyc_status`; remove I-9 media insert |
| Modify | `src/pages/owner/Employee.jsx` | Add KYC status badge to employee list table |

---

## Task 1: Update Add Employee Form — Replace I-9 with PH ID KYC

**Files:**
- Modify: `src/pages/owner/AddEmployee.jsx`

- [ ] **Step 1: Update form state — replace `i9File` with KYC fields**

In the `useState` initializer (line ~238), change:
```javascript
ssn: '', workAuth: '', i9File: null,
```
to:
```javascript
ssn: '', workAuth: '', idType: '', idFront: null, idBack: null,
```

- [ ] **Step 2: Replace Section 2 I-9 upload with PH ID KYC fields**

Replace the entire I-9 upload section (lines ~535-540, the `<div className="mt-5 pt-5 ...">` containing the I-9 label and FileUpload) with:

```jsx
<div className="mt-5 pt-5 border-t border-neutral-100 dark:border-neutral-700">
    <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
        Government ID Verification
    </p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
        <Field label="ID Type" className="sm:col-span-2">
            <select value={form.idType} onChange={set('idType')} className={selectCls(null)}>
                <option value="">Select ID type...</option>
                <option value="PHILSYS">PhilSys (National ID)</option>
                <option value="DRIVERS_LICENSE">Driver's License</option>
                <option value="SSS">SSS ID</option>
                <option value="PAG_IBIG">Pag-IBIG ID</option>
                <option value="TIN_ID">TIN ID</option>
                <option value="PASSPORT">Passport</option>
                <option value="POSTAL_ID">Postal ID</option>
                <option value="VOTERS_ID">Voter's ID</option>
            </select>
        </Field>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
            <p className="text-[13px] font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">
                ID Front
            </p>
            <FileUpload value={form.idFront} onChange={(v) => f('idFront', v)} folder="employees/kyc" />
        </div>
        <div>
            <p className="text-[13px] font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">
                ID Back
            </p>
            <FileUpload value={form.idBack} onChange={(v) => f('idBack', v)} folder="employees/kyc" />
        </div>
    </div>
</div>
```

- [ ] **Step 3: Update submit handler to send new KYC fields instead of I-9**

In `handleSubmit` (line ~338), change:
```javascript
i9_document_url: form.i9File || null,
```
to:
```javascript
id_type: form.idType || null,
id_front_url: form.idFront || null,
id_back_url: form.idBack || null,
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/owner/AddEmployee.jsx
git commit -m "feat: replace I-9 upload with Philippine ID KYC in Add Employee form"
```

---

## Task 2: Update Backend to Accept KYC Fields

**Files:**
- Modify: `server/routes/employees.js:253-390`

- [ ] **Step 1: Update payload parsing to accept KYC fields**

In the POST `/api/employees` handler (line ~255), change:
```javascript
i9_document_url: normalizeString(req.body.i9_document_url) || null,
```
to:
```javascript
id_type: normalizeString(req.body.id_type) || null,
id_front_url: normalizeString(req.body.id_front_url) || null,
id_back_url: normalizeString(req.body.id_back_url) || null,
```

- [ ] **Step 2: Add KYC fields to the employee insert row**

In the `employeeRow` object (line ~331), add the 3 KYC fields and set `kyc_status` conditionally. After `work_auth_status: payload.work_auth_status,` add:

```javascript
id_type: payload.id_type,
id_front_url: payload.id_front_url,
id_back_url: payload.id_back_url,
kyc_status: (payload.id_front_url && payload.id_back_url) ? 'SUBMITTED' : 'PENDING',
```

- [ ] **Step 3: Remove the I-9 media insert block**

Delete the entire I-9 media insert block (lines ~381-390):
```javascript
// Store I-9 document in media table if provided
if (payload.i9_document_url) {
  await supabaseAdmin.from('media').insert({
    tenant_id: req.tenantId,
    ref_type: 'EMPLOYEE_I9',
    ref_id: employee.id,
    image_url: payload.i9_document_url,
    label: 'i9_document',
  });
}
```

This is no longer needed — KYC images are stored directly on the employee row via `id_front_url` and `id_back_url`.

- [ ] **Step 4: Commit**

```bash
git add server/routes/employees.js
git commit -m "feat: accept Philippine ID KYC fields in employee creation endpoint"
```

---

## Task 3: Add KYC Status Badge to Employee List

**Files:**
- Modify: `src/pages/owner/Employee.jsx`

- [ ] **Step 1: Find the employee table row rendering and add a KYC badge**

In `Employee.jsx`, find where employee rows are rendered in the table. Add a KYC status column or badge next to the existing status badge. The badge should show:

- `PENDING` — neutral grey badge
- `SUBMITTED` — amber/warning badge (awaiting review)
- `VERIFIED` — green/success badge
- `REJECTED` — red/danger badge

Add a small inline badge component (follow the existing `StatusBadge` pattern in the file):

```jsx
const KycBadge = ({ status }) => {
    const styles = {
        VERIFIED:  'bg-primary/10 text-primary border-primary/20',
        SUBMITTED: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        REJECTED:  'bg-red-500/10 text-red-500 border-red-500/20',
        PENDING:   'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 border-neutral-200 dark:border-neutral-700',
    };
    const labels = { VERIFIED: 'Verified', SUBMITTED: 'Submitted', REJECTED: 'Rejected', PENDING: 'Pending' };
    const key = status || 'PENDING';
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles[key] || styles.PENDING}`}>
            {labels[key] || key}
        </span>
    );
};
```

Then in the table header row, add a `KYC` column header. In each employee row, render `<KycBadge status={emp.kyc_status} />`.

- [ ] **Step 2: Ensure the employee list API returns `kyc_status`**

Check that the GET `/api/employees` endpoint's select query includes `kyc_status`. In `server/routes/employees.js`, find the list endpoint's `.select(...)` call and verify `kyc_status` is included. If using `select('*', ...)` it's already included. If using specific columns, add `kyc_status`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/owner/Employee.jsx server/routes/employees.js
git commit -m "feat: add KYC status badge to employee list"
```

---

## Task 4: Verify End-to-End

- [ ] **Step 1: Test the full flow**

1. Navigate to Employees → Add Employee
2. Fill in personal info
3. In Section 2, verify I-9 upload is gone
4. Select an ID type (e.g., PhilSys)
5. Upload front and back of ID
6. Fill Section 3, save employee
7. Verify employee appears in list with "Submitted" KYC badge
8. Check database — confirm `id_type`, `id_front_url`, `id_back_url`, `kyc_status = 'SUBMITTED'` are set

- [ ] **Step 2: Test without ID upload**

1. Create another employee WITHOUT uploading any ID
2. Verify employee is created with `kyc_status = 'PENDING'`
3. Verify "Pending" badge shows on the list

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address any issues from employee KYC verification"
```
