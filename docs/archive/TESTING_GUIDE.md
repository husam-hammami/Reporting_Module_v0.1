# Complete System Testing Guide - Dynamic Tag-Based Live Monitor

## Prerequisites

✅ **Database**: All 8 tables created successfully  
✅ **Backend**: Running on `http://localhost:5001` (or your configured port)  
✅ **Frontend**: Running and accessible  
✅ **PLC**: Connected and accessible (for reading tag values)

## Step-by-Step Testing Flow

### Step 1: Start Backend Server

```bash
cd backend
python app.py
```

**Verify:**
- Server starts without errors
- Database connection successful
- WebSocket server initialized
- You should see: `✅ Database connection pool created`
- You should see: `dynamic_tag_realtime_monitor` spawned

### Step 2: Access Tag Manager

1. **Navigate to:** `http://localhost:3000/settings/tags` (or your frontend URL)
2. **Login** with appropriate credentials (Admin/Manager role required)

**Expected:**
- Tag Manager page loads
- Empty table or existing tags displayed
- "Add Tag" button visible

### Step 3: Create Your First Tag

1. **Click "Add Tag"** button
2. **Fill in the form:**
   - **Tag Name**: `Test_Tag_1` (must be unique)
   - **Display Name**: `Test Tag 1`
   - **Source Type**: `PLC`
   - **PLC Address**: `DB2099.0` (or your actual PLC address)
   - **Data Type**: `REAL`
   - **Unit**: `t/h` (optional)
   - **Scaling**: `1.0`
   - **Decimal Places**: `2`
   - **Description**: `Test tag for dynamic live monitor`

3. **Click "Save"**

**Expected:**
- Tag saved successfully
- Tag appears in the list
- No errors in console

### Step 4: Test Tag Reading

1. **Find your tag** in the list
2. **Click "Test"** button (or test icon)
3. **Check the result**

**Expected:**
- Test request sent to `/api/tags/<tag_name>/test`
- Response shows current value from PLC
- If PLC is connected: Shows actual value
- If PLC not connected: Shows error message

### Step 5: Create More Tags

Create at least 3-5 tags with different configurations:

**Example Tags:**
```
Tag 1: DB2099.0, REAL, Unit: t/h
Tag 2: DB2099.4, REAL, Unit: %  
Tag 3: DB2099.8, INT, Unit: rpm
Tag 4: DB2099.12, BOOL, Bit: 0
Tag 5: DB2099.16, STRING, Length: 40
```

### Step 6: Create Tag Group

1. **Navigate to:** `http://localhost:3000/settings/tag-groups`
2. **Click "Add Tag Group"**
3. **Fill in:**
   - **Group Name**: `Production_Monitoring`
   - **Description**: `Tags for production monitoring`
4. **Click "Save"**
5. **Add tags to group:**
   - Select tags from the list
   - Click "Add to Group"

**Expected:**
- Tag group created
- Tags can be added to group
- Group appears in list

### Step 7: Create Live Monitor Layout

1. **Navigate to:** `http://localhost:3000/live-monitor/layouts-manager`
2. **Click "Create Layout"**
3. **Fill in:**
   - **Layout Name**: `Main Production Monitor`
   - **Description**: `Main live monitor for production`
   - **Is Default**: Check this box
   - **Is Active**: Check this box
4. **Click "Save"**

**Expected:**
- Layout created successfully
- Layout appears in list

### Step 8: Add Sections to Layout

1. **Click on your layout** to edit
2. **Add a Table Section:**
   - Click "Add Section"
   - **Section Name**: `Production Metrics`
   - **Section Type**: `Table`
   - **Display Order**: `1`
   - **Tag Group**: Select `Production_Monitoring`
   - Click "Save"

3. **Add a KPI Section:**
   - Click "Add Section"
   - **Section Name**: `Key Performance Indicators`
   - **Section Type**: `KPI`
   - **Display Order**: `2`
   - Click "Save"

**Expected:**
- Sections added to layout
- Sections appear in layout editor

### Step 9: Configure Table Columns

1. **Click on the Table Section** to configure
2. **Add Columns:**
   - Click "Add Column"
   - **Column Label**: `Tag Name`
   - **Source Type**: `Tag`
   - **Tag Name**: Select a tag (e.g., `Test_Tag_1`)
   - **Unit**: `t/h`
   - **Decimals**: `2`
   - **Alignment**: `right`
   - Click "Save"
   
   - Repeat for more columns

**Expected:**
- Columns added to table section
- Columns appear in section configuration

### Step 10: Configure KPI Cards

1. **Click on the KPI Section** to configure
2. **Add KPI Cards:**
   - Click "Add KPI Card"
   - **Card Label**: `Current Flow Rate`
   - **Source Type**: `Tag`
   - **Tag Name**: Select a tag (e.g., `Test_Tag_1`)
   - **Unit**: `t/h`
   - **Decimals**: `2`
   - **Icon**: `fa-chart-line` (optional)
   - **Color**: `#3B82F6` (optional)
   - **Size**: `Medium`
   - Click "Save"
   
   - Repeat for more KPI cards

**Expected:**
- KPI cards added to section
- Cards appear in section configuration

### Step 11: View Dynamic Live Monitor

1. **Navigate to:** `http://localhost:3000/live-monitor/dynamic`
2. **Or with specific layout:** `http://localhost:3000/live-monitor/dynamic?layout_id=1`

**Expected:**
- Layout loads successfully
- Sections displayed
- Table shows tag values
- KPI cards show tag values
- Values update in real-time (every 1 second)

### Step 12: Verify WebSocket Connection

1. **Open Browser Developer Tools** (F12)
2. **Go to Console tab**
3. **Check for:**
   - `Socket connected` message
   - `live_tag_data` events being received
   - No connection errors

**Expected:**
- WebSocket connected
- Data received every second
- Values updating in UI

### Step 13: Verify Real-Time Updates

1. **Watch the live monitor page**
2. **Observe tag values updating**
3. **Check timestamp** (should update every second)

**Expected:**
- Values update automatically
- No page refresh needed
- Smooth updates without flickering

## Testing Checklist

### Backend API Testing

- [ ] `GET /api/tags` - Returns list of tags
- [ ] `POST /api/tags` - Creates new tag
- [ ] `GET /api/tags/<tag_name>` - Returns single tag
- [ ] `PUT /api/tags/<tag_name>` - Updates tag
- [ ] `GET /api/tags/<tag_name>/test` - Tests tag reading from PLC
- [ ] `GET /api/tag-groups` - Returns list of tag groups
- [ ] `POST /api/tag-groups` - Creates tag group
- [ ] `GET /api/live-monitor/layouts` - Returns layouts
- [ ] `POST /api/live-monitor/layouts` - Creates layout
- [ ] `GET /api/live-monitor/layouts/<id>` - Returns layout with sections
- [ ] `GET /api/live-monitor/tags` - Returns current tag values

### WebSocket Testing

- [ ] WebSocket connects successfully
- [ ] `live_tag_data` event received
- [ ] Data updates every 1 second
- [ ] Reconnection works if connection lost

### Frontend UI Testing

- [ ] Tag Manager loads and displays tags
- [ ] Tag form validates input correctly
- [ ] Tag test button works
- [ ] Tag Group Manager loads
- [ ] Layout Manager loads
- [ ] Dynamic Live Monitor displays layout
- [ ] Table sections render correctly
- [ ] KPI sections render correctly
- [ ] Values update in real-time

### Error Handling Testing

- [ ] Invalid PLC address shows error
- [ ] Missing tag shows placeholder
- [ ] PLC connection error handled gracefully
- [ ] WebSocket disconnection shows status
- [ ] Invalid layout shows error message

## Common Issues & Solutions

### Issue: "No active layouts found"

**Solution:**
1. Create a layout in Layout Manager
2. Mark it as "Active"
3. Mark it as "Default" (optional)

### Issue: "WebSocket not connecting"

**Solution:**
1. Check backend is running
2. Check WebSocket port (default: 5001)
3. Check browser console for errors
4. Verify `socket.io-client` is installed

### Issue: "Tag values not updating"

**Solution:**
1. Check PLC connection
2. Verify tags are active (`is_active = true`)
3. Check backend logs for errors
4. Verify WebSocket events are being received

### Issue: "Table/KPI sections empty"

**Solution:**
1. Verify sections are configured
2. Check tag group has tags
3. Verify columns/KPI cards are configured
4. Check tag names match exactly

### Issue: "Database connection error"

**Solution:**
1. Verify database is running
2. Check connection parameters in `app.py`
3. Verify tables exist (run `verify_tables.py`)
4. Check database credentials

## API Endpoints Reference

### Tags
- `GET /api/tags` - List all tags
- `POST /api/tags` - Create tag
- `GET /api/tags/<tag_name>` - Get tag
- `PUT /api/tags/<tag_name>` - Update tag
- `DELETE /api/tags/<tag_name>` - Delete tag
- `GET /api/tags/<tag_name>/test` - Test tag

### Tag Groups
- `GET /api/tag-groups` - List groups
- `POST /api/tag-groups` - Create group
- `PUT /api/tag-groups/<id>` - Update group
- `DELETE /api/tag-groups/<id>` - Delete group
- `POST /api/tag-groups/<id>/tags` - Add tags to group
- `DELETE /api/tag-groups/<id>/tags/<tag_id>` - Remove tag from group

### Live Monitor
- `GET /api/live-monitor/layouts` - List layouts
- `POST /api/live-monitor/layouts` - Create layout
- `GET /api/live-monitor/layouts/<id>` - Get layout
- `PUT /api/live-monitor/layouts/<id>` - Update layout
- `DELETE /api/live-monitor/layouts/<id>` - Delete layout
- `GET /api/live-monitor/tags` - Get current tag values

## WebSocket Events

### Client → Server
- `connect` - Connect to WebSocket
- `disconnect` - Disconnect from WebSocket

### Server → Client
- `live_tag_data` - Live tag values (emitted every 1 second)
  ```json
  {
    "timestamp": "2024-12-26T10:00:00",
    "tag_values": {
      "Test_Tag_1": 123.45,
      "Test_Tag_2": 67.89
    },
    "plc_connected": true
  }
  ```

## Next Steps After Testing

1. **Create Production Tags**: Add all your actual PLC tags
2. **Organize Tags**: Create tag groups for different areas
3. **Design Layouts**: Create multiple layouts for different views
4. **Configure Sections**: Set up tables and KPI cards
5. **Monitor Performance**: Check WebSocket performance
6. **User Training**: Train operators on new system

## Support

If you encounter issues:
1. Check backend logs for errors
2. Check browser console for frontend errors
3. Verify database tables exist
4. Verify PLC connection
5. Check WebSocket connection status

---

**Last Updated:** 2024-12-26  
**System Version:** Dynamic Tag-Based Live Monitor v1.0

