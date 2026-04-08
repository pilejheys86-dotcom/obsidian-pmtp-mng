import { useState, useEffect, useRef } from 'react';
import { locationsApi, uploadApi } from '../../lib/api';
import StepNav from '../../components/ui/StepNav';

const IK_PUBLIC_KEY = import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY || '';
const IK_URL_ENDPOINT = import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || '';

// --- Section anchor IDs ---
const SECTIONS = [
    { id: 'personal', label: 'Personal Info', icon: 'person' },
    { id: 'address', label: 'Address', icon: 'home' },
    { id: 'identity', label: 'KYC', icon: 'verified_user' },
];

// --- Philippine Government IDs ---
const GOVERNMENT_IDS = [
    { code: 'PHILSYS', name: 'PhilSys National ID' },
    { code: 'DL', name: "Driver's License (LTO)" },
    { code: 'PASSPORT', name: 'Philippine Passport' },
    { code: 'SSS', name: 'SSS ID / UMID' },
    { code: 'GSIS', name: 'GSIS ID / UMID' },
    { code: 'PRC', name: 'PRC ID' },
    { code: 'VOTERS', name: "Voter's ID" },
    { code: 'POSTAL', name: 'Postal ID' },
    { code: 'TIN', name: 'TIN ID' },
    { code: 'SENIOR', name: 'Senior Citizen ID' },
    { code: 'PWD', name: 'PWD ID' },
    { code: 'OFW', name: 'OFW ID' },
];

// --- Reusable field wrappers ---
const Field = ({ label, required, error, children, className = '', hint }) => (
    <div className={`flex flex-col gap-1.5 ${className}`}>
        <label className="text-[13px] font-medium text-neutral-600 dark:text-neutral-400">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {children}
        {hint && !error && <p className="text-xs text-neutral-400">{hint}</p>}
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

// --- Section card wrapper ---
const SectionCard = ({ id, icon, title, description, accent, badge, children }) => (
    <section
        id={id}
        className={`rounded-sm border shadow-sm scroll-mt-24 ${
            accent
                ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 border-amber-200 dark:border-amber-800'
                : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700'
        }`}
    >
        <div className={`px-6 pt-5 pb-4 border-b ${accent ? 'border-amber-200/60 dark:border-amber-800/60' : 'border-neutral-100 dark:border-neutral-700/60'}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0 ${accent ? 'bg-amber-500/20 dark:bg-amber-500/10' : 'bg-primary/10'}`}>
                        <span className={`material-symbols-outlined text-[16px] ${accent ? 'text-amber-600 dark:text-amber-500' : 'text-primary'}`}>{icon}</span>
                    </div>
                    <h2 className="text-[15px] font-bold text-neutral-800 dark:text-neutral-100">{title}</h2>
                </div>
                {badge && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-sm bg-amber-100 dark:bg-amber-900/30 text-xs font-bold text-amber-700 dark:text-amber-400 uppercase">
                        <span className="material-symbols-outlined text-sm">shield</span>
                        {badge}
                    </span>
                )}
            </div>
            {description && <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 ml-[38px]">{description}</p>}
        </div>
        <div className="p-6">{children}</div>
    </section>
);

// --- Toggle ---
const Toggle = ({ checked, onChange, options }) => (
    <div className="inline-flex bg-neutral-200/60 dark:bg-neutral-800 rounded-sm p-1">
        {options.map((opt) => (
            <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-sm text-sm font-semibold transition-all ${
                    checked === opt.value
                        ? 'bg-primary text-neutral-900 shadow-sm'
                        : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                }`}
            >
                <span className="material-symbols-outlined text-lg">{opt.icon}</span>
                {opt.label}
            </button>
        ))}
    </div>
);

// --- File upload (ImageKit) ---
const FileUpload = ({ label, value, onChange, required, error, folder = 'kyc' }) => {
    const ref = useRef();
    const [preview, setPreview] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');

    const handleChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Show local preview immediately
        const reader = new FileReader();
        reader.onloadend = () => setPreview(reader.result);
        reader.readAsDataURL(file);

        setUploading(true);
        setUploadError('');

        try {
            // Get auth params from backend
            const auth = await uploadApi.imagekitAuth();

            // Upload to ImageKit
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
            // Pass the ImageKit URL back to the form
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

    // If value is a URL string (already uploaded), show it
    const displayUrl = typeof value === 'string' && value.startsWith('http') ? value : preview;

    return (
        <Field label={label} required={required} error={error || uploadError}>
            {!displayUrl ? (
                <div
                    onClick={() => !uploading && ref.current.click()}
                    className={`flex flex-col items-center justify-center gap-2 p-6 rounded-sm border-2 border-dashed transition-colors ${uploading ? 'cursor-wait' : 'cursor-pointer'} group ${
                        error || uploadError
                            ? 'border-red-300 bg-red-50/50 dark:bg-red-900/10'
                            : 'border-neutral-200 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900/50 hover:border-primary hover:bg-primary/5'
                    }`}
                >
                    {uploading ? (
                        <>
                            <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">Uploading...</p>
                        </>
                    ) : (
                        <>
                            <span className="material-symbols-outlined text-neutral-400 group-hover:text-primary transition-colors text-3xl">cloud_upload</span>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center">
                                <span className="font-semibold text-neutral-700 dark:text-neutral-200">Click to upload</span> or drag & drop
                            </p>
                            <p className="text-xs text-neutral-400">PNG, JPG up to 5 MB</p>
                        </>
                    )}
                </div>
            ) : (
                <div className="relative inline-block">
                    <img src={displayUrl} alt={label} className="w-full max-w-[200px] h-32 object-cover rounded-sm border border-neutral-200 dark:border-neutral-600" />
                    <button
                        type="button"
                        onClick={handleRemove}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-sm flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
                    >
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}
            <input ref={ref} type="file" accept="image/png,image/jpeg,image/jpg" onChange={handleChange} className="hidden" disabled={uploading} />
        </Field>
    );
};

// --- ID Block ---
const IDBlock = ({ title, prefix, data, errors, onChange }) => (
    <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-sm p-5 border border-neutral-200 dark:border-neutral-700">
        {title && (
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">badge</span>
                {title}
            </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="ID Type" required error={errors?.[`${prefix}.idType`]}>
                <select
                    value={data.idType}
                    onChange={(e) => onChange('idType', e.target.value)}
                    className={selectCls(errors?.[`${prefix}.idType`])}
                >
                    <option value="">Select ID type...</option>
                    {GOVERNMENT_IDS.map((id) => (
                        <option key={id.code} value={id.code}>{id.name}</option>
                    ))}
                </select>
            </Field>
            <Field label="ID Number" required error={errors?.[`${prefix}.idNumber`]}>
                <input
                    type="text"
                    value={data.idNumber}
                    onChange={(e) => onChange('idNumber', e.target.value)}
                    placeholder="Enter ID number"
                    className={inputCls(errors?.[`${prefix}.idNumber`])}
                />
            </Field>
            <Field label="Date Issued" required error={errors?.[`${prefix}.issuedDate`]}>
                <input
                    type="date"
                    value={data.issuedDate}
                    onChange={(e) => onChange('issuedDate', e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className={inputCls(errors?.[`${prefix}.issuedDate`])}
                />
            </Field>
            <Field label="Place Issued" required error={errors?.[`${prefix}.issuedPlace`]}>
                <input
                    type="text"
                    value={data.issuedPlace}
                    onChange={(e) => onChange('issuedPlace', e.target.value)}
                    placeholder="e.g. Manila"
                    className={inputCls(errors?.[`${prefix}.issuedPlace`])}
                />
            </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <FileUpload
                label="Front of ID"
                value={data.frontFile}
                onChange={(file) => onChange('frontFile', file)}
                required
                error={errors?.[`${prefix}.frontFile`]}
            />
            <FileUpload
                label="Back of ID (optional)"
                value={data.backFile}
                onChange={(file) => onChange('backFile', file)}
            />
        </div>
    </div>
);

// --- Helper functions ---
const formatMobile = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
};

const calculateAge = (dob) => {
    if (!dob) return null;
    const today = new Date();
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
};

// --- Main form component ---
const AddCustomer = ({ onCancel, onSave, publicMode = false, submitting = false }) => {
    const [form, setForm] = useState({
        // Personal
        firstName: '',
        middleName: '',
        lastName: '',
        dob: '',
        email: '',
        mobile: '',
        // Address
        addressLine1: '',
        addressLine2: '',
        province: '',
        provinceText: '',
        city: '',
        cityText: '',
        barangay: '',
        zipCode: '',
        // KYC
        kycMode: 'primary',
        primaryId: { idType: '', idNumber: '', issuedDate: '', issuedPlace: '', frontFile: null, backFile: null },
        secondaryId1: { idType: '', idNumber: '', issuedDate: '', issuedPlace: '', frontFile: null, backFile: null },
        secondaryId2: { idType: '', idNumber: '', issuedDate: '', issuedPlace: '', frontFile: null, backFile: null },
    });

    const [errors, setErrors] = useState({});
    const [activeSection, setActiveSection] = useState('personal');
    const [submitted, setSubmitted] = useState(false);

    // Address dropdown data - fetched from API
    const [provinces, setProvinces] = useState([]);
    const [cities, setCities] = useState([]);
    const [barangays, setBarangays] = useState([]);
    const [loadingProvinces, setLoadingProvinces] = useState(false);
    const [loadingCities, setLoadingCities] = useState(false);
    const [loadingBarangays, setLoadingBarangays] = useState(false);

    // Track active section for nav highlight
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) setActiveSection(e.target.id);
                });
            },
            { threshold: 0.35 }
        );
        SECTIONS.forEach((s) => {
            const el = document.getElementById(s.id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);

    // Fetch provinces on mount
    useEffect(() => {
        setLoadingProvinces(true);
        locationsApi
            .provinces()
            .then((items) => items.map((name) => ({ code: name, name })))
            .then(setProvinces)
            .catch((err) => {
                console.error('Failed to load provinces', err);
                setProvinces([]);
            })
            .finally(() => setLoadingProvinces(false));
    }, []);

    const set = (field) => (e) => {
        const value = e?.target !== undefined ? e.target.value : e;
        setForm((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
    };

    const setIdField = (idKey, field, value) => {
        setForm((prev) => ({
            ...prev,
            [idKey]: { ...prev[idKey], [field]: value },
        }));
        const errorKey = `${idKey}.${field}`;
        if (errors[errorKey]) setErrors((prev) => ({ ...prev, [errorKey]: '' }));
    };

    // Handle mobile formatting
    const handleMobileChange = (e) => {
        const formatted = formatMobile(e.target.value);
        set('mobile')(formatted);
    };

    // Cascading address handlers (API-driven)
    const handleProvinceChange = async (e) => {
        const name = e.target.value;
        setForm((prev) => ({
            ...prev,
            province: name,
            provinceText: name,
            city: '',
            cityText: '',
            barangay: '',
            zipCode: '',
        }));
        setCities([]);
        setBarangays([]);
        if (errors.province) setErrors((prev) => ({ ...prev, province: '' }));
        if (!name) return;

        setLoadingCities(true);
        try {
            const cityList = await locationsApi.cities(name);
            const mapped = (cityList || []).map((c) => ({
                code: c.name,
                name: c.name,
                zipCode: c.zip || '',
            }));
            setCities(mapped);
        } catch (err) {
            console.error('Failed to load cities', err);
            setCities([]);
        } finally {
            setLoadingCities(false);
        }
    };

    const handleCityChange = async (e) => {
        const code = e.target.value;
        const city = cities.find((c) => c.code === code);
        setForm((prev) => ({
            ...prev,
            city: code,
            cityText: city?.name || '',
            barangay: '',
            zipCode: city?.zipCode || '',
        }));
        setBarangays([]);
        if (errors.city) setErrors((prev) => ({ ...prev, city: '' }));

        if (code && form.province) {
            setLoadingBarangays(true);
            try {
                const brgyList = await locationsApi.barangays(form.province, city?.name || code);
                setBarangays(brgyList || []);
            } catch (err) {
                console.error('Failed to load barangays', err);
                setBarangays([]);
            } finally {
                setLoadingBarangays(false);
            }
        }
    };

    const handleBarangayChange = (e) => {
        const value = e.target.value;
        setForm((prev) => ({ ...prev, barangay: value }));
        if (errors.barangay) setErrors((prev) => ({ ...prev, barangay: '' }));
    };

    // Validation
    const validateIdBlock = (data, prefix) => {
        const e = {};
        if (!data.idType) e[`${prefix}.idType`] = 'Required';
        if (!data.idNumber.trim()) e[`${prefix}.idNumber`] = 'Required';
        if (!data.issuedDate) e[`${prefix}.issuedDate`] = 'Required';
        if (!data.issuedPlace.trim()) e[`${prefix}.issuedPlace`] = 'Required';
        if (!data.frontFile) e[`${prefix}.frontFile`] = 'Required';
        return e;
    };

    const validate = () => {
        const e = {};
        if (!form.firstName.trim()) e.firstName = 'First name is required';
        if (!form.lastName.trim()) e.lastName = 'Last name is required';
        if (!form.dob) e.dob = 'Date of birth is required';
        else {
            const age = calculateAge(form.dob);
            if (age !== null && age < 18) e.dob = 'Must be at least 18 years old';
        }
        if (!form.email.trim()) e.email = 'Email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email address';
        const mobileDigits = form.mobile.replace(/\D/g, '');
        if (!mobileDigits) e.mobile = 'Mobile number is required';
        else if (mobileDigits.length !== 10) e.mobile = 'Must be 10 digits';
        else if (!mobileDigits.startsWith('9')) e.mobile = 'Must start with 9';

        // Address
        if (!form.addressLine1.trim()) e.addressLine1 = 'Required';
        if (!form.province) e.province = 'Required';
        if (!form.city) e.city = 'Required';
        if (!form.barangay.trim()) e.barangay = 'Required';

        // KYC — optional in public mode
        if (!publicMode) {
            if (form.kycMode === 'primary') {
                Object.assign(e, validateIdBlock(form.primaryId, 'primaryId'));
            } else {
                Object.assign(e, validateIdBlock(form.secondaryId1, 'secondaryId1'));
                Object.assign(e, validateIdBlock(form.secondaryId2, 'secondaryId2'));
            }
        }

        return e;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setSubmitted(true);
        const validationErrors = validate();
        setErrors(validationErrors);

        if (Object.keys(validationErrors).length === 0) {
            const payload = {
                personalInfo: {
                    firstName: form.firstName,
                    middleName: form.middleName,
                    lastName: form.lastName,
                    dateOfBirth: form.dob,
                    email: form.email,
                    mobileNumber: '+63' + form.mobile.replace(/\D/g, ''),
                },
                address: {
                    addressLine1: form.addressLine1,
                    addressLine2: form.addressLine2,
                    province: form.province,
                    provinceText: form.provinceText,
                    city: form.city,
                    cityText: form.cityText,
                    barangay: form.barangay,
                    zipCode: form.zipCode,
                },
                kyc: {
                    mode: form.kycMode,
                    ...(form.kycMode === 'primary'
                        ? { primaryId: { ...form.primaryId } }
                        : {
                            secondaryIds: [
                                { ...form.secondaryId1 },
                                { ...form.secondaryId2 },
                            ],
                        }),
                },
            };
            onSave?.(payload);
        }
    };

    // Progress calculation
    const required = ['firstName', 'lastName', 'dob', 'email', 'mobile', 'addressLine1', 'province', 'city', 'barangay'];
    const filled = required.filter((k) => String(form[k]).trim() !== '').length;
    const progress = Math.round((filled / required.length) * 100);

    return (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-0 w-full">

            {/* -- Sticky top bar: stepper -- */}
            <div className="sticky top-0 z-20 bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-md -mx-4 px-4 sm:px-8 py-4 mb-6 border-b border-neutral-200/60 dark:border-neutral-700/40">
                <StepNav steps={SECTIONS} active={activeSection} />
            </div>

            {/* -- Form sections -- */}
            <div className="flex flex-col gap-6">
                {/* -- 1. Personal Information -- */}
                <SectionCard id="personal" icon="person" title="Personal Information" description="Basic customer details">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Field label="First Name" required error={errors.firstName}>
                            <input
                                type="text"
                                value={form.firstName}
                                onChange={set('firstName')}
                                placeholder="Juan"
                                className={inputCls(errors.firstName)}
                            />
                        </Field>
                        <Field label="Middle Name">
                            <input
                                type="text"
                                value={form.middleName}
                                onChange={set('middleName')}
                                placeholder="Santos (optional)"
                                className={inputCls(null)}
                            />
                        </Field>
                        <Field label="Last Name" required error={errors.lastName}>
                            <input
                                type="text"
                                value={form.lastName}
                                onChange={set('lastName')}
                                placeholder="Dela Cruz"
                                className={inputCls(errors.lastName)}
                            />
                        </Field>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                        <Field label="Date of Birth" required error={errors.dob} hint={form.dob ? `Age: ${calculateAge(form.dob)}` : 'Must be 18+'}>
                            <input
                                type="date"
                                value={form.dob}
                                onChange={set('dob')}
                                max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().split('T')[0]; })()}
                                className={inputCls(errors.dob)}
                            />
                        </Field>
                        <Field label="Email Address" required error={errors.email}>
                            <input
                                type="email"
                                value={form.email}
                                onChange={set('email')}
                                placeholder="juan@email.com"
                                className={inputCls(errors.email)}
                            />
                        </Field>
                        <Field label="Mobile Number" required error={errors.mobile}>
                            <div className="flex">
                                <span className="flex items-center px-3 bg-neutral-100 dark:bg-neutral-700 border border-r-0 border-neutral-200 dark:border-neutral-600 rounded-sm-l-lg text-sm font-semibold text-neutral-500 dark:text-neutral-400">
                                    +63
                                </span>
                                <input
                                    type="tel"
                                    value={form.mobile}
                                    onChange={handleMobileChange}
                                    placeholder="9XX XXX XXXX"
                                    className={`${inputCls(errors.mobile)} rounded-sm-l-none`}
                                />
                            </div>
                        </Field>
                    </div>
                </SectionCard>

                {/* -- 2. Current Address -- */}
                <SectionCard id="address" icon="home" title="Current Address" description="Philippine address for correspondence">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Address Line 1" required error={errors.addressLine1}>
                            <input
                                type="text"
                                value={form.addressLine1}
                                onChange={set('addressLine1')}
                                placeholder="House No., Street, Building"
                                className={inputCls(errors.addressLine1)}
                            />
                        </Field>
                        <Field label="Address Line 2 (optional)">
                            <input
                                type="text"
                                value={form.addressLine2}
                                onChange={set('addressLine2')}
                                placeholder="Apartment, floor, unit"
                                className={inputCls(null)}
                            />
                        </Field>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                        <Field label="Province" required error={errors.province}>
                            <select
                                value={form.province}
                                onChange={handleProvinceChange}
                                className={selectCls(errors.province)}
                                disabled={loadingProvinces}
                            >
                                <option value="">{loadingProvinces ? 'Loading...' : 'Select province...'}</option>
                                {provinces.map((p) => (
                                    <option key={p.code} value={p.code}>{p.name}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="City / Municipality" required error={errors.city}>
                            <select
                                value={form.city}
                                onChange={handleCityChange}
                                className={selectCls(errors.city)}
                                disabled={!form.province || loadingCities}
                            >
                                <option value="">{form.province ? (loadingCities ? 'Loading...' : 'Select city...') : 'Select province first'}</option>
                                {cities.map((c) => (
                                    <option key={c.code} value={c.code}>{c.name}</option>
                                ))}
                            </select>
                        </Field>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                        <Field label="Barangay" required error={errors.barangay}>
                            <select
                                value={form.barangay}
                                onChange={handleBarangayChange}
                                className={selectCls(errors.barangay)}
                                disabled={!form.city || loadingBarangays}
                            >
                                <option value="">{form.city ? (loadingBarangays ? 'Loading barangays...' : 'Select barangay...') : 'Select city first'}</option>
                                {barangays.map((b) => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="ZIP Code" hint="Auto-filled from city; editable">
                            <input
                                type="text"
                                value={form.zipCode}
                                onChange={set('zipCode')}
                                placeholder="0000"
                                className={inputCls(null)}
                            />
                        </Field>
                    </div>
                </SectionCard>

                {/* -- 3. Identity Verification (KYC) -- */}
                <SectionCard id="identity" icon="verified_user" title={publicMode ? 'Identity Verification (Optional)' : 'Identity Verification'} description={publicMode ? 'You may provide KYC documents now or during your visit' : 'BSP-required KYC documentation'} accent={!publicMode} badge={publicMode ? null : 'Compliance'}>
                    {/* KYC Mode Toggle */}
                    <div className="mb-6">
                        <Toggle
                            checked={form.kycMode}
                            onChange={(v) => set('kycMode')(v)}
                            options={[
                                { value: 'primary', label: 'Primary ID', icon: 'badge' },
                                { value: 'secondary', label: 'Secondary IDs', icon: 'layers' },
                            ]}
                        />
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                            {form.kycMode === 'primary'
                                ? 'Provide one (1) valid government-issued primary ID'
                                : 'Provide two (2) valid secondary IDs for verification'}
                        </p>
                    </div>

                    {form.kycMode === 'primary' ? (
                        <IDBlock
                            prefix="primaryId"
                            data={form.primaryId}
                            errors={errors}
                            onChange={(field, value) => setIdField('primaryId', field, value)}
                        />
                    ) : (
                        <div className="flex flex-col gap-5">
                            <IDBlock
                                title="Secondary ID #1"
                                prefix="secondaryId1"
                                data={form.secondaryId1}
                                errors={errors}
                                onChange={(field, value) => setIdField('secondaryId1', field, value)}
                            />
                            <IDBlock
                                title="Secondary ID #2"
                                prefix="secondaryId2"
                                data={form.secondaryId2}
                                errors={errors}
                                onChange={(field, value) => setIdField('secondaryId2', field, value)}
                            />
                        </div>
                    )}
                </SectionCard>

                    {/* -- Bottom action bar -- */}
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
                            <button type="submit" disabled={submitting} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-sm text-sm font-bold bg-primary hover:bg-primary-hover text-neutral-900 shadow-sm shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
                                {submitting ? (
                                    <><span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>Submitting...</>
                                ) : (
                                    <><span className="material-symbols-outlined text-[18px]">{publicMode ? 'send' : 'person_add'}</span>{publicMode ? 'Submit Request' : 'Save Customer'}</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </form>
    );
};

export default AddCustomer;
