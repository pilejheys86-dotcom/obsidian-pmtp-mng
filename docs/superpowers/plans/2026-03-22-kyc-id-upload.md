# KYC ID Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a camera-based ID capture section (Section C) to the KYC page with a card-shaped proximity guide overlay, ImageKit upload, and front/back support.

**Architecture:** A reusable `CameraCapture` component handles the viewfinder + guide overlay + file fallback. The KYC page orchestrates front/back capture flow, uploads images client-side to ImageKit (using server-signed auth), and sends the URLs with the KYC form. Three new columns on `tenant_users` store the ID data.

**Tech Stack:** `navigator.mediaDevices.getUserMedia`, HTML Canvas, ImageKit upload API, React 18, TailwindCSS

**Spec:** `docs/superpowers/specs/2026-03-22-kyc-id-upload-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `sql/102_kyc_id_columns.sql` | Create | Add id_type, id_front_url, id_back_url to tenant_users |
| `MasterSchema.md` | Modify | Document new columns |
| `server/routes/auth.js` | Modify | Accept + store ID fields in complete-kyc endpoint |
| `src/components/ui/CameraCapture.jsx` | Create | Reusable camera viewfinder with guide overlay + file fallback |
| `src/pages/owner/KycPage.jsx` | Modify | Add Section C: ID type select, front/back capture, previews |
| `src/components/ui/index.js` | Modify | Export CameraCapture |

---

### Task 1: SQL Migration + Schema Update

**Files:**
- Create: `sql/102_kyc_id_columns.sql`
- Modify: `MasterSchema.md`

- [ ] **Step 1: Create migration**

```sql
-- ============================================================================
-- MIGRATION 102: KYC ID Upload Columns
-- Date: 2026-03-22
-- ============================================================================

ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS id_type VARCHAR(50);
ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS id_front_url TEXT;
ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS id_back_url TEXT;
```

- [ ] **Step 2: Update MasterSchema.md**

In the `tenant_users` table, add after `kyc_status`:

```sql
    -- KYC ID verification
    id_type             VARCHAR(50),                        -- e.g. PHILSYS, DRIVERS_LICENSE, SSS
    id_front_url        TEXT,                               -- ImageKit URL for front of ID
    id_back_url         TEXT,                               -- ImageKit URL for back of ID (optional)
```

---

### Task 2: Backend — Accept ID Fields in complete-kyc

**Files:**
- Modify: `server/routes/auth.js`

- [ ] **Step 1: Update the complete-kyc endpoint**

In `POST /api/auth/complete-kyc`:

1. Add `idType`, `idFrontUrl`, `idBackUrl` to the destructuring from `req.body`
2. Add validation: `if (!idType) missing.push('idType')` and `if (!idFrontUrl) missing.push('idFrontUrl')`
3. After the `complete_owner_kyc` RPC succeeds, update the tenant_users row with ID fields:

```javascript
    // Store KYC ID data
    if (idType && idFrontUrl) {
      await supabaseAdmin
        .from('tenant_users')
        .update({
          id_type: idType,
          id_front_url: idFrontUrl,
          id_back_url: idBackUrl || null,
        })
        .eq('id', req.userId);
    }
```

---

### Task 3: CameraCapture Component

**Files:**
- Create: `src/components/ui/CameraCapture.jsx`
- Modify: `src/components/ui/index.js`

- [ ] **Step 1: Create the CameraCapture component**

Props:
```javascript
{
  onCapture: (blob) => void,  // called when user confirms a photo
  guideLabel: string,          // "Align the front of your ID within the frame"
  onClose: () => void,         // close the viewfinder
}
```

Implementation:
- `useRef` for `<video>` and `<canvas>` elements
- `useEffect` to start camera stream on mount, stop on unmount
- Request rear camera: `{ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } }`
- If `getUserMedia` fails, set `cameraError = true` and show file upload only
- **Viewfinder layout:**
  - Full container with video feed
  - Dark semi-transparent overlay (`bg-black/60`) covering everything
  - Card-shaped cutout in the center (CSS mask or SVG overlay) with lime-green border
  - Guide label text above the cutout
- **Capture button:** Centered below the viewfinder, circular with camera icon
- **On capture:**
  - Draw current video frame to hidden canvas (match video resolution)
  - Convert to JPEG blob (`canvas.toBlob(cb, 'image/jpeg', 0.85)`)
  - Stop the video stream
  - Show preview (blob as object URL) with "Retake" and "Use this photo" buttons
  - On "Use this photo" → call `onCapture(blob)`
  - On "Retake" → restart the camera stream
- **File fallback:**
  - "Upload from gallery" button always visible below capture button
  - `<input type="file" accept="image/*">` (hidden, triggered by button)
  - On file select → show preview → same Retake/Use flow
- **Close button:** X icon in top-right corner, calls `onClose()`

Guide overlay approach (simplest — no CSS mask needed):
```jsx
{/* Overlay: 4 dark rectangles around the cutout */}
<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
  {/* Top */}
  <div className="absolute top-0 left-0 right-0 bg-black/60" style={{ height: 'calc(50% - 120px)' }} />
  {/* Bottom */}
  <div className="absolute bottom-0 left-0 right-0 bg-black/60" style={{ height: 'calc(50% - 120px)' }} />
  {/* Left */}
  <div className="absolute bg-black/60" style={{ top: 'calc(50% - 120px)', bottom: 'calc(50% - 120px)', left: 0, width: 'calc(50% - 190px)' }} />
  {/* Right */}
  <div className="absolute bg-black/60" style={{ top: 'calc(50% - 120px)', bottom: 'calc(50% - 120px)', right: 0, width: 'calc(50% - 190px)' }} />
  {/* Guide border */}
  <div className="border-2 border-dashed border-primary rounded-lg" style={{ width: '380px', height: '240px' }} />
</div>
```

- [ ] **Step 2: Export from index.js**

Add `export { default as CameraCapture } from './CameraCapture'` to `src/components/ui/index.js`.

---

### Task 4: Add Section C to KycPage

**Files:**
- Modify: `src/pages/owner/KycPage.jsx`

- [ ] **Step 1: Add ID state to the form**

Add to the existing `form` state:
```javascript
    idType: '',
    idFrontUrl: '',
    idBackUrl: '',
```

Add component-level state:
```javascript
const [hasBackSide, setHasBackSide] = useState(false)
const [captureMode, setCaptureMode] = useState(null) // 'front' | 'back' | null
const [uploading, setUploading] = useState(false)
```

- [ ] **Step 2: Add ImageKit upload helper**

```javascript
const uploadToImageKit = async (blob, side) => {
  setUploading(true)
  try {
    // Get auth params from backend
    const auth = await uploadApi.imagekitAuth()

    const formData = new FormData()
    formData.append('file', blob)
    formData.append('publicKey', import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY)
    formData.append('signature', auth.signature)
    formData.append('expire', auth.expire)
    formData.append('token', auth.token)
    formData.append('fileName', `${form.idType}_${side}_${Date.now()}.jpg`)
    formData.append('folder', '/kyc/')

    const res = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) throw new Error('Upload failed')
    const data = await res.json()
    return data.url
  } finally {
    setUploading(false)
  }
}
```

- [ ] **Step 3: Add capture handlers**

```javascript
const handleCapture = async (blob) => {
  const url = await uploadToImageKit(blob, captureMode)
  if (captureMode === 'front') {
    setForm(prev => ({ ...prev, idFrontUrl: url }))
    setCaptureMode(null)
    // If back side needed, auto-open back capture
    if (hasBackSide) {
      setTimeout(() => setCaptureMode('back'), 300)
    }
  } else {
    setForm(prev => ({ ...prev, idBackUrl: url }))
    setCaptureMode(null)
  }
}
```

- [ ] **Step 4: Add Section C UI**

After Section B's closing `</div>`, before the submit button, add Section C:

ID type constants:
```javascript
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
```

Section C layout:
- Same card style as Sections A and B
- Section header with `badge` icon and title "Section C — ID Verification"
- ID Type dropdown (required)
- Checkbox: "This ID has a back side"
- If `idType` is selected and `captureMode === null` and no front image yet: show "Capture Front" button
- If `captureMode` is set: render `<CameraCapture>` with appropriate guide label
- Preview thumbnails for captured front/back with "Remove" buttons
- If front captured and `hasBackSide` and no back yet: show "Capture Back" button
- Locked state: show ID type as text, images as thumbnails, no buttons

- [ ] **Step 5: Update form submission validation**

Add to the existing validation:
```javascript
if (!form.idType) missing.push('idType')
if (!form.idFrontUrl) missing.push('idFrontUrl')
if (hasBackSide && !form.idBackUrl) missing.push('idBackUrl')
```

Update the `authApi.completeKyc()` call to include:
```javascript
idType: form.idType,
idFrontUrl: form.idFrontUrl,
idBackUrl: form.idBackUrl || null,
```

- [ ] **Step 6: Update locked state pre-fill**

In the `useEffect` that pre-fills from profile, add:
```javascript
idType: profile?.id_type || '',
idFrontUrl: profile?.id_front_url || '',
idBackUrl: profile?.id_back_url || '',
```

And set `hasBackSide` if `profile?.id_back_url` exists.

- [ ] **Step 7: Add `uploadApi` import**

Update the import at the top:
```javascript
import { authApi, locationsApi, uploadApi } from '../../lib/api'
```
