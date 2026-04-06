import { useState, useEffect, useMemo } from 'react'
import { Sidebar, Header } from '../../components/layout'
import { CameraCapture } from '../../components/ui'
import { getNavigationByRole } from '../../config'
import { useAuth } from '../../context'
import { authApi, locationsApi, uploadApi } from '../../lib/api'

const ID_TYPES = [
  { value: 'PHILSYS', label: 'PhilSys National ID' },
  { value: 'DRIVERS_LICENSE', label: "Driver's License" },
  { value: 'SSS', label: 'SSS ID' },
  { value: 'PHILHEALTH', label: 'PhilHealth ID' },
  { value: 'TIN', label: 'TIN ID' },
  { value: 'POSTAL', label: 'Postal ID' },
  { value: 'VOTERS', label: "Voter's ID" },
  { value: 'PRC', label: 'PRC ID' },
]

const KycPage = () => {
  const { profile, fetchProfile } = useAuth()
  const navigation = getNavigationByRole(profile?.role)

  // ── Form state ────────────────────────────────────────
  const [form, setForm] = useState({
    businessName: '',
    businessType: '',
    bspRegNo: '',
    secDtiRegNo: '',
    tinNumber: '',
    branchName: '',
    streetAddress: '',
    province: '',
    cityMunicipality: '',
    barangay: '',
    zipCode: '',
    branchPhone: '',
    idType: '',
    idFrontUrl: '',
    idBackUrl: '',
  })

  // ── Location cascading state ──────────────────────────
  const [provinces, setProvinces] = useState([])
  const [cities, setCities] = useState([])
  const [barangays, setBarangays] = useState([])
  const [loadingProvinces, setLoadingProvinces] = useState(false)
  const [loadingCities, setLoadingCities] = useState(false)
  const [loadingBarangays, setLoadingBarangays] = useState(false)

  // ── UI state ──────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // ── ID capture state ────────────────────────────────
  const [hasBackSide, setHasBackSide] = useState(false)
  const [captureMode, setCaptureMode] = useState(null) // 'front' | 'back' | null
  const [uploading, setUploading] = useState(false)

  // ── ImageKit upload helper ──────────────────────────
  const uploadToImageKit = async (blob, side) => {
    setUploading(true)
    try {
      const auth = await uploadApi.imagekitAuth()
      const fd = new FormData()
      fd.append('file', blob)
      fd.append('publicKey', import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY)
      fd.append('signature', auth.signature)
      fd.append('expire', auth.expire)
      fd.append('token', auth.token)
      fd.append('fileName', `${form.idType}_${side}_${Date.now()}.jpg`)
      fd.append('folder', '/kyc/')

      const res = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      return data.url
    } finally {
      setUploading(false)
    }
  }

  const handleIdCapture = async (blob) => {
    try {
      const url = await uploadToImageKit(blob, captureMode)
      if (captureMode === 'front') {
        setForm(prev => ({ ...prev, idFrontUrl: url }))
        setCaptureMode(null)
        if (hasBackSide) {
          setTimeout(() => setCaptureMode('back'), 300)
        }
      } else {
        setForm(prev => ({ ...prev, idBackUrl: url }))
        setCaptureMode(null)
      }
    } catch {
      setError('Failed to upload ID image. Please try again.')
      setCaptureMode(null)
    }
  }

  // ── Load provinces on mount ───────────────────────────
  useEffect(() => {
    setLoadingProvinces(true)
    locationsApi.provinces()
      .then(setProvinces)
      .catch(() => setProvinces([]))
      .finally(() => setLoadingProvinces(false))
  }, [])

  // ── Load cities when province changes ─────────────────
  useEffect(() => {
    if (!form.province) {
      setCities([])
      setBarangays([])
      return
    }
    setLoadingCities(true)
    setCities([])
    setBarangays([])
    locationsApi.cities(form.province)
      .then(setCities)
      .catch(() => setCities([]))
      .finally(() => setLoadingCities(false))
  }, [form.province])

  // ── Load barangays when city changes ──────────────────
  useEffect(() => {
    if (!form.province || !form.cityMunicipality) {
      setBarangays([])
      return
    }
    setLoadingBarangays(true)
    setBarangays([])
    locationsApi.barangays(form.province, form.cityMunicipality)
      .then(setBarangays)
      .catch(() => setBarangays([]))
      .finally(() => setLoadingBarangays(false))
  }, [form.province, form.cityMunicipality])

  // ── Auto-fill zip from city selection ─────────────────
  const handleCityChange = (e) => {
    const selectedCity = e.target.value
    const cityObj = cities.find((c) =>
      (typeof c === 'string' ? c : c.name || c.city_municipality) === selectedCity
    )
    const zip = cityObj?.zip_code || cityObj?.zipCode || cityObj?.zip || ''
    setForm((prev) => ({
      ...prev,
      cityMunicipality: selectedCity,
      barangay: '',
      zipCode: zip,
    }))
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleProvinceChange = (e) => {
    setForm((prev) => ({
      ...prev,
      province: e.target.value,
      cityMunicipality: '',
      barangay: '',
      zipCode: '',
    }))
  }

  // ── Submit ────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    // ID validation
    if (!form.idType) { setError('Please select an ID type.'); return }
    if (!form.idFrontUrl) { setError('Please capture the front of your ID.'); return }
    if (hasBackSide && !form.idBackUrl) { setError('Please capture the back of your ID.'); return }

    setSubmitting(true)
    try {
      await authApi.completeKyc({
        businessName: form.businessName,
        businessType: form.businessType,
        bspRegNo: form.bspRegNo,
        secDtiRegNo: form.secDtiRegNo,
        tinNumber: form.tinNumber,
        branchName: form.branchName,
        streetAddress: form.streetAddress,
        province: form.province,
        cityMunicipality: form.cityMunicipality,
        barangay: form.barangay,
        zipCode: form.zipCode,
        branchPhone: form.branchPhone,
        idType: form.idType,
        idFrontUrl: form.idFrontUrl,
        idBackUrl: form.idBackUrl || null,
      })
      setSuccess(true)
      setEditing(false)
      await fetchProfile()
    } catch (err) {
      setError(err.message || 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Helper: derive display name from location objects ─
  const getLabel = (item) => {
    if (typeof item === 'string') return item
    return item.name || item.province_name || item.city_municipality || item.barangay_name || ''
  }
  const getValue = (item) => {
    if (typeof item === 'string') return item
    return item.name || item.province_name || item.city_municipality || item.barangay_name || ''
  }

  // ── Editing state (for submitted KYC) ────────────────
  const [editing, setEditing] = useState(false)

  // ── Pre-fill form from profile when KYC already submitted ──
  const isSubmitted = profile?.kyc_status && profile.kyc_status !== 'PENDING'

  useEffect(() => {
    if (isSubmitted && profile?.tenants) {
      const t = profile.tenants
      const b = profile.branches
      setForm({
        businessName: t.business_name || '',
        businessType: t.business_type || '',
        bspRegNo: t.bsp_registration_no || '',
        secDtiRegNo: t.sec_dti_registration_no || '',
        tinNumber: t.tin_number || '',
        branchName: b?.branch_name || '',
        streetAddress: b?.address || '',
        province: b?.province || '',
        cityMunicipality: b?.city_municipality || '',
        barangay: b?.barangay || '',
        zipCode: b?.zip_code || '',
        branchPhone: b?.phone || '',
        idType: profile?.id_type || '',
        idFrontUrl: profile?.id_front_url || '',
        idBackUrl: profile?.id_back_url || '',
      })
      if (profile?.id_back_url) setHasBackSide(true)
    }
  }, [isSubmitted, profile?.tenants, profile?.branches])

  const isLocked = isSubmitted && !editing

  const [currentPath] = useState('/admin/kyc')
  const currentUser = useMemo(() => ({
    name: profile?.full_name || 'User',
    role: profile?.role || 'OWNER',
    initials: (profile?.full_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
  }), [profile])

  const navigateTo = (path) => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  return (
    <div className="admin-layout">
      <Sidebar navigation={navigation} currentPath={currentPath} onNavigate={navigateTo} />
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">System</p>
            <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">
              Business Verification
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {isSubmitted
                ? 'Your business details have been submitted.'
                : 'Complete your KYC to activate your pawnshop account.'}
            </p>
            {isSubmitted && (
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-lime-100 dark:bg-lime-900/30 text-lime-700 dark:text-lime-400 text-xs font-medium">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                {profile.kyc_status}
              </div>
            )}
          </div>
          {isSubmitted && (
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">{editing ? 'lock' : 'edit'}</span>
              {editing ? 'Lock' : 'Edit'}
            </button>
          )}
        </div>

        {/* Success alert */}
        {success && (
          <div className="flex items-start gap-3 p-4 rounded-sm bg-lime-50 dark:bg-lime-900/20 border border-lime-300 dark:border-lime-700">
            <span className="material-symbols-outlined text-lime-600 dark:text-lime-400 text-xl mt-0.5">
              check_circle
            </span>
            <div>
              <p className="text-sm font-semibold text-lime-800 dark:text-lime-300">
                {isSubmitted ? 'Details updated successfully!' : 'Verification submitted successfully!'}
              </p>
              <p className="text-xs text-lime-700 dark:text-lime-400 mt-0.5">
                {isSubmitted ? 'Your business details have been saved.' : 'Your verification is now under review.'}
              </p>
            </div>
          </div>
        )}

        {/* Error alert */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-sm bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700">
            <span className="material-symbols-outlined text-red-500 text-xl mt-0.5">error</span>
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── Section A: Business Identity ─────────────── */}
          <div className="card-base p-6 space-y-5">
            <div className="flex items-center gap-3 pb-2 border-b border-neutral-200 dark:border-neutral-700">
              <div className="w-8 h-8 rounded-sm bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-primary text-lg">business</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-neutral-800 dark:text-neutral-100">
                  Section A — Business Identity
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Provide your registered business information.
                </p>
              </div>
            </div>

            {/* Business Name */}
            <div>
              <label className="form-label" htmlFor="businessName">
                Business Name <span className="text-red-500">*</span>
              </label>
              <input
                id="businessName"
                name="businessName"
                type="text"
                required
                value={form.businessName}
                onChange={handleChange}
                className="form-input disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="e.g. Juan dela Cruz Pawnshop"
                disabled={isLocked}
              />
            </div>

            {/* BSP Registration No. */}
            <div>
              <label className="form-label" htmlFor="bspRegNo">
                BSP Registration No. <span className="text-red-500">*</span>
              </label>
              <input
                id="bspRegNo"
                name="bspRegNo"
                type="text"
                required
                value={form.bspRegNo}
                onChange={handleChange}
                className="form-input disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="e.g. BSP-XXXX-XXXXXX"
                disabled={isLocked}
              />
            </div>

            {/* SEC / DTI Registration No. */}
            <div>
              <label className="form-label" htmlFor="secDtiRegNo">
                SEC / DTI Registration No.
                <span className="ml-1 text-neutral-400 dark:text-neutral-500 font-normal text-xs">(optional)</span>
              </label>
              <input
                id="secDtiRegNo"
                name="secDtiRegNo"
                type="text"
                value={form.secDtiRegNo}
                onChange={handleChange}
                className="form-input disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="e.g. DTI-XXXXXXXXX or SEC-XXXXXX"
                disabled={isLocked}
              />
            </div>

            {/* TIN Number */}
            <div>
              <label className="form-label" htmlFor="tinNumber">
                TIN Number <span className="text-red-500">*</span>
              </label>
              <input
                id="tinNumber"
                name="tinNumber"
                type="text"
                required
                value={form.tinNumber}
                onChange={handleChange}
                className="form-input disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="e.g. 123-456-789-000"
                disabled={isLocked}
              />
            </div>
          </div>

          {/* ── Section B: Main Branch & Address ─────────── */}
          <div className="card-base p-6 space-y-5">
            <div className="flex items-center gap-3 pb-2 border-b border-neutral-200 dark:border-neutral-700">
              <div className="w-8 h-8 rounded-sm bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-primary text-lg">location_on</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-neutral-800 dark:text-neutral-100">
                  Section B — Main Branch & Address
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Your primary branch location details.
                </p>
              </div>
            </div>

            {/* Branch Name */}
            <div>
              <label className="form-label" htmlFor="branchName">
                Branch Name <span className="text-red-500">*</span>
              </label>
              <input
                id="branchName"
                name="branchName"
                type="text"
                required
                value={form.branchName}
                onChange={handleChange}
                className="form-input disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="e.g. Main Branch"
                disabled={isLocked}
              />
            </div>

            {/* Street Address */}
            <div>
              <label className="form-label" htmlFor="streetAddress">
                Street Address <span className="text-red-500">*</span>
              </label>
              <input
                id="streetAddress"
                name="streetAddress"
                type="text"
                required
                value={form.streetAddress}
                onChange={handleChange}
                className="form-input disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="e.g. 123 Rizal Street"
                disabled={isLocked}
              />
            </div>

            {/* Province */}
            <div>
              <label className="form-label" htmlFor="province">
                Province <span className="text-red-500">*</span>
              </label>
              <select
                id="province"
                name="province"
                required
                value={form.province}
                onChange={handleProvinceChange}
                className="form-input disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isLocked || loadingProvinces}
              >
                <option value="">
                  {loadingProvinces ? 'Loading provinces…' : 'Select province…'}
                </option>
                {provinces.map((p, i) => (
                  <option key={i} value={getValue(p)}>
                    {getLabel(p)}
                  </option>
                ))}
              </select>
            </div>

            {/* City / Municipality */}
            <div>
              <label className="form-label" htmlFor="cityMunicipality">
                City / Municipality <span className="text-red-500">*</span>
              </label>
              <select
                id="cityMunicipality"
                name="cityMunicipality"
                required
                value={form.cityMunicipality}
                onChange={handleCityChange}
                className="form-input"
                disabled={isLocked || !form.province || loadingCities}
              >
                <option value="">
                  {!form.province
                    ? 'Select a province first'
                    : loadingCities
                    ? 'Loading cities…'
                    : 'Select city / municipality…'}
                </option>
                {cities.map((c, i) => (
                  <option key={i} value={getValue(c)}>
                    {getLabel(c)}
                  </option>
                ))}
              </select>
            </div>

            {/* Barangay */}
            <div>
              <label className="form-label" htmlFor="barangay">
                Barangay <span className="text-red-500">*</span>
              </label>
              <select
                id="barangay"
                name="barangay"
                required
                value={form.barangay}
                onChange={handleChange}
                className="form-input"
                disabled={isLocked || !form.cityMunicipality || loadingBarangays}
              >
                <option value="">
                  {!form.cityMunicipality
                    ? 'Select a city first'
                    : loadingBarangays
                    ? 'Loading barangays…'
                    : 'Select barangay…'}
                </option>
                {barangays.map((b, i) => (
                  <option key={i} value={getValue(b)}>
                    {getLabel(b)}
                  </option>
                ))}
              </select>
            </div>

            {/* ZIP Code + Branch Phone (two-column) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label" htmlFor="zipCode">
                  ZIP Code <span className="text-red-500">*</span>
                </label>
                <input
                  id="zipCode"
                  name="zipCode"
                  type="text"
                  required
                  maxLength={4}
                  pattern="\d{4}"
                  value={form.zipCode}
                  onChange={handleChange}
                  className="form-input disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder="e.g. 1000"
                  disabled={isLocked}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="branchPhone">
                  Branch Phone
                  <span className="ml-1 text-neutral-400 dark:text-neutral-500 font-normal text-xs">(optional)</span>
                </label>
                <input
                  id="branchPhone"
                  name="branchPhone"
                  type="tel"
                  value={form.branchPhone}
                  onChange={handleChange}
                  className="form-input disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder="e.g. 02-8XXX-XXXX"
                  disabled={isLocked}
                />
              </div>
            </div>
          </div>

          {/* ── Section C: ID Verification ─────────────────── */}
          <div className="card-base p-6 space-y-5">
            <div className="flex items-center gap-3 pb-2 border-b border-neutral-200 dark:border-neutral-700">
              <div className="w-8 h-8 rounded-sm bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-primary text-lg">badge</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-neutral-800 dark:text-neutral-100">
                  Section C — ID Verification
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Capture a valid government-issued ID.
                </p>
              </div>
            </div>

            {/* ID Type */}
            <div>
              <label className="form-label" htmlFor="idType">
                ID Type <span className="text-red-500">*</span>
              </label>
              {isLocked ? (
                <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  {ID_TYPES.find(t => t.value === form.idType)?.label || form.idType}
                </p>
              ) : (
                <select
                  id="idType"
                  name="idType"
                  required
                  value={form.idType}
                  onChange={handleChange}
                  className="form-input disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={isLocked}
                >
                  <option value="">Select ID type…</option>
                  {ID_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Has back side checkbox */}
            {!isLocked && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasBackSide}
                  onChange={(e) => {
                    setHasBackSide(e.target.checked)
                    if (!e.target.checked) setForm(prev => ({ ...prev, idBackUrl: '' }))
                  }}
                  className="form-checkbox"
                />
                <span className="text-sm text-neutral-700 dark:text-neutral-300">This ID has a back side</span>
              </label>
            )}

            {/* Front image */}
            <div>
              <p className="form-label">Front of ID <span className="text-red-500">*</span></p>
              {form.idFrontUrl ? (
                <div className="relative inline-block">
                  <img
                    src={form.idFrontUrl}
                    alt="ID Front"
                    className="w-64 h-auto rounded-lg border border-neutral-200 dark:border-neutral-700"
                  />
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, idFrontUrl: '' }))}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  )}
                </div>
              ) : !isLocked && form.idType ? (
                <button
                  type="button"
                  onClick={() => setCaptureMode('front')}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:border-primary hover:text-primary transition-colors w-full justify-center"
                >
                  <span className="material-symbols-outlined">photo_camera</span>
                  {uploading ? 'Uploading...' : 'Capture Front'}
                </button>
              ) : !isLocked ? (
                <p className="text-xs text-neutral-400">Select an ID type first</p>
              ) : null}
            </div>

            {/* Back image */}
            {(hasBackSide || form.idBackUrl) && (
              <div>
                <p className="form-label">Back of ID {hasBackSide && <span className="text-red-500">*</span>}</p>
                {form.idBackUrl ? (
                  <div className="relative inline-block">
                    <img
                      src={form.idBackUrl}
                      alt="ID Back"
                      className="w-64 h-auto rounded-lg border border-neutral-200 dark:border-neutral-700"
                    />
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, idBackUrl: '' }))}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    )}
                  </div>
                ) : !isLocked && form.idFrontUrl ? (
                  <button
                    type="button"
                    onClick={() => setCaptureMode('back')}
                    disabled={uploading}
                    className="flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:border-primary hover:text-primary transition-colors w-full justify-center"
                  >
                    <span className="material-symbols-outlined">photo_camera</span>
                    {uploading ? 'Uploading...' : 'Capture Back'}
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {/* Camera overlay */}
          {captureMode && (
            <CameraCapture
              guideLabel={`Align the ${captureMode} of your ID within the frame`}
              onCapture={handleIdCapture}
              onClose={() => setCaptureMode(null)}
            />
          )}

          {/* Submit — hidden when viewing submitted KYC in locked mode */}
          {!isLocked && (
            <button
              type="submit"
              disabled={submitting || success}
              className="btn-primary-full"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-lg">
                    progress_activity
                  </span>
                  Submitting…
                </span>
              ) : isSubmitted ? (
                'Update Verification'
              ) : (
                'Submit for Verification'
              )}
            </button>
          )}
        </form>
      </div>
        </div>
      </main>
    </div>
  )
}

export default KycPage
