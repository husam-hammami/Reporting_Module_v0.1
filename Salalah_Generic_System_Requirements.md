# ✅ SALALAH → FINAL GENERIC SYSTEM
## Complete Requirements & Execution Checklist

**Document Version:** 1.0  
**Last Updated:** December 2024  
**Status:** Requirements Specification

---

# Table of Contents

1. [Tag & Data Foundation](#1-tag--data-foundation)
2. [Report System (RSD-Based)](#2-report-system-rsd-based)
3. [Live Monitor](#3-live-monitor)
4. [Dashboard](#4-dashboard)
5. [Energy System](#5-energy-system)
6. [Material & Bin (Light Touch)](#6-material--bin-light-touch)
7. [Configuration Safety](#7-configuration-safety)
8. [Final Acceptance Check](#-final-acceptance-check)

---

# 1️⃣ TAG & DATA FOUNDATION

## Overview
The system must be built on a Tag-based foundation where all data references use Tag Names, not PLC addresses. This abstraction layer allows complete flexibility and reconfiguration without code changes.

## 1.1 Add Tag Management Page

**Page Location:** `Settings → Tags`

### Purpose
Central management of all data sources (PLC tags, formulas, mappings, manual inputs) as unified "Tags" that can be referenced throughout the system.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Tag ID | Auto-generated | Yes | Internal unique identifier (hidden from users) |
| Tag Name | Text | Yes | User-facing unique identifier (e.g., "FlowRate_Main", "Total_Produced") |
| Source Type | Dropdown | Yes | PLC / Formula / Mapping / Manual |
| PLC Address | Text | Conditional | Required if Source Type = PLC (e.g., "DB2099.0", "DB499.100") |
| Data Type | Dropdown | Yes | BOOL, INT, DINT, REAL, STRING |
| Unit | Text | No | Display unit (t/h, kg, %, °C, bar) |
| Scaling | Number | No | Multiplier for value conversion (default: 1.0) |
| Description | Textarea | No | User notes about this tag |
| Is Active | Checkbox | Yes | Enable/disable tag |

### Rules

1. **Tag Name Uniqueness:**
   - Tag Name must be unique per plant/system
   - System validates on save
   - Error message: "Tag Name already exists"

2. **User Interface:**
   - Users select tags by Tag Name only
   - PLC addresses are never shown in UI
   - Reports, dashboards, live monitor reference Tag Names

3. **Data Flow:**
   - All PLC reads write values by Tag ID internally
   - UI, reports, dashboards, live monitor reference Tag Name
   - System maps Tag Name → Tag ID → PLC Address automatically

### Actions

- **Add Tag:** Create new tag with unique Tag Name
- **Edit Tag:** Modify tag properties (except Tag ID)
- **Disable Tag:** Set Is Active = false (preserves historical data)
- **Delete Tag:** Remove tag (with confirmation, warns about dependencies)
- **Test Tag:** Read current value from PLC (if Source Type = PLC)
- **Bulk Import:** Import tags from CSV/JSON
- **Export Tags:** Export to CSV/JSON

### Refactoring Requirements

1. **Remove PLC Address from UI:**
   - No PLC addresses visible in reports
   - No PLC addresses in dashboard widgets
   - No PLC addresses in live monitor
   - Only Tag Names appear to users

2. **Internal Mapping:**
   ```
   User selects: "FlowRate_Main" (Tag Name)
   ↓
   System maps: Tag Name → Tag ID → PLC Address
   ↓
   PLC reads: DB2099.0 (REAL)
   ↓
   System stores: Tag ID + Value
   ↓
   UI displays: "FlowRate_Main: 12.456 t/h"
   ```

3. **Backward Compatibility:**
   - Migrate existing hardcoded PLC references to Tags
   - Create Tag entries for all current PLC addresses
   - Update all reports/dashboards to use Tag Names

---

## 1.2 Add Tag Group Page

**Page Location:** `Settings → Tag Groups`

### Purpose
Group related tags together for use in dynamic tables, reports, and live monitoring. Tag Groups enable "dynamic rows" where each tag in the group becomes a table row.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Group ID | Auto-generated | Yes | Internal identifier |
| Group Name | Text | Yes | Unique name (e.g., "Sender", "Receiver", "Energy", "Setpoints") |
| Description | Textarea | No | Purpose of this group |
| Assigned Tags | Multi-select | Yes | List of Tag Names assigned to this group |
| Display Order | Number | Yes | Order tags appear in group (drag & drop) |
| Is Active | Checkbox | Yes | Enable/disable group |

### Usage

**Tag Groups are used for:**

1. **Report Tables (Dynamic Rows):**
   - Select Tag Group as data source
   - Each tag in group becomes a table row
   - Columns defined in report section

2. **Live Monitoring Tables:**
   - Tag Group provides rows
   - Columns configured in live monitor layout

3. **Dashboard Tables:**
   - Tag Group as data source
   - Widget displays all tags in group

### Example

**Tag Group: "Sender Sources"**
- Assigned Tags:
  - Sender1_Weight
  - Sender2_Weight
  - Sender3_Weight
  - Sender4_Weight

**Result in Table:**
| Tag Name | Value | Unit |
|----------|-------|------|
| Sender1_Weight | 12.5 | t/h |
| Sender2_Weight | 8.3 | t/h |
| Sender3_Weight | 0.0 | t/h |
| Sender4_Weight | 15.2 | t/h |

### Actions

- **Create Group:** Define new tag group
- **Edit Group:** Modify group name, add/remove tags
- **Reorder Tags:** Drag & drop to change display order
- **Delete Group:** Remove group (warns if used in reports/layouts)
- **Copy Group:** Duplicate group with new name

---

# 2️⃣ REPORT SYSTEM (RSD-BASED)

## Overview
All reports are built using a Report Builder interface. No hardcoded report templates. Users create report templates, define sections, configure columns, and select data sources by Tag Name.

## 2.1 Add Report Template List Page

**Page Location:** `Report → Templates`

### Purpose
List all report templates. Users create, edit, copy, and manage report templates here.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Template ID | Auto-generated | Yes | Internal identifier |
| Template Name | Text | Yes | Unique name (e.g., "FCL Daily Report", "Order Summary") |
| Description | Textarea | No | Purpose and usage notes |
| Created By | User | Auto | User who created template |
| Created At | DateTime | Auto | Creation timestamp |
| Last Modified | DateTime | Auto | Last edit timestamp |
| Is Active | Checkbox | Yes | Enable/disable template |
| Is Default | Checkbox | No | Mark as default template |

### Actions

- **Create Template:** Start new report template
- **Edit Template:** Modify template name, description, sections
- **Copy Template:** Duplicate template with new name
- **Disable Template:** Set Is Active = false
- **Delete Template:** Remove template (with confirmation)
- **Preview Template:** See template with sample data
- **Export Template:** Download as JSON
- **Import Template:** Upload JSON file

### UI Layout

```
┌─────────────────────────────────────────┐
│ Report Templates                        │ [+ Create Template]
├─────────────────────────────────────────┤
│ Template Name    │ Description │ Actions│
│ FCL Daily Report │ Daily...    │ [Edit] │
│ Order Summary    │ Order...    │ [Edit] │
│ Energy Report    │ Energy...   │ [Edit] │
└─────────────────────────────────────────┘
```

---

## 2.2 Add Report Section Builder Page

**Page Location:** `Report → Templates → [Template Name] → Sections`

### Purpose
Define sections within a report template. Each section can be a Table, Trend chart, or Text block.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Section ID | Auto-generated | Yes | Internal identifier |
| Section Name | Text | Yes | Display name (e.g., "Sender Summary", "Hourly Trend") |
| Section Type | Dropdown | Yes | Table / Trend / Text |
| Display Order | Number | Yes | Order in report (drag & drop) |
| Is Active | Checkbox | Yes | Show/hide section |

### Section Types

1. **Table:**
   - Configurable columns
   - Static or dynamic rows
   - Data from Tag Group or individual tags

2. **Trend:**
   - Time series chart
   - Multiple series (tags)
   - Time range selector

3. **Text:**
   - Static text block
   - Can include Tag values (e.g., "Total Produced: {Total_Produced} kg")

### Actions

- **Add Section:** Create new section
- **Edit Section:** Modify section configuration
- **Reorder Sections:** Drag & drop to change order
- **Delete Section:** Remove section
- **Preview Section:** See section with sample data

---

## 2.3 Add Table Section Editor

**Page Location:** `Report → Templates → [Template] → Sections → [Section] → Columns`

### Purpose
Configure table columns for a report section. Each column can source data from Text, Tag, Formula, or Mapping.

### Column Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Column Label | Text | Yes | Header text (e.g., "Bin ID", "Weight") |
| Source Type | Dropdown | Yes | Text / Tag / Formula / Mapping |
| Tag Name | Dropdown | Conditional | Required if Source Type = Tag (select from Tag Names) |
| Formula | Text | Conditional | Required if Source Type = Formula |
| Mapping Rule | Dropdown | Conditional | Required if Source Type = Mapping |
| Unit | Text | No | Display unit (appended to value) |
| Decimals | Number | Yes | Decimal places (default: 2) |
| Alignment | Dropdown | Yes | left / center / right |
| Width | Number | No | Column width (px or %) |
| Display Order | Number | Yes | Column order (drag & drop) |

### Source Type Details

#### 1. Text
- Static text value
- Example: Column Label = "Status", Source Type = Text, Value = "Active"

#### 2. Tag
- Select Tag Name from dropdown
- System displays current value of that tag
- Example: Column Label = "Flow Rate", Source Type = Tag, Tag Name = "FlowRate_Main"

#### 3. Formula
- Formula editor opens
- Select tags by Tag Name
- Operators: +, −, ×, ÷
- Example: Column Label = "Total", Source Type = Formula, Formula = "Sender1_Weight + Sender2_Weight"

#### 4. Mapping
- Select mapping rule
- Maps input tag value to output text/tag
- Example: Column Label = "Status", Source Type = Mapping, Mapping = "BinStatusMap" (0→"Inactive", 1→"Active")

### Row Mode

**Static Rows:**
- Fixed number of rows
- Each row configured individually
- Example: Summary table with fixed KPIs

**Dynamic Rows (from Tag Group):**
- Select Tag Group as data source
- Each tag in group becomes a row
- Columns apply to all rows
- Example: Sender table where each sender is a row

### UI Layout

```
┌─────────────────────────────────────────────────────┐
│ Table Section: Sender Summary                       │
├─────────────────────────────────────────────────────┤
│ Row Mode: [●] Dynamic (Tag Group) [ ] Static       │
│ Tag Group: [Sender Sources ▼]                      │
├─────────────────────────────────────────────────────┤
│ Columns:                                            │ [+ Add Column]
│ ┌──────────┬──────────┬──────────┬──────────┐    │
│ │ Label    │ Source   │ Tag/Formula│ Unit   │    │
│ ├──────────┼──────────┼──────────┼──────────┤    │
│ │ Bin ID   │ Tag      │ Sender1_BinID │ -   │    │
│ │ Product  │ Mapping  │ BinToMaterial │ -   │    │
│ │ Weight   │ Tag      │ Sender1_Weight │ t/h│    │
│ └──────────┴──────────┴──────────┴──────────┘    │
└─────────────────────────────────────────────────────┘
```

---

## 2.4 Add Formula Editor

**Page Location:** Shared Modal Component (used in Reports, Live Monitor, Dashboard)

### Purpose
Create formulas that combine tags, perform calculations, and create virtual tags.

### Features

1. **Tag Selection:**
   - Dropdown shows all Tag Names
   - Search/filter tags
   - Click to insert into formula

2. **Operators:**
   - Addition: `+`
   - Subtraction: `−`
   - Multiplication: `×`
   - Division: `÷`
   - Parentheses: `( )`
   - Functions: SUM, AVG, MIN, MAX, IF, ROUND, ABS

3. **Formula Validation:**
   - Syntax checking
   - Tag name validation
   - Division by zero warning
   - Real-time error highlighting

4. **Formula Output:**
   - Formula creates a Virtual Tag
   - Virtual Tag has no PLC address
   - Virtual Tag can be selected anywhere (reports, dashboards, etc.)
   - Virtual Tag name: Auto-generated or user-defined

### Example Formulas

```
Total_Weight = Sender1_Weight + Sender2_Weight + Sender3_Weight
Efficiency = (Produced_Weight / Consumed_Weight) × 100
Avg_Flow = (FlowRate_Main + FlowRate_Secondary) / 2
Status_Text = IF(OrderActive, "Running", "Stopped")
```

### UI Layout

```
┌─────────────────────────────────────────┐
│ Formula Editor                          │
├─────────────────────────────────────────┤
│ Formula Name: [Total_Produced        ]  │
│                                          │
│ Formula:                                 │
│ ┌────────────────────────────────────┐ │
│ │ Sender1_Weight + Sender2_Weight     │ │
│ └────────────────────────────────────┘ │
│                                          │
│ Available Tags:                          │
│ [Sender1_Weight] [Sender2_Weight] ...   │
│                                          │
│ Operators: +  −  ×  ÷  (  )             │
│                                          │
│ [Test Formula] [Save] [Cancel]          │
└─────────────────────────────────────────┘
```

### Rules

1. **Formula Validation Required:**
   - Must validate before saving
   - Show errors clearly
   - Prevent saving invalid formulas

2. **Virtual Tag Creation:**
   - Formula output becomes selectable Tag Name
   - Appears in Tag dropdowns
   - No PLC address assigned

3. **Dependencies:**
   - System tracks which tags formula depends on
   - If source tag deleted, formula shows error
   - Circular references detected and prevented

---

## 2.5 Add Mapping Rule Page

**Page Location:** `Settings → Mappings`

### Purpose
Define mapping rules that convert tag values to text or other tags. Used for display purposes (e.g., bin_id → material name, status code → status text).

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Mapping ID | Auto-generated | Yes | Internal identifier |
| Mapping Name | Text | Yes | Unique name (e.g., "BinToMaterial", "StatusCodeMap") |
| Input Tag | Dropdown | Yes | Source Tag Name |
| Output Type | Dropdown | Yes | Text / Tag |
| Mapping Table | Table | Yes | Value → Output mappings |

### Mapping Table Structure

| Input Value | Output (Text/Tag) |
|-------------|-------------------|
| 0 | "Inactive" |
| 1 | "Active" |
| 101 | "Wheat Grade A" |
| 102 | "Barley Premium" |
| 203 | "Mixed Output" |

### Usage

**Mappings are used in:**

1. **Reports:**
   - Column Source Type = Mapping
   - Displays mapped text instead of raw value

2. **Live Monitoring:**
   - Tag values displayed as mapped text
   - Example: bin_id 101 → "Wheat Grade A"

3. **Dashboards:**
   - KPI cards show mapped values
   - Status indicators use mappings

### Output

**Virtual Tag Creation:**
- Mapping creates a Virtual Tag
- Virtual Tag name: `[MappingName]_[InputTagName]`
- Example: "BinToMaterial_Sender1_BinID"
- Virtual Tag selectable everywhere

### Actions

- **Create Mapping:** Define new mapping rule
- **Edit Mapping:** Modify mapping table
- **Delete Mapping:** Remove mapping (warns if used)
- **Test Mapping:** Enter test value, see output
- **Import Mapping:** Upload CSV/JSON
- **Export Mapping:** Download as JSON

### Example

**Mapping: "BinToMaterial"**
- Input Tag: `Sender1_BinID`
- Output Type: Text
- Mapping Table:
  - 101 → "Wheat Grade A"
  - 102 → "Barley Premium"
  - 203 → "Mixed Output"

**Result:**
- Raw value: `101`
- Displayed: `"Wheat Grade A"`

---

## 2.6 Refactor Existing Reports

### Purpose
Rebuild all existing hardcoded reports using the Report Builder system.

### Reports to Refactor

1. **FCL Daily Report**
   - Current: Hardcoded tables, direct PLC references
   - New: Report Template with sections
   - Use: Tag Names, Tag Groups, Formulas, Mappings

2. **Order Report**
   - Current: Fixed structure
   - New: Configurable sections
   - Use: Tag Names for all data

3. **Energy Report**
   - Current: Hardcoded machine identifiers (C2, M20, M21, etc.)
   - New: Tag-based, configurable
   - Use: Tag Groups for energy monitors

### Refactoring Steps

1. **Create Tags:**
   - Identify all PLC addresses used in report
   - Create Tag entries for each
   - Map Tag Name → PLC Address

2. **Create Tag Groups:**
   - Group related tags (e.g., "FCL_Senders", "FCL_Receivers")
   - Assign tags to groups

3. **Create Report Template:**
   - Use Report Builder
   - Add sections (Table, Trend, Text)
   - Configure columns using Tag Names

4. **Remove Hardcoded Code:**
   - Delete hardcoded table components
   - Remove direct PLC address references
   - Remove fixed data structures

5. **Test:**
   - Verify report displays correctly
   - Check all data sources
   - Validate calculations

### Rules

**Use ONLY:**
- Sections (Table, Trend, Text)
- Columns (configured in section editor)
- Tag Names (selected from dropdown)
- Formulas (created in formula editor)
- Mappings (selected from dropdown)

**Remove:**
- Hardcoded tables
- Direct PLC address references
- Fixed data structures
- Report-specific components

---

# 3️⃣ LIVE MONITOR

## Overview
Live Monitor becomes fully configurable. Users create layouts, define sections, and configure tables/KPI cards using Tag Names and Tag Groups.

## 3.1 Add Live Monitor Configuration Page

**Page Location:** `Live Monitoring → Layouts`

### Purpose
Create and manage live monitor layouts. Each layout defines what sections appear and how data is displayed.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Layout ID | Auto-generated | Yes | Internal identifier |
| Layout Name | Text | Yes | Unique name (e.g., "FCL Live Monitor", "Energy Dashboard") |
| Description | Textarea | No | Purpose and usage |
| Is Active | Checkbox | Yes | Enable/disable layout |
| Is Default | Checkbox | No | Default layout for report type |

### Actions

- **Create Layout:** Start new layout
- **Edit Layout:** Modify sections and configuration
- **Copy Layout:** Duplicate with new name
- **Enable Layout:** Set as active
- **Disable Layout:** Set as inactive
- **Delete Layout:** Remove layout
- **Preview Layout:** See layout with live/sample data

### UI Layout

```
┌─────────────────────────────────────────┐
│ Live Monitor Layouts                    │ [+ Create Layout]
├─────────────────────────────────────────┤
│ Layout Name      │ Status │ Actions     │
│ FCL Live Monitor │ Active │ [Edit]     │
│ Energy Dashboard │ Active │ [Edit]     │
└─────────────────────────────────────────┘
```

---

## 3.2 Add Live Monitor Section Editor

**Page Location:** `Live Monitoring → Layouts → [Layout Name] → Sections`

### Purpose
Define sections within a live monitor layout. Each section can be a Table or KPI Cards.

### Section Types

#### 1. Table Section

**Configuration:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Section Name | Text | Yes | Display name (e.g., "Sender Sources", "Receiver Status") |
| Tag Group | Dropdown | Yes | Select Tag Group for dynamic rows |
| Columns | Array | Yes | Column definitions (same as Report Table) |
| Refresh Interval | Number | Yes | Update frequency (seconds, default: 1) |

**Column Configuration:**
- Column Label
- Source Type: Tag / Formula / Mapping
- Tag Name (if Source Type = Tag)
- Formula (if Source Type = Formula)
- Mapping Rule (if Source Type = Mapping)
- Unit
- Decimals
- Alignment

**Example:**
- Section Name: "Sender Sources"
- Tag Group: "Sender Sources" (contains: Sender1_Weight, Sender2_Weight, etc.)
- Columns:
  - Label: "Bin ID", Source: Tag, Tag: "Sender1_BinID"
  - Label: "Material", Source: Mapping, Mapping: "BinToMaterial"
  - Label: "Weight", Source: Tag, Tag: "Sender1_Weight", Unit: "t/h"

#### 2. KPI Cards Section

**Configuration:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Section Name | Text | Yes | Display name (e.g., "Key Metrics") |
| Cards | Array | Yes | KPI card definitions |

**Card Configuration:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Card Label | Text | Yes | Display name (e.g., "Total Flow Rate") |
| Source Type | Dropdown | Yes | Tag / Formula |
| Tag Name | Dropdown | Conditional | If Source Type = Tag |
| Formula | Text | Conditional | If Source Type = Formula |
| Unit | Text | No | Display unit |
| Decimals | Number | Yes | Decimal places |
| Icon | Icon Picker | No | Card icon |
| Color | Color Picker | No | Card accent color |

**Example:**
- Card 1: Label = "Flow Rate", Source = Tag, Tag = "FlowRate_Main", Unit = "t/h"
- Card 2: Label = "Total Weight", Source = Formula, Formula = "Sender1_Weight + Sender2_Weight", Unit = "t/h"

### Actions

- **Add Section:** Create new section
- **Edit Section:** Modify section configuration
- **Reorder Sections:** Drag & drop to change order
- **Delete Section:** Remove section
- **Preview Section:** See section with live data

---

## 3.3 Refactor Current Live Monitor

### Current State
- Hardcoded "Sender" table
- Hardcoded "Receiver" table
- Fixed structure for FCL, SCL, MIL-A
- Direct PLC address references

### Target State
- Fully configurable sections
- Tables use Tag Groups
- Columns use Tag Names
- Labels come from configuration

### Refactoring Steps

1. **Create Tags:**
   - Identify all PLC addresses in current live monitor
   - Create Tag entries
   - Map Tag Names

2. **Create Tag Groups:**
   - "Sender Sources" group
   - "Receiver Destinations" group
   - "Setpoints" group

3. **Create Live Monitor Layout:**
   - Use Layout Builder
   - Add Table sections
   - Configure columns using Tag Names

4. **Remove Hardcoded Components:**
   - Delete hardcoded Sender table
   - Delete hardcoded Receiver table
   - Remove fixed FCL/SCL/MIL-A logic
   - Remove PLC address references

5. **Test:**
   - Verify live data displays
   - Check WebSocket connection
   - Validate all sections

### Rules

**Replace:**
- Hardcoded Sender → Configurable Table Section (Tag Group: "Sender Sources")
- Hardcoded Receiver → Configurable Table Section (Tag Group: "Receiver Destinations")
- Fixed labels → Labels from configuration

**Use:**
- Tag Groups for dynamic rows
- Tag Names for column data
- Formulas for calculated values
- Mappings for value conversion

---

# 4️⃣ DASHBOARD

## Overview
Dashboard becomes fully configurable with widget-based system. Users create widgets, select data sources (Tag Names), and arrange layout.

## 4.1 Add Dashboard Builder Page

**Page Location:** `Dashboard → Edit`

### Purpose
Create and configure dashboard widgets. Each widget displays data from Tags or Formulas.

### Widget Types

#### 1. KPI Widget

**Configuration:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Widget Name | Text | Yes | Display name |
| Source Type | Dropdown | Yes | Tag / Formula |
| Tag Name | Dropdown | Conditional | If Source Type = Tag |
| Formula | Text | Conditional | If Source Type = Formula |
| Unit | Text | No | Display unit |
| Decimals | Number | Yes | Decimal places |
| Icon | Icon Picker | No | Widget icon |
| Color | Color Picker | No | Widget color |
| Size | Dropdown | Yes | Small / Medium / Large |

#### 2. Chart Widget

**Configuration:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Widget Name | Text | Yes | Display name |
| Chart Type | Dropdown | Yes | Line / Bar / Area / Pie |
| Series | Array | Yes | Data series definitions |
| Time Range | Dropdown | Yes | Last 1h / 6h / 24h / 7d / 30d |
| Y-Axis Label | Text | No | Y-axis label |
| Y-Min | Number | No | Y-axis minimum |
| Y-Max | Number | No | Y-axis maximum |

**Series Configuration:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Series Label | Text | Yes | Display name |
| Source Type | Dropdown | Yes | Tag / Formula |
| Tag Name | Dropdown | Conditional | If Source Type = Tag |
| Formula | Text | Conditional | If Source Type = Formula |
| Color | Color Picker | Yes | Line/bar color |

#### 3. Table Widget

**Configuration:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Widget Name | Text | Yes | Display name |
| Tag Group | Dropdown | Yes | Select Tag Group for rows |
| Columns | Array | Yes | Column definitions (same as Report Table) |
| Max Rows | Number | Yes | Maximum rows to display |
| Refresh Interval | Number | Yes | Update frequency (seconds) |

### Layout Management

- **Grid System:** 12-column grid
- **Drag & Drop:** Reposition widgets
- **Resize:** Adjust widget size
- **Save Layout:** Save dashboard configuration

### Actions

- **Add Widget:** Create new widget
- **Edit Widget:** Modify widget configuration
- **Delete Widget:** Remove widget
- **Reorder Widgets:** Drag & drop
- **Resize Widgets:** Drag corners
- **Save Dashboard:** Save layout and configuration
- **Reset Dashboard:** Restore default layout
- **Preview Dashboard:** See dashboard with live data

---

## 4.2 Refactor Existing Dashboard

### Current State
- Fixed KPI cards
- Hardcoded data sources
- Fixed layout

### Target State
- Configurable widgets
- Tag-based data sources
- Flexible layout

### Refactoring Steps

1. **Create Tags:**
   - Identify all data sources in current dashboard
   - Create Tag entries
   - Map Tag Names

2. **Create Widgets:**
   - Convert each KPI card to KPI Widget
   - Convert each chart to Chart Widget
   - Configure using Tag Names

3. **Save as Default:**
   - Save current Salalah dashboard as default template
   - New plants can start with this template

4. **Remove Hardcoded Code:**
   - Delete fixed KPI components
   - Remove hardcoded data fetching
   - Remove fixed layout

5. **Test:**
   - Verify all widgets display
   - Check data updates
   - Validate layout

### Rules

**Replace:**
- Fixed KPI cards → KPI Widgets (Tag-based)
- Hardcoded charts → Chart Widgets (Tag-based)
- Fixed layout → Configurable grid

**Use:**
- Tag Names for all data
- Formulas for calculations
- Widget configuration for display

---

# 5️⃣ ENERGY SYSTEM

## Overview
Energy monitoring becomes just another configured view. Remove hardcoded machine identifiers (C2, M20, M21, etc.) and use Tag-based system.

## 5.1 Add Energy Monitor Configuration Page

**Page Location:** `Energy → Monitors`

### Purpose
Define energy monitors. Each monitor is a collection of tags that represent an energy source (machine, line, etc.).

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Monitor ID | Auto-generated | Yes | Internal identifier |
| Monitor Name | Text | Yes | Unique name (e.g., "C2 Machine", "M20 Line", "Main Production") |
| Description | Textarea | No | Purpose and location |
| Assigned Tags | Multi-select | Yes | Tag Names assigned to this monitor |
| Display Order | Number | Yes | Order in energy page |
| Is Active | Checkbox | Yes | Enable/disable monitor |

### Actions

- **Create Monitor:** Define new energy monitor
- **Edit Monitor:** Modify name, description, tags
- **Delete Monitor:** Remove monitor
- **Reorder Monitors:** Change display order

### Refactoring

**Remove:**
- Hardcoded C2, M20, M21, M22, M23, M24 identifiers
- Fixed machine list
- Machine-specific logic

**Replace With:**
- Configurable monitors
- Tag-based data sources
- Flexible naming

---

## 5.2 Refactor Energy Pages

### Current State
- Hardcoded machine list
- Fixed KPI calculations
- Machine-specific charts

### Target State
- Tag-based KPIs
- Configurable charts (using widget engine)
- Report Builder for energy reports

### Refactoring Steps

1. **Create Tags:**
   - Identify all energy-related PLC addresses
   - Create Tag entries
   - Map Tag Names

2. **Create Energy Monitors:**
   - Define monitors (C2, M20, etc.) as configurations
   - Assign tags to each monitor

3. **Refactor KPIs:**
   - Use Tag Names instead of hardcoded addresses
   - Use Formulas for calculations

4. **Refactor Charts:**
   - Use same Chart Widget engine as Dashboard
   - Configure using Tag Names

5. **Refactor Reports:**
   - Use Report Builder
   - Create Energy Report template
   - Use Tag Names and Tag Groups

### Rules

**KPIs:**
- Read from Tag Names
- Use Formulas for calculations
- No hardcoded addresses

**Charts:**
- Use Dashboard widget engine
- Configure using Tag Names
- Same chart types as Dashboard

**Reports:**
- Use Report Builder
- Same system as other reports
- Tag-based data sources

---

# 6️⃣ MATERIAL & BIN (LIGHT TOUCH)

## Overview
Keep existing Material and Bin pages but remove hard assumptions. Make IN/OUT categories optional and configuration-driven.

## 6.1 Keep Current Pages

**Pages to Keep:**
- Material Management page
- Bin Assignment page

**No Changes Required:**
- Basic CRUD operations
- Material list
- Bin list

---

## 6.2 Remove Hard Assumptions

### Current Assumptions to Remove

1. **IN/OUT Category:**
   - Currently: Required field, affects logic
   - New: Optional field, only applied if configured

2. **Material Category Logic:**
   - Currently: Logic depends on category
   - New: No logic depends on category
   - Category is informational only

3. **Bin Type Assumptions:**
   - Currently: Assumed structure
   - New: Flexible, configuration-driven

### Changes Required

1. **Material Page:**
   - Keep IN/OUT as optional field
   - Remove any logic that depends on category
   - Category is display-only

2. **Bin Page:**
   - Keep current structure
   - Remove hardcoded assumptions
   - Make flexible for configuration

3. **System Logic:**
   - No code depends on material category
   - No code depends on bin type
   - All logic uses Tags and configurations

### Rules

**IN/OUT becomes:**
- Optional field
- Display-only
- No system logic depends on it

**Only Applied If:**
- User explicitly configures it
- Used in reports/layouts (user choice)
- Not enforced by system

---

# 7️⃣ CONFIGURATION SAFETY

## Overview
Add safety features to prevent configuration errors and allow testing before deployment.

## 7.1 Add Preview Buttons

### Purpose
Allow users to preview configurations before saving or deploying.

### Preview Locations

#### 1. Report Preview

**Location:** `Report → Templates → [Template] → Preview`

**Features:**
- Shows report with sample/live data
- All sections rendered
- All columns displayed
- Formulas calculated
- Mappings applied

**Actions:**
- Preview before print
- Preview before export
- Preview before saving

#### 2. Live Monitor Preview

**Location:** `Live Monitoring → Layouts → [Layout] → Preview`

**Features:**
- Shows layout with live data
- All sections rendered
- Tables populated
- KPI cards updated
- Real-time updates

**Actions:**
- Preview before save
- Preview before enable
- Test with live WebSocket data

#### 3. Dashboard Preview

**Location:** `Dashboard → Edit → Preview`

**Features:**
- Shows dashboard with live data
- All widgets rendered
- Charts updated
- Tables populated
- Real-time updates

**Actions:**
- Preview before publish
- Preview before save
- Test layout and data

### Preview Features

- **Sample Data:** Use mock data if live data unavailable
- **Live Data:** Use actual WebSocket data if available
- **Error Display:** Show configuration errors clearly
- **Validation:** Highlight missing/invalid configurations

---

## 7.2 Add Export / Import Page

**Page Location:** `Settings → Export / Import`

### Purpose
Export configurations for backup or transfer to another plant. Import configurations from other plants.

### Export Options

**Export Types:**

1. **Full System Export:**
   - All tags
   - All tag groups
   - All mappings
   - All reports
   - All dashboards
   - All live monitor layouts

2. **Selective Export:**
   - Tags only
   - Tag Groups only
   - Mappings only
   - Reports only
   - Dashboards only
   - Live Monitor layouts only

3. **Report Type Export:**
   - All configurations for specific report type
   - Tags, groups, reports, layouts related to report type

### Import Options

**Import Types:**

1. **Full System Import:**
   - Replace all configurations
   - Requires confirmation
   - Creates backup before import

2. **Selective Import:**
   - Import specific types
   - Merge with existing
   - Conflict resolution

3. **Merge Import:**
   - Add to existing configurations
   - Skip duplicates
   - Rename conflicts

### Conflict Resolution

**When Importing:**

1. **Tag Name Conflict:**
   - Option 1: Skip (keep existing)
   - Option 2: Replace (overwrite existing)
   - Option 3: Rename (import with new name)

2. **Report Template Conflict:**
   - Option 1: Skip
   - Option 2: Replace
   - Option 3: Rename

3. **Tag Group Conflict:**
   - Option 1: Skip
   - Option 2: Replace
   - Option 3: Merge (combine tags)

### Export Format

**JSON Structure:**
```json
{
  "export_version": "1.0",
  "export_date": "2024-12-24T10:00:00Z",
  "tags": [...],
  "tag_groups": [...],
  "mappings": [...],
  "reports": [...],
  "dashboards": [...],
  "live_monitor_layouts": [...]
}
```

### Actions

- **Export Full System:** Download complete configuration
- **Export Selected:** Export specific types
- **Import Configuration:** Upload JSON file
- **Preview Import:** See what will be imported
- **Resolve Conflicts:** Handle naming conflicts
- **Create Backup:** Auto-backup before import

---

# ✅ FINAL ACCEPTANCE CHECK

## You are DONE when:

### ✅ Tag System
- [ ] Users select Tag Names, never PLC addresses
- [ ] All PLC reads map to Tag IDs internally
- [ ] UI shows only Tag Names
- [ ] Tag Management page fully functional
- [ ] Tag Groups page fully functional

### ✅ Report System
- [ ] All reports built via Report Builder
- [ ] No hardcoded report templates
- [ ] Report Template List page functional
- [ ] Report Section Builder functional
- [ ] Table Section Editor functional
- [ ] Formula Editor functional
- [ ] Mapping Rule page functional
- [ ] FCL Daily Report refactored
- [ ] Order Report refactored
- [ ] Energy Report refactored

### ✅ Live Monitor
- [ ] Live Monitor fully configurable
- [ ] Layout Configuration page functional
- [ ] Section Editor functional
- [ ] No hardcoded Sender/Receiver tables
- [ ] All labels from configuration
- [ ] Uses Tag Groups and Tag Names

### ✅ Dashboard
- [ ] Dashboard Builder functional
- [ ] Widget system working (KPI, Chart, Table)
- [ ] All widgets use Tag Names
- [ ] Layout configurable (drag & drop)
- [ ] Existing dashboard refactored
- [ ] Salalah dashboard saved as default template

### ✅ Energy System
- [ ] Energy Monitor Configuration page functional
- [ ] No hardcoded machine identifiers
- [ ] KPIs read from Tag Names
- [ ] Charts use widget engine
- [ ] Energy reports use Report Builder

### ✅ Material & Bin
- [ ] Material page kept (no breaking changes)
- [ ] Bin page kept (no breaking changes)
- [ ] IN/OUT category optional
- [ ] No logic depends on material category
- [ ] No logic depends on bin type

### ✅ Configuration Safety
- [ ] Preview buttons for Reports
- [ ] Preview buttons for Live Monitor
- [ ] Preview buttons for Dashboard
- [ ] Export/Import page functional
- [ ] Conflict resolution working
- [ ] Backup before import

### ✅ New Plant Configuration
- [ ] New plant can be configured without developers
- [ ] All configuration via UI
- [ ] No code changes required
- [ ] Export/Import works for new plants
- [ ] Default templates available

---

## Success Criteria

**A new plant can be configured by:**
1. Importing base configuration (or starting fresh)
2. Creating Tags (mapping to their PLC addresses)
3. Creating Tag Groups
4. Creating Mappings
5. Creating Report Templates
6. Creating Live Monitor Layouts
7. Creating Dashboard
8. **All without writing any code or modifying database directly**

**Time to Configure New Plant:** 2-4 hours (not days/weeks of development)

---

## Migration Path

### Phase 1: Tag Foundation
1. Create Tag Management page
2. Create Tag Group page
3. Migrate existing PLC addresses to Tags
4. Update all references to use Tag Names

### Phase 2: Report System
1. Create Report Builder
2. Create Formula Editor
3. Create Mapping Rule page
4. Refactor existing reports

### Phase 3: Live Monitor
1. Create Layout Configuration
2. Create Section Editor
3. Refactor current live monitor

### Phase 4: Dashboard & Energy
1. Create Dashboard Builder
2. Refactor dashboard
3. Refactor energy system

### Phase 5: Safety & Polish
1. Add preview features
2. Add export/import
3. Testing and validation

---

**Document Version:** 1.0  
**Last Updated:** December 2024  
**Status:** Requirements Complete - Ready for Implementation

