# KYC ID Upload — Design Spec

> **Date:** 2026-03-22
> **Status:** Approved
> **Scope:** Add ID upload section (Section C) to KYC page with live camera capture, guide overlay, and ImageKit storage

---

## 1. Overview

Add a required ID verification section to the KYC page. Owners must capture at least one government-issued ID (front photo required, back optional) before submitting KYC. Uses the device camera with a card-shaped proximity guide overlay, with a file upload fallback.

---

## 2. Supported ID Types

All standard Philippine card IDs (same aspect ratio: 85.6mm x 53.98mm, ~1.586:1):

| ID Type | Value |
|---------|-------|
| PhilSys National ID | `PHILSYS` |
| Driver's License | `DRIVERS_LICENSE` |
| SSS ID | `SSS` |
| PhilHealth ID | `PHILHEALTH` |
| TIN ID | `TIN` |
| Postal ID | `POSTAL` |
| Voter's ID | `VOTERS` |
| PRC ID | `PRC` |

Since all IDs share the same card aspect ratio, the proximity guide box is a single fixed shape — no dynamic resizing needed.

---

## 3. Camera Capture UX

### Viewfinder
- Opens device camera via `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`
- Rear camera preferred on mobile, falls back to any available camera
- Video stream rendered in a `<video>` element
- Semi-transparent dark overlay covers the entire viewfinder EXCEPT the card-shaped cutout
- Card-shaped cutout: rounded rectangle (~1.586:1 aspect ratio), centered, with a dashed/solid lime-green border (#A3E635)
- Label above cutout: "Align the front of your ID within the frame" (or "back" for back capture)

### Capture Flow
1. User selects ID type from dropdown
2. Viewfinder opens with guide overlay — label: "Capture Front"
3. User aligns ID → taps "Capture" button
4. Frame freezes → preview shown with "Retake" and "Use this photo" buttons
5. On "Use this photo" → image uploaded to ImageKit → thumbnail shown below
6. If "This ID has a back side" is checked → viewfinder reopens with label: "Capture Back"
7. Same capture flow for back

### Fallback
- "Upload from gallery" button always visible below the viewfinder (or instead of viewfinder if camera unavailable)
- Uses `<input type="file" accept="image/*">` — no `capture` attribute so it offers file picker
- On file selection → preview shown → same "Retake" / "Use this photo" flow

### Camera Error Handling
- If `getUserMedia` fails (permission denied, no camera): hide viewfinder, show only the file upload button with message "Camera unavailable. Upload a photo instead."
- If camera stream drops mid-capture: show error toast, fall back to upload button

---

## 4. Front + Back Logic

- Default: only front capture required
- Checkbox below ID type select: "This ID has a back side"
- When checked: back capture becomes required (form won't submit without it)
- When unchecked after back was captured: back image is cleared

### State
```
idType: string          // selected ID type value
hasBachSide: boolean    // checkbox state
frontImageUrl: string   // ImageKit URL after upload
backImageUrl: string    // ImageKit URL after upload (null if no back)
captureMode: 'front' | 'back' | null  // which side is being captured
```

---

## 5. ImageKit Upload

Uses the existing backend upload endpoint and ImageKit config from `.env`:
- `VITE_IMAGEKIT_PUBLIC_KEY`
- `VITE_IMAGEKIT_URL_ENDPOINT`
- `IMAGEKIT_PRIVATE_KEY`

### Upload Flow
1. Capture produces a canvas blob (JPEG, quality 0.85)
2. POST to backend upload endpoint as `multipart/form-data`
3. Backend uploads to ImageKit, returns the URL
4. URL stored in component state, submitted with KYC form

### File naming
- Pattern: `kyc/{userId}/{idType}_{front|back}_{timestamp}.jpg`

---

## 6. KYC Form Integration

### Section C placement
- After Section B (Main Branch & Address), before the Submit button

### Submit validation
- At least one ID type must be selected
- Front image URL must be present
- If "has back side" is checked, back image URL must be present
- Error: "Please capture your ID to continue"

### Data sent with KYC
Add to the `completeKyc` API call:
```javascript
{
  // ...existing business + branch fields
  idType: 'PHILSYS',
  idFrontUrl: 'https://ik.imagekit.io/...',
  idBackUrl: 'https://ik.imagekit.io/...' // or null
}
```

### Backend changes
- `POST /api/auth/complete-kyc`: accept `idType`, `idFrontUrl`, `idBackUrl` fields
- Store in `tenant_users` table (new columns) or a separate `kyc_documents` table
- The `kyc_documents` table already exists in the schema with `image_front_url`, `image_back_url`, `id_type` — use it

### Database
Insert into `kyc_documents` after the `complete_owner_kyc` RPC succeeds:
```sql
INSERT INTO kyc_documents (customer_id, tenant_id, id_type, id_number, image_front_url, image_back_url)
```
Note: `kyc_documents` has `customer_id` FK but owners aren't customers. Options:
- **A)** Add an `owner_id` column to `kyc_documents` (nullable, references tenant_users)
- **B)** Create a separate `owner_kyc_documents` table
- **C)** Store in `tenant_users` directly (add `id_type`, `id_front_url`, `id_back_url` columns)

**Recommendation:** Option C — simplest. Add 3 columns to `tenant_users`. No FK issues, no new table.

---

## 7. Locked/Read-Only State

When KYC is already submitted (`isLocked`):
- ID type shown as plain text (not dropdown)
- Front/back images shown as thumbnails (clickable to view full size)
- No capture button, no checkbox
- "Edit" button unlocks everything including ID section

---

## 8. Component Structure

| Component | File | Purpose |
|-----------|------|---------|
| `CameraCapture` | `src/components/ui/CameraCapture.jsx` | Reusable: viewfinder + guide overlay + capture + file fallback |
| `IdCaptureSection` | Inline in `KycPage.jsx` | Section C wrapper: ID type select, checkbox, orchestrates front/back, previews |

### CameraCapture Props
```typescript
{
  onCapture: (blob: Blob) => void   // called when user confirms a photo
  guideLabel: string                 // "Align the front of your ID..."
  aspectRatio?: number               // default 1.586 (standard card)
  onClose: () => void                // close/cancel the viewfinder
}
```

---

## 9. Upload Endpoint

Check if an upload endpoint already exists. If so, reuse it. If not, add:

```
POST /api/upload/kyc-id
- Auth required
- Accepts multipart/form-data with `file` field
- Uploads to ImageKit under `kyc/{userId}/` folder
- Returns { url: 'https://ik.imagekit.io/...' }
```
