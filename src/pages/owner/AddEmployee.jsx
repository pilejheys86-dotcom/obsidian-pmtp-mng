import { useState, useEffect, useRef } from 'react';
import StepNav from '../../components/ui/StepNav';
import { locationsApi, branchesApi, uploadApi } from '../../lib/api';

const IK_PUBLIC_KEY = import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY || '';

// --- Section anchor IDs ---
const SECTIONS = [
    { id: 'personal', label: 'Personal Info', icon: 'person' },
    { id: 'identity', label: 'Compliance', icon: 'verified_user' },
    { id: 'access', label: 'Onboarding', icon: 'manage_accounts' },
];

// --- Reusable field wrappers ---
const Field = ({ label, required, error, children, className = '' }) => (
    <div className={`flex flex-col gap-1.5 ${className}`}>
        <label className="text-[13px] font-medium text-neutral-600 dark:text-neutral-400">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {children}
        {error && (
            <p className="flex items-center gap-1 text-xs text-red-500 font-medium">
                <span className="material-symbols-outlined text-sm">error</span>
                {error}
            </p>
        )}
    </div>
);

const baseInput =
    'w-full px-3.5 py-2.5 rounded-sm text-sm bg-white dark:bg-neutral-900 border text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all duration-200';

const inputCls = (error) =>
    `${baseInput} ${error ? 'border-red-400 dark:border-red-500 bg-red-50/50 dark:bg-red-900/10' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'}`;

const selectCls = (error) =>
    `${inputCls(error)} appearance-none cursor-pointer`;

// --- Toggle ---
const Toggle = ({ checked, onChange }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${checked ? 'bg-primary' : 'bg-neutral-300 dark:bg-neutral-600'}`}
    >
        <span
            className={`inline-block w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ${checked ? 'translate-x-6 bg-white dark:bg-neutral-900' : 'translate-x-1 bg-white'}`}
        />
    </button>
);

// --- Section card wrapper ---
const SectionCard = ({ id, icon, title, description, children }) => (
    <section
        id={id}
        className="bg-white dark:bg-neutral-800 rounded-sm border border-neutral-200 dark:border-neutral-700 shadow-sm scroll-mt-24"
    >
        <div className="px-6 pt-5 pb-4 border-b border-neutral-100 dark:border-neutral-700/60">
            <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-sm bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-primary text-[16px]">{icon}</span>
                </div>
                <h2 className="text-[15px] font-bold text-neutral-800 dark:text-neutral-100">{title}</h2>
            </div>
            {description && <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 ml-[38px]">{description}</p>}
        </div>
        <div className="p-6">{children}</div>
    </section>
);

// --- Masked SSN input ---
const MaskedInput = ({ value, onChange, placeholder, error }) => {
    const [show, setShow] = useState(false);
    return (
        <div className="relative">
            <input
                type={show ? 'text' : 'password'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={`${inputCls(error)} pr-10`}
            />
            <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 right-2.5 flex items-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
            >
                <span className="material-symbols-outlined text-[20px]">
                    {show ? 'visibility_off' : 'visibility'}
                </span>
            </button>
        </div>
    );
};

// --- File upload (ImageKit) ---
const FileUpload = ({ value, onChange, folder = 'employees' }) => {
    const ref = useRef();
    const [preview, setPreview] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');

    const handleChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => setPreview(reader.result);
        reader.readAsDataURL(file);

        setUploading(true);
        setUploadError('');

        try {
            const auth = await uploadApi.imagekitAuth();

            const formData = new FormData();
            formData.append('file', file);
            formData.append('publicKey', IK_PUBLIC_KEY);
            formData.append('signature', auth.signature);
            formData.append('expire', auth.expire);
            formData.append('token', auth.token);
            formData.append('fileName', `${folder}_${Date.now()}_${file.name}`);
            formData.append('folder', `/obsidian/${folder}`);

            const res = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'Upload failed');
            }

            const result = await res.json();
            onChange(result.url);
        } catch (err) {
            console.error('ImageKit upload error:', err);
            setUploadError(err.message || 'Upload failed');
            setPreview(null);
            onChange(null);
        } finally {
            setUploading(false);
        }
    };

    const handleRemove = () => {
        onChange(null);
        setPreview(null);
        setUploadError('');
        if (ref.current) ref.current.value = '';
    };

    const displayUrl = typeof value === 'string' && value.startsWith('http') ? value : preview;

    return (
        <div>
            {uploadError && (
                <p className="flex items-center gap-1 text-xs text-red-500 font-medium mb-2">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {uploadError}
                </p>
            )}
            {!displayUrl ? (
                <div
                    onClick={() => !uploading && ref.current.click()}
                    className={`flex flex-col items-center justify-center gap-2 p-6 rounded-sm border-2 border-dashed transition-colors ${uploading ? 'cursor-wait' : 'cursor-pointer'} group border-neutral-200 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900/50 hover:border-primary hover:bg-primary/5 dark:hover:border-primary`}
                >
                    {uploading ? (
                        <>
                            <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
                            <p className="text-sm text-neutral-500">Uploading...</p>
                        </>
                    ) : (
                        <>
                            <span className="material-symbols-outlined text-neutral-400 group-hover:text-primary transition-colors text-3xl">upload_file</span>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center">
                                <span className="font-semibold text-neutral-700 dark:text-neutral-200">Click to upload</span> or drag & drop
                            </p>
                            <p className="text-xs text-neutral-400">PDF, JPG, PNG up to 10 MB</p>
                        </>
                    )}
                </div>
            ) : (
                <div className="relative group">
                    <img src={displayUrl} alt="Uploaded" className="w-full h-40 object-contain rounded-sm border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900" />
                    <button
                        type="button"
                        onClick={handleRemove}
                        className="absolute top-2 right-2 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}
            <input
                ref={ref}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={handleChange}
            />
        </div>
    );
};

// --- Phone input with +63 prefix ---
const PhoneInput = ({ value, onChange, error }) => {
    const handleChange = (e) => {
        let val = e.target.value.replace(/[^0-9]/g, '');
        if (val.length > 10) val = val.slice(0, 10);
        onChange(val);
    };

    return (
        <div className="flex">
            <span className="inline-flex items-center px-3.5 rounded-l-sm border border-r-0 border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                +63
            </span>
            <input
                type="tel"
                value={value}
                onChange={handleChange}
                placeholder="9XXXXXXXXX"
                maxLength={10}
                className={`${inputCls(error)} rounded-l-none`}
            />
        </div>
    );
};

// --- Main form component ---
const AddEmployee = ({ onCancel, onSave }) => {
    const [form, setForm] = useState({
        firstName: '', lastName: '', personalEmail: '',
        phone: '', dob: '',
        addressLine1: '', addressLine2: '',
        province: '', cityMunicipality: '', barangay: '', zipCode: '',
        ssn: '', workAuth: '', idType: '', idFront: null, idBack: null,
        role: '', sendWelcome: true, branch_id: '',
    });
    const [errors, setErrors] = useState({});
    const [activeSection, setActiveSection] = useState('personal');
    const [submitted, setSubmitted] = useState(false);
    const [saving, setSaving] = useState(false);

    // Location dropdown state
    const [provinces, setProvinces] = useState([]);
    const [cities, setCities] = useState([]);
    const [barangays, setBarangays] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loadingCities, setLoadingCities] = useState(false);
    const [loadingBarangays, setLoadingBarangays] = useState(false);

    // Load provinces and branches on mount
    useEffect(() => {
        locationsApi.provinces().then(setProvinces).catch(() => {});
        branchesApi.list().then(res => {
            const list = res.data || res || [];
            setBranches(list);
            const main = list.find(b => b.is_main_branch);
            if (main) setForm(prev => ({ ...prev, branch_id: prev.branch_id || main.id }));
        }).catch(() => {});
    }, []);

    // Load cities when province changes
    useEffect(() => {
        if (!form.province) { setCities([]); return; }
        setLoadingCities(true);
        locationsApi.cities(form.province)
            .then(data => {
                setCities(Array.isArray(data) ? data : []);
            })
            .catch(() => setCities([]))
            .finally(() => setLoadingCities(false));
    }, [form.province]);

    // Load barangays when city changes
    useEffect(() => {
        if (!form.province || !form.cityMunicipality) { setBarangays([]); return; }
        setLoadingBarangays(true);
        locationsApi.barangays(form.province, form.cityMunicipality)
            .then(setBarangays)
            .catch(() => setBarangays([]))
            .finally(() => setLoadingBarangays(false));
    }, [form.province, form.cityMunicipality]);

    // Track active section for sidebar highlight
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => { if (e.isIntersecting) setActiveSection(e.target.id); });
            },
            { threshold: 0.35 }
        );
        SECTIONS.forEach((s) => {
            const el = document.getElementById(s.id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);

    const set = (field) => (e) =>
        setForm((prev) => ({ ...prev, [field]: typeof e === 'object' && e?.target !== undefined ? e.target.value : e }));

    const f = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

    // Compute completion %
    const required = ['firstName', 'lastName', 'personalEmail', 'phone', 'addressLine1', 'province', 'cityMunicipality', 'barangay', 'zipCode', 'role'];
    const filled = required.filter((k) => String(form[k]).trim() !== '').length;
    const progress = Math.round((filled / required.length) * 100);

    const validate = () => {
        const e = {};
        if (!form.firstName.trim()) e.firstName = 'First name is required';
        if (!form.lastName.trim()) e.lastName = 'Last name is required';
        if (!form.personalEmail.trim()) e.personalEmail = 'Personal email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.personalEmail)) e.personalEmail = 'Enter a valid email address';
        if (!form.phone.trim()) e.phone = 'Phone number is required';
        else if (!/^9\d{9}$/.test(form.phone)) e.phone = 'Must start with 9 and be 10 digits';
        if (!form.addressLine1.trim()) e.addressLine1 = 'Address Line 1 is required';
        if (!form.province) e.province = 'Province is required';
        if (!form.cityMunicipality) e.cityMunicipality = 'City/Municipality is required';
        if (!form.barangay) e.barangay = 'Barangay is required';
        if (!form.zipCode.trim()) e.zipCode = 'ZIP code is required';
        if (!form.role) e.role = 'System role is required';
        return e;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitted(true);
        const validationErrors = validate();
        setErrors(validationErrors);
        if (Object.keys(validationErrors).length > 0) return;

        setSaving(true);
        try {
            await onSave?.({
                first_name: form.firstName,
                last_name: form.lastName,
                email: form.personalEmail,
                phone_number: `+63${form.phone}`,
                date_of_birth: form.dob || null,
                address_line_1: form.addressLine1,
                address_line_2: form.addressLine2 || null,
                province: form.province,
                city_municipality: form.cityMunicipality,
                barangay: form.barangay,
                zip_code: form.zipCode,
                role: form.role,
                branch_id: form.branch_id || null,
                send_welcome: form.sendWelcome,
                id_type: form.idType || null,
                id_front_url: form.idFront || null,
                id_back_url: form.idBack || null,
            });
        } catch (err) {
            setErrors({ submit: err.message || 'Failed to save employee' });
        } finally {
            setSaving(false);
        }
    };

    // Get zip code from selected city (if cities data has zip info)
    const handleCityChange = (cityValue) => {
        f('cityMunicipality', cityValue);
        f('barangay', '');
        // Auto-fill zip code from the cities data
        const match = cities.find(c => c.name === cityValue);
        if (match?.zip) {
            f('zipCode', String(match.zip));
        }
    };

    return (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-0 w-full">

            {/* Sticky top bar: stepper */}
            <div className="sticky top-0 z-20 bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-md -mx-4 px-4 sm:px-8 py-4 mb-6 border-b border-neutral-200/60 dark:border-neutral-700/40">
                <StepNav steps={SECTIONS} active={activeSection} />
            </div>

            {/* Form sections */}
            <div className="flex flex-col gap-6">

                    {/* 1. Personal Information */}
                    <SectionCard id="personal" icon="person" title="Personal Information" description="Basic contact and identity details">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <Field label="First Name" required error={errors.firstName}>
                                <input
                                    type="text"
                                    value={form.firstName}
                                    onChange={set('firstName')}
                                    placeholder="e.g. Maria"
                                    className={inputCls(errors.firstName)}
                                />
                            </Field>
                            <Field label="Last Name" required error={errors.lastName}>
                                <input
                                    type="text"
                                    value={form.lastName}
                                    onChange={set('lastName')}
                                    placeholder="e.g. Santos"
                                    className={inputCls(errors.lastName)}
                                />
                            </Field>
                            <Field label="Personal Email" required error={errors.personalEmail}>
                                <input
                                    type="email"
                                    value={form.personalEmail}
                                    onChange={set('personalEmail')}
                                    placeholder="personal@email.com"
                                    className={inputCls(errors.personalEmail)}
                                />
                            </Field>
                            <Field label="Phone Number" required error={errors.phone}>
                                <PhoneInput
                                    value={form.phone}
                                    onChange={(v) => f('phone', v)}
                                    error={errors.phone}
                                />
                            </Field>
                            <Field label="Date of Birth">
                                <input
                                    type="date"
                                    value={form.dob}
                                    onChange={set('dob')}
                                    max={new Date(new Date().getFullYear() - 18, new Date().getMonth(), new Date().getDate()).toISOString().split('T')[0]}
                                    className={inputCls(null)}
                                />
                            </Field>
                            <Field label="Assigned Branch">
                                <select value={form.branch_id} onChange={set('branch_id')} className={selectCls(null)}>
                                    {branches.map(b => (
                                        <option key={b.id} value={b.id}>{b.branch_name}{b.is_main_branch ? ' (Main)' : ''}</option>
                                    ))}
                                </select>
                            </Field>
                        </div>

                        {/* Address sub-group */}
                        <div className="mt-5 pt-5 border-t border-neutral-100 dark:border-neutral-700">
                            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-4">
                                Home Address
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <Field label="Address Line 1" required error={errors.addressLine1} className="sm:col-span-2">
                                    <input
                                        type="text"
                                        value={form.addressLine1}
                                        onChange={set('addressLine1')}
                                        placeholder="House/Unit No., Street, Subdivision"
                                        className={inputCls(errors.addressLine1)}
                                    />
                                </Field>
                                <Field label="Address Line 2" className="sm:col-span-2">
                                    <input
                                        type="text"
                                        value={form.addressLine2}
                                        onChange={set('addressLine2')}
                                        placeholder="Building, Floor, Landmark (optional)"
                                        className={inputCls(null)}
                                    />
                                </Field>
                                <Field label="Province" required error={errors.province}>
                                    <select
                                        value={form.province}
                                        onChange={(e) => { f('province', e.target.value); f('cityMunicipality', ''); f('barangay', ''); f('zipCode', ''); }}
                                        className={selectCls(errors.province)}
                                    >
                                        <option value="">Select province...</option>
                                        {provinces.map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </Field>
                                <Field label="City / Municipality" required error={errors.cityMunicipality}>
                                    <select
                                        value={form.cityMunicipality}
                                        onChange={(e) => handleCityChange(e.target.value)}
                                        disabled={!form.province || loadingCities}
                                        className={selectCls(errors.cityMunicipality)}
                                    >
                                        <option value="">{loadingCities ? 'Loading...' : 'Select city...'}</option>
                                        {cities.map(c => (
                                            <option key={c.name} value={c.name}>{c.name}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Barangay" required error={errors.barangay}>
                                    <select
                                        value={form.barangay}
                                        onChange={set('barangay')}
                                        disabled={!form.cityMunicipality || loadingBarangays}
                                        className={selectCls(errors.barangay)}
                                    >
                                        <option value="">{loadingBarangays ? 'Loading...' : 'Select barangay...'}</option>
                                        {barangays.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </Field>
                                <Field label="ZIP / Postal Code" required error={errors.zipCode}>
                                    <input
                                        type="text"
                                        value={form.zipCode}
                                        onChange={set('zipCode')}
                                        placeholder="e.g. 1000"
                                        maxLength={5}
                                        className={inputCls(errors.zipCode)}
                                    />
                                </Field>
                            </div>
                        </div>
                    </SectionCard>

                    {/* 2. Identity & Compliance */}
                    <SectionCard id="identity" icon="verified_user" title="Identity & Compliance" description="Government ID verification">
                        <div>
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
                    </SectionCard>

                    {/* 3. Access & Onboarding */}
                    <SectionCard id="access" icon="manage_accounts" title="Access & Onboarding" description="System role and welcome email configuration">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <Field label="System Role / Permissions" required error={errors.role}>
                                <select value={form.role} onChange={set('role')} className={selectCls(errors.role)}>
                                    <option value="">Select role...</option>
                                    <option value="MANAGER">Manager</option>
                                    <option value="AUDITOR">Auditor</option>
                                    <option value="APPRAISER">Appraiser</option>
                                    <option value="CASHIER">Cashier</option>
                                </select>
                            </Field>
                            <Field label="Send Welcome Email">
                                <div className="flex items-center gap-3 h-[42px]">
                                    <Toggle
                                        checked={form.sendWelcome}
                                        onChange={(v) => f('sendWelcome', v)}
                                    />
                                    <span className="text-sm text-neutral-600 dark:text-neutral-400">
                                        {form.sendWelcome ? 'Credentials sent to personal email' : 'Email disabled'}
                                    </span>
                                </div>
                            </Field>
                        </div>
                        {form.sendWelcome && (
                            <div className="mt-4 p-3.5 rounded-sm bg-primary/5 border border-primary/20">
                                <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                                    <span className="material-symbols-outlined text-primary text-sm align-middle mr-1">info</span>
                                    A <strong>work email</strong> and <strong>default password</strong> will be auto-generated and sent to the employee's personal email address.
                                </p>
                            </div>
                        )}
                    </SectionCard>

                    {/* Error banner */}
                    {errors.submit && (
                        <div className="flex items-center gap-2 p-4 rounded-sm bg-red-500/10 border border-red-500/20">
                            <span className="material-symbols-outlined text-red-500 text-lg">error</span>
                            <p className="text-sm text-red-600 dark:text-red-400">{errors.submit}</p>
                        </div>
                    )}

                    {/* Bottom action bar */}
                    <div className="flex items-center justify-between py-3.5 px-5 bg-white dark:bg-neutral-800 rounded-sm border border-neutral-200 dark:border-neutral-700 shadow-sm">
                        <p className="text-xs text-neutral-400 dark:text-neutral-500">
                            {submitted && Object.keys(errors).length > 0
                                ? <span className="flex items-center gap-1 text-red-500 font-medium"><span className="material-symbols-outlined text-sm">error</span>{Object.keys(errors).length} field{Object.keys(errors).length > 1 ? 's' : ''} need attention</span>
                                : <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm text-neutral-400">info</span>Complete all required fields to save.</span>
                            }
                        </p>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={onCancel} className="px-4 py-2 rounded-sm text-sm font-semibold text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-sm text-sm font-bold bg-primary hover:bg-primary-hover text-white dark:text-neutral-900 shadow-sm shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-60"
                            >
                                {saving ? (
                                    <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                                ) : (
                                    <span className="material-symbols-outlined text-[18px]">save</span>
                                )}
                                {saving ? 'Saving...' : 'Save Employee'}
                            </button>
                        </div>
                    </div>
                </div>
            </form>
    );
};

export default AddEmployee;
