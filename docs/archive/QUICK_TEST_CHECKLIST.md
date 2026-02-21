# Quick Testing Checklist - Dynamic Tag System

## 🚀 Quick Start (5 Minutes)

### 1. Start Backend
```bash
cd backend
python app.py
```
✅ Check: Server starts, no errors, WebSocket initialized

### 2. Access Frontend
- URL: `http://localhost:3000` (or your frontend URL)
- Login with Admin/Manager credentials

### 3. Create First Tag
- Navigate: `/settings/tags`
- Click: "Add Tag"
- Fill:
  - Tag Name: `Test_Tag_1`
  - Source Type: `PLC`
  - PLC Address: `DB2099.0`
  - Data Type: `REAL`
- Click: "Save"
✅ Check: Tag appears in list

### 4. Test Tag
- Find tag in list
- Click: "Test" button
✅ Check: Shows value from PLC (or error if PLC not connected)

### 5. Create Tag Group
- Navigate: `/settings/tag-groups`
- Click: "Add Tag Group"
- Name: `Test_Group`
- Add your tag to group
✅ Check: Group created, tag added

### 6. Create Layout
- Navigate: `/live-monitor/layouts-manager`
- Click: "Create Layout"
- Name: `Test Layout`
- Check: "Is Default" and "Is Active"
- Save
✅ Check: Layout created

### 7. Add Section
- Click on layout to edit
- Add Section:
  - Name: `Test Section`
  - Type: `Table`
  - Tag Group: Select `Test_Group`
- Save
✅ Check: Section added

### 8. View Live Monitor
- Navigate: `/live-monitor/dynamic`
✅ Check: Layout loads, shows table with tag values

### 9. Verify WebSocket
- Open Browser DevTools (F12)
- Console tab
✅ Check: See `live_tag_data` events every second

## ✅ Success Indicators

- [ ] Backend running without errors
- [ ] Tag created successfully
- [ ] Tag test returns value (or proper error)
- [ ] Tag group created
- [ ] Layout created
- [ ] Section added to layout
- [ ] Live monitor displays layout
- [ ] Tag values visible in table
- [ ] WebSocket connected
- [ ] Values update every second

## 🔍 Quick Verification Commands

### Check Backend Logs
Look for:
- `✅ Database connection pool created`
- `🟢 Starting dynamic tag realtime monitor`
- `live_tag_data` events being emitted

### Check Frontend Console
Look for:
- `Socket connected`
- `live_tag_data` events received
- No errors

### Test API Endpoints
```bash
# List tags
curl http://localhost:5001/api/tags

# Get tag values
curl http://localhost:5001/api/live-monitor/tags

# List layouts
curl http://localhost:5001/api/live-monitor/layouts
```

## 🐛 Common Issues

| Issue | Quick Fix |
|-------|-----------|
| "No layouts found" | Create layout, mark as Active |
| WebSocket not connecting | Check backend port (5001) |
| Tag values not updating | Check PLC connection, verify tags active |
| Empty table | Add columns to section, verify tag group has tags |

## 📋 Full Testing Guide

See `TESTING_GUIDE.md` for complete step-by-step instructions.

