# Frontend dev setup – common Windows fixes

## "Cannot find module '../lib/statuses'" (caniuse-lite)

This means `caniuse-lite` is incomplete. Fix:

```powershell
cd "c:\Users\Administrator\Documents\Salala\hercules-v2 Main\hercules-v2 Main\Frontend"
npm run fix:caniuse
npm run dev
```

If it still fails, do a clean reinstall (see step 5 below).

---

## "spawn EBUSY" on Windows

`Error: spawn EBUSY` when running `npm run dev` usually means something is **locking** the esbuild binary (often antivirus or another process).

## Try these in order

### 1. Reinstall esbuild binary
```powershell
cd "c:\Users\Administrator\Documents\Salala\hercules-v2 Main\hercules-v2 Main\Frontend"
npm run fix:esbuild
npm run dev
```

### 2. Close other use of the project
- Stop any other terminal running `npm run dev` or `npm start`
- Close other IDE windows that have this project open
- Then run `npm run dev` again

### 3. Exclude from Windows Defender (real-time)
- Open **Windows Security** → **Virus & threat protection** → **Manage settings** under "Virus & threat protection settings"
- **Add or remove exclusions** → **Add an exclusion** → **Folder**
- Add: `C:\Users\Administrator\Documents\Salala\hercules-v2 Main\hercules-v2 Main\Frontend\node_modules`
- Run `npm run dev` again

### 4. Use a path without spaces (if it still fails)
Copy or move the project to a path **without spaces**, e.g.:
- `C:\dev\hercules-v2`
Then in the new folder:
```powershell
npm install
npm run dev
```

### 5. Full clean reinstall
```powershell
cd "c:\Users\Administrator\Documents\Salala\hercules-v2 Main\hercules-v2 Main\Frontend"
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install
npm run dev
```
