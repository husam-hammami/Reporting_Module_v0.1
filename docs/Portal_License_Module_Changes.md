# Portal changes — license module entitlements

**Copy this document into Word (File → Open → select this `.md` file) and save as `.docx` if you need a Word file.**

This guide is for the **separate portal codebase** (herculesv2.app on Vercel). The main Reporting Module repo already includes backend + desktop changes. The portal must be updated so superadmins can turn **Digital Twin** and **Hercules AI** on or off per machine when approving licenses.

---

## Prerequisites

1. Deploy updated backend to **https://api.herculesv2.app** (from main repo).
2. Run SQL migration on the **cloud** database:

```sql
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS enable_digital_twin BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS enable_atlas_ai BOOLEAN NOT NULL DEFAULT TRUE;
```

3. Confirm API works (replace `MACHINE_ID`):

```bash
curl "https://api.herculesv2.app/api/license/status?machine_id=MACHINE_ID"
```

Expected when approved:

```json
{
  "status": "approved",
  "expiry": "2026-12-31",
  "features": {
    "digital_twin": true,
    "atlas_ai": true
  }
}
```

---

## API you must use (no changes to URL paths)

| Action | Method | URL |
|--------|--------|-----|
| List licenses | GET | `{API_BASE}/api/admin/licenses` |
| Update license | PATCH | `{API_BASE}/api/admin/licenses/{id}` |

`API_BASE` must be **`https://api.herculesv2.app`** (not the customer’s local `localhost:5001`).

### PATCH body — new fields

Add two optional booleans to your existing approve/edit payload:

```json
{
  "status": "approved",
  "expiry": "2026-06-01",
  "enable_digital_twin": true,
  "enable_atlas_ai": false
}
```

You can PATCH **only** the module flags without changing status:

```json
{
  "enable_digital_twin": false,
  "enable_atlas_ai": false
}
```

### GET list — new columns

Each license object in the array now includes:

- `enable_digital_twin` (boolean)
- `enable_atlas_ai` (boolean)

Use these to show checkmarks in the table and to pre-fill edit forms.

---

## UI changes to implement

### 1. Licenses table — two columns (optional but recommended)

| Column | Display |
|--------|---------|
| Twin | ✓ if `enable_digital_twin`, else — |
| AI | ✓ if `enable_atlas_ai`, else — |

### 2. Approve flow (pending → approved)

When the user clicks **Approve**, show a dialog (or inline panel) **before** calling PATCH:

**Title:** Module access  

**Checkboxes (default both checked):**

- [ ] Digital Twin  
- [ ] Hercules AI  

**Expiry:** keep your existing date picker (or 15-day default if omitted).

**On confirm — single PATCH:**

```javascript
await api.patch(`/api/admin/licenses/${license.id}`, {
  status: 'approved',
  expiry: selectedExpiry, // YYYY-MM-DD
  enable_digital_twin: digitalTwinChecked,
  enable_atlas_ai: atlasAiChecked,
});
```

### 3. Edit approved license

For `status === 'approved'`, allow toggling modules without re-approving:

```javascript
await api.patch(`/api/admin/licenses/${license.id}`, {
  enable_digital_twin: newTwinValue,
  enable_atlas_ai: newAiValue,
});
```

Show a **Save** button only when values changed.

### 4. Example React snippet (adapt to your portal stack)

```jsx
function ApproveLicenseDialog({ license, onClose, onSaved }) {
  const [expiry, setExpiry] = useState(defaultExpiry15Days());
  const [digitalTwin, setDigitalTwin] = useState(true);
  const [atlasAi, setAtlasAi] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleApprove = async () => {
    setSaving(true);
    try {
      await axios.patch(
        `${API_BASE}/api/admin/licenses/${license.id}`,
        {
          status: 'approved',
          expiry,
          enable_digital_twin: digitalTwin,
          enable_atlas_ai: atlasAi,
        },
        { withCredentials: true } // if you use session cookies
      );
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog open>
      <h2>Approve license</h2>
      <p>Machine: {license.hostname || license.machine_id}</p>
      <label>
        <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        Expiry
      </label>
      <fieldset>
        <legend>Module access</legend>
        <label>
          <input type="checkbox" checked={digitalTwin} onChange={(e) => setDigitalTwin(e.target.checked)} />
          Digital Twin
        </label>
        <label>
          <input type="checkbox" checked={atlasAi} onChange={(e) => setAtlasAi(e.target.checked)} />
          Hercules AI
        </label>
      </fieldset>
      <button type="button" onClick={handleApprove} disabled={saving}>Approve</button>
      <button type="button" onClick={onClose}>Cancel</button>
    </dialog>
  );
}
```

### 5. Auth

Use the same superadmin session you already use for `/api/admin/licenses`. No new endpoints.

---

## Testing PC1 vs PC2 (after portal + desktop deploy)

| Step | PC1 | PC2 |
|------|-----|-----|
| Install same desktop build | Yes | Yes |
| Portal: approve with Twin + AI checked | Yes | No (both unchecked) |
| Restart desktop app | Shows both modules | Hides Digital Twin and Hercules AI |
| Open `/atlas-ai` in browser bar | Works | Redirects to reports |
| Engineering → AI tab | Visible | Hidden |

Customer must **restart the app** (or wait ~10 minutes + refocus window) after you change flags in the portal.

---

## Do not

- Store module flags only in Vercel env vars or portal localStorage.
- Call the customer’s local `http://localhost:5001` for license admin (wrong database).
- Rely on hiding menu items in the portal — the **desktop app** enforces entitlements.

---

## Checklist for portal developer

- [ ] Cloud DB migration applied  
- [ ] Cloud API deployed with new `license_bp`  
- [ ] Approve dialog includes Twin + AI checkboxes  
- [ ] PATCH sends `enable_digital_twin` and `enable_atlas_ai`  
- [ ] Edit form can update module flags for approved licenses  
- [ ] Table shows module columns (optional)  
- [ ] Tested two machines with different flag combinations  

---

## Support reference

Full system doc in main repo: `docs/14-LICENSE-MODULE-ENTITLEMENTS.md`
