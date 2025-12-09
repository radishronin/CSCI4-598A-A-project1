# Campus Path Planner & Annotator - Complete User Guide

## Table of Contents

1. [Overview](#overview)
2. [Campus Path Planner](#campus-path-planner)
3. [Map Annotator Tool](#map-annotator-tool)
4. [Graph Data Structure](#graph-data-structure)
5. [Routing Algorithm](#routing-algorithm)
6. [Language Support](#language-support)
7. [Directory Structure](#directory-structure)
8. [API Endpoints](#api-endpoints)
9. [Customization Guide](#customization-guide)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Campus Path Planner system consists of two interconnected applications:

1. **Path Planner**: Computes shortest walking routes between campus buildings using Dijkstra's algorithm
2. **Map Annotator**: Interactive visual editor for creating and modifying campus graph data

Both applications work with a shared campus graph data structure stored in JSON format.

**Key Features:**
- Multi-stop route optimization
- Terrain-aware pathfinding (stairs, slopes, covered paths)
- Visual route overlay on campus map
- Multi-language support (9 languages)
- Interactive graph editing with undo/redo
- Export/import functionality for campus data
- Calibration tools for accurate distance measurements

---

## Campus Path Planner

### Overview

The Path Planner helps users find the fastest walking route between multiple campus buildings. It accounts for terrain features and provides visual feedback on an interactive map.

**Access**: Navigate to `/planner` or click "Try Campus Path Planner" from the RAG interface

### Frontend Interface

#### Header Section

**Title**: "Campus Path Planner"

**Description**: "Plan the fastest way between your stops. Enter building codes in order and preview the optimized campus route on the map."

**Navigation Buttons**:
- `Use Custom Map Annotator` → `/planner/annotator`
- `Back to RAG Assistant` → `/rag`
- `Dark Mode Toggle` (top-right corner)

#### Map Display

**Components**:
- **Campus Map Image**: Base layer showing campus layout
- **SVG Route Overlay**: Dynamic layer for drawing routes
- **Route Polylines**: Blue lines (stroke: `#2c7be5`, width: 4px) showing walking paths
- **Time Labels**: White-outlined text showing segment durations

**Dimensions**: 1600×1600 pixels (configurable in graph JSON)

**Caption**: "The map shows the shortest path between your selected buildings."

#### Building Reference List

**Section**: "Available Buildings"

Displays all buildings with their codes and full names:
- Format: `CODE – Full Building Name`
- Example entries:
  - `CK – Coolbaugh Hall`
  - `GC – Green Center`
  - `HH – Hill Hall`

**Purpose**: Reference for users entering building codes

#### Input Form

**Building Codes Input**:
- **Label**: "Building Codes (in order)"
- **Type**: Multi-line textarea
- **Format**: One building code per line
- **Example**:
  ```
  BE
  BB
  GC
  CT
  ```
- **Placeholder**: Shows example format

**Language Selection**:
- **Label**: "Language"
- **Options**:
  - Auto (English) - default
  - English
  - Spanish
  - French
  - German
  - Chinese (Mandarin)
  - Japanese
  - Korean
  - Portuguese
  - Russian

**Response Mode**:
- **Label**: "Response Mode"
- **Options**:
  - `Direct (localized)`: Labels in selected language only
  - `Both (original + translated)`: English labels + translated versions

**Generate Button**:
- **Text**: "Generate Path"
- **Type**: Primary action button
- **Action**: Submits route computation request

#### Route Display

**Total Time Display**:
- **Element**: `#planner-total-time`
- **Format**: "{label}: {minutes} {unit}"
- **Examples**:
  - English: "Total time: 5.2 min"
  - Spanish: "Tiempo total: 5.2 min"
  - French: "Durée totale: 5.2 min"

**Segment Labels**:
- Displayed on map at midpoint of each route segment
- Format: "{minutes} min"
- Example: "2.3 min"

### How It Works

#### Step 1: User Input

1. User enters building codes in desired order (minimum 2)
2. Optionally selects language and response mode
3. Clicks "Generate Path"

#### Step 2: Route Computation

**Backend Process**:

1. **Parse Input**: Extract building codes from request
2. **Validate Buildings**: Check all codes exist in graph data
3. **For Each Consecutive Pair**:
   - Identify all building entrances
   - Test all entrance-to-entrance combinations
   - Run Dijkstra's algorithm for each pair
   - Select fastest path
4. **Combine Segments**: Merge paths, avoiding duplicate nodes
5. **Calculate Total Time**: Sum all segment durations
6. **Generate Response**: Include polyline coordinates and localized labels

#### Step 3: Visual Display

1. Clear existing route overlay
2. Draw blue polylines for each segment
3. Add time labels at segment midpoints
4. Display total time at bottom of form
5. Paths remain visible until new route requested

### Supported Buildings

The planner supports any buildings defined in the campus graph. Default buildings include, but are not limited to:

- **BB**: Brown Building
- **CK**: Coolbaugh Hall
- **GC**: Green Center
- **HH**: Hill Hall
- **AH**: Alderson Hall
- **MH**: Marquez Hall

**Building Attributes**:
- `id`: Short building code (e.g., "BE")
- `name`: Full building name
- `entranceNodeIds`: Array of node IDs representing building entrances

### Route Calculation Details

#### Entrance Selection

Each building may have multiple entrances. The algorithm tests all entrance pairs to find the optimal combination.

**Example**: Route from BE to GC
- BE has 3 entrances: n1, n2, n3
- GC has 2 entrances: n6, n7
- Algorithm tests: n1→n6, n1→n7, n2→n6, n2→n7, n3→n6, n3→n7
- Selects fastest path (e.g., n2→n6: 125.3s)

#### Travel Time Calculation

**Base Time**:
```
base_time = edge_length_meters / walking_speed_mps
```

**With Penalties**:
```
total_time = base_time + edge_penalty + terrain_penalties
```

**Terrain Penalties** (from `settings.penalties`):
- **Stairs**: +20 seconds (default)
- **Steep slopes**: +15 seconds (default)
- **Covered paths**: -5 seconds (bonus, default)

**Edge-Specific Penalty**:
- Custom penalty per edge (e.g., long outdoor walk in winter: +30s)

#### Blocked Edges

Edges marked as `blocked` or listed in `overrides.blockedEdgeIds` are excluded from routing:

**Use Cases**:
- Construction zones
- Seasonal closures
- Maintenance areas
- Emergency restrictions

### Error Handling

**No Buildings Entered**:
```
"Enter at least two building codes."
```

**Unknown Building Codes**:
```json
{
  "error": "Unknown building codes: XY, ZZ",
  "localized": {
    "error_message": "Códigos de edificio desconocidos: XY, ZZ"
  }
}
```

**No Available Path**:
```json
{
  "error": "No available path between BE and CT.",
  "localized": {
    "error_message": "No hay un camino disponible entre BE y CT."
  }
}
```

**Invalid Request**:
```json
{
  "error": "Request must include a list of building codes.",
  "localized": {...}
}
```

---

## Map Annotator Tool

### Overview

The Annotator is a full-featured visual editor for creating and modifying campus graph data. It provides tools for adding nodes, edges, buildings, and adjusting graph properties.

**Access**: Click "Use Custom Map Annotator" from planner page, or navigate to `/planner/annotator`

**Purpose**:
- Create new campus graphs from scratch
- Edit existing graph topology
- Calibrate coordinate systems
- Adjust penalties and settings
- Export graphs for use with the planner

### Interface Layout

The annotator uses a three-panel layout:

```
┌─────────────────────────────────────────────────┐
│              Top Bar (Actions)                   │
├──────────┬───────────────────────┬───────────────┤
│  Left    │                       │   Right       │
│  Tools   │   Canvas (Map)        │   Inspector   │
│  Panel   │                       │   Panel       │
│          │                       │               │
└──────────┴───────────────────────┴───────────────┘
│              Status Bar                          │
└──────────────────────────────────────────────────┘
```

### Top Bar Actions

**File Operations**:

1. **Load Image**
   - Button: "Load Image"
   - Accepts: PNG, JPEG
   - Action: Loads campus map as base layer
   - File input: `#input-image` (hidden)

2. **Import JSON**
   - Button: "Import JSON"
   - Accepts: JSON files
   - Action: Loads complete graph data (nodes, edges, buildings, settings)
   - Validates graph structure
   - File input: `#input-json` (hidden)

3. **Export JSON**
   - Button: "Export JSON"
   - Action: Downloads current graph as JSON file
   - Filename format: `campus-graph-YYYYMMDD-HHMMSS.json`
   - Includes all graph data

4. **Clear**
   - Button: "Clear"
   - Action: Removes all nodes, edges, and buildings (keeps settings)
   - Confirmation required

5. **Calibration Tool**
   - Button: "Calibration Tool"
   - Action: Activates distance calibration mode
   - See [Calibration](#calibration-tool) section

6. **Help**
   - Button: "Help"
   - Action: Displays keyboard shortcuts and usage tips

**Status Display**:
- Shows current operation status
- Displays messages (e.g., "Image loaded", "10 nodes imported")

### Left Panel - Tools

#### Tool Selection

**Tools** (with keyboard shortcuts):

1. **Pan / Select (V)**
   - **Mode**: Default navigation tool
   - **Mouse Actions**:
     - Left-click: Select node or edge
     - Drag on empty space: Pan view
     - Middle-click drag: Pan view
   - **Keyboard**: `V` key

2. **Add Node (N)**
   - **Mode**: Node creation
   - **Action**: Click on map to add new node
   - **Auto-ID**: Generates sequential IDs (n1, n2, n3...)
   - **Keyboard**: `N` key

3. **Add Edge (E)**
   - **Mode**: Edge creation
   - **Action**: 
     1. Click first node (highlights in yellow)
     2. Click second node (creates edge)
     3. Edge automatically calculates length
   - **Keyboard**: `E` key

4. **Delete (Del)**
   - **Mode**: Deletion tool
   - **Action**: Click node or edge to delete
   - **Warning**: Deleting node removes all connected edges
   - **Keyboard**: `Delete` key (in any mode)

5. **Toggle Edge Flags (T)**
   - **Mode**: Quick flag editing
   - **Action**: Click edge to toggle flags
   - **Available Flags**: Accessible, Stairs, Covered, Blocked
   - **Keyboard**: `T` key

6. **Building Assign (B)**
   - **Mode**: Assign nodes to buildings
   - **Action**: 
     1. Select building from list
     2. Click nodes to assign as entrances
   - **Visual**: Assigned nodes show building ID
   - **Keyboard**: `B` key

#### Global Settings

**Distance Calibration**:
- **px / meter**: Pixels per meter ratio
- **Default**: 3.2
- **Purpose**: Convert pixel distances to real-world meters
- **How to Set**: Use Calibration Tool

**Walking Parameters**:
- **Walking speed (m/s)**: Average walking speed
- **Default**: 1.4 m/s (~5 km/h)
- **Range**: 0.5 - 3.0 m/s typically

**Terrain Penalties** (in seconds):
- **Stairs**: Time added for staircases
  - Default: 20s
  - Purpose: Account for vertical movement time
- **Steep**: Time added for steep slopes
  - Default: 15s
  - Purpose: Account for uphill/downhill effort
- **Covered**: Time bonus for covered paths
  - Default: -5s (negative = bonus)
  - Purpose: Encourage indoor routes in bad weather

### Center Panel - Canvas

**Interactive Map Canvas**:

**Features**:
- **Pan**: Click-drag or middle-mouse drag
- **Zoom**: Scroll wheel or pinch gesture
- **Zoom Range**: 10% to 800%
- **Grid**: Optional background grid (toggle-able)

**Visual Elements**:

1. **Nodes**:
   - **Normal**: Small circles (6px radius)
   - **Entrance**: Larger circles (8px radius) with building label
   - **Selected**: Yellow highlight
   - **Hover**: Orange highlight

2. **Edges**:
   - **Normal**: Thin gray lines (2px)
   - **Selected**: Thick blue lines (4px)
   - **Hover**: Orange highlight
   - **Blocked**: Red color
   - **Stairs**: Dashed line pattern

3. **Building Labels**:
   - Displayed near entrance nodes
   - Format: "Building ID"
   - Font: 12px, bold

**Hover Tooltip**:
- Element: `#hover-tooltip`
- Shows node/edge info on hover
- Content:
  - Node: ID, name, building
  - Edge: ID, length, flags

**Keyboard Shortcuts**:
- `V`: Select/Pan tool
- `N`: Add Node tool
- `E`: Add Edge tool
- `B`: Building Assign tool
- `T`: Toggle Flags tool
- `Delete`: Delete selected item
- `Space`: Temporary pan (hold space)
- `Ctrl+Z`: Undo
- `Ctrl+Y` or `Ctrl+Shift+Z`: Redo
- `Ctrl+S`: Export JSON
- `+`/`-`: Zoom in/out
- `0`: Reset zoom to 100%

### Right Panel - Inspector

#### No Selection State

**Display**: "No selection."

Shows when no node or edge is selected.

#### Node Inspector

**Triggered**: When a node is selected

**Fields**:

1. **Node ID** (read-only)
   - Display: Bold text showing current ID
   - Example: "n42"

2. **Name** (editable)
   - Input: Text field
   - Purpose: Human-readable identifier
   - Example: "BE-entrance-West"

3. **Type** (dropdown)
   - Options:
     - `intersection`: Generic path junction
     - `entrance`: Building entrance
     - `other`: Other point type
   - Default: `intersection`

4. **Building ID** (editable)
   - Input: Text field
   - Purpose: Associate node with building
   - Example: "BE"
   - Note: Must match existing building ID

5. **Entrance** (checkbox)
   - Purpose: Mark as building entrance
   - Effect: Node listed in building's `entranceNodeIds`
   - Visual: Larger circle on map

6. **Position** (read-only)
   - Display: "x: 123.45, y: 678.90"
   - Updates in real-time during node drag

**Actions**:
- All changes auto-save to state
- Changes trigger re-render

#### Edge Inspector

**Triggered**: When an edge is selected

**Fields**:

1. **Edge ID** (read-only)
   - Display: Bold text showing current ID
   - Example: "e17"

2. **From Node** (read-only)
   - Display: Source node ID
   - Example: "n5"

3. **To Node** (read-only)
   - Display: Destination node ID
   - Example: "n8"

4. **Length (px)** (calculated)
   - Display: Pixel distance between nodes
   - Example: "245.67 px"
   - Updates when nodes moved

5. **Length (m)** (calculated)
   - Display: Real-world distance
   - Formula: `length_px / px_per_meter`
   - Example: "76.77 m"

6. **Accessible** (checkbox)
   - Purpose: Mark as wheelchair/accessible path
   - Default: Usually true

7. **Stairs** (checkbox)
   - Purpose: Path includes stairs
   - Effect: Adds stairs penalty to travel time
   - Visual: Dashed line on map

8. **Covered** (checkbox)
   - Purpose: Path is indoors or covered
   - Effect: Applies covered bonus
   - Use: Weather-based routing

9. **Blocked** (checkbox)
   - Purpose: Temporarily disable edge
   - Effect: Edge excluded from routing
   - Visual: Red color on map

10. **Penalty (s)** (editable number)
    - Input: Number field (seconds)
    - Purpose: Custom time penalty for this edge
    - Example: 30 (for long outdoor segment)

**Actions**:
- All changes auto-save
- Recomputes route if planner open
- Flag changes update visual immediately

#### Building Inspector

**Section**: "Buildings"

**Add New Building**:

1. **New building ID** (text input)
   - Format: Short code (e.g., "BE")
   - Validation: Must be unique

2. **New building name** (text input)
   - Format: Full name (e.g., "Brown Hall East")

3. **Add Building** (button)
   - Action: Creates new building entry
   - Validation: ID must be unique and non-empty

**Building List**:
- Shows all buildings in graph
- Format: "ID - Name (X entrances)"
- Example: "BE - Brown Hall East (3 entrances)"
- Click building to edit

**Edit Selected Building** (when building clicked):

**Fields**:
1. **Selected building** (display)
   - Shows current building ID

2. **Building name** (editable)
   - Update full building name

3. **Building ID** (editable)
   - Change building code
   - Updates all node references

4. **Update Building** (button)
   - Saves changes

5. **Delete Building** (button)
   - Removes building
   - Clears building references from nodes
   - Confirmation required

6. **Info Display**
   - Shows entrance count
   - Lists entrance node IDs

#### Lists Section

**Node List**:
- **Filter**: Text search box
- **Display**: Scrollable list of all nodes
- **Format**: "ID - Name (x, y)"
- **Action**: Click to select node
- **Search**: Filters by ID or name

**Edge List**:
- **Filter**: Text search box
- **Display**: Scrollable list of all edges
- **Format**: "ID: from → to (length m)"
- **Action**: Click to select edge
- **Search**: Filters by ID

#### Statistics Section

**Real-time Counts**:

1. **Nodes**: Total node count
2. **Edges**: Total edge count
3. **Entrances**: Count of entrance-type nodes
4. **Blocked edges**: Count of blocked edges

**Purpose**: Quick overview of graph complexity

### Status Bar

**Bottom Bar Elements**:

1. **Zoom Level**
   - Format: "Zoom: 125%"
   - Updates during zoom operations

2. **Coordinates**
   - Format: "Coords: 456.78, 123.45"
   - Shows current mouse position (image coordinates)
   - Updates on mouse move

3. **Selection Status**
   - Shows selected item info
   - Examples:
     - "Selected: Node n42"
     - "Selected: Edge e17"
     - "Pending edge from n5"

### Special Features

#### Calibration Tool

**Purpose**: Establish accurate px-to-meter ratio

**Process**:

1. Click "Calibration Tool" button
2. Status shows: "Calibration: Click two points with known distance"
3. Click first reference point on map
4. Click second reference point
5. Dialog prompts: "Distance between points (meters):"
6. Enter known distance (e.g., 50)
7. Tool calculates and sets `px_per_meter`
8. Confirmation: "Calibration set: 3.45 px/m"

**Use Case Example**:
- Find building with known width (e.g., 50m)
- Click corners of building
- Enter 50 meters
- All edge lengths now accurate

#### Undo/Redo System

**Supported Operations**:
- Add/delete nodes
- Add/delete edges
- Modify node properties
- Modify edge properties
- Add/delete buildings

**Keyboard Shortcuts**:
- `Ctrl+Z`: Undo last action
- `Ctrl+Y` or `Ctrl+Shift+Z`: Redo

**Limitations**:
- History buffer: Last 50 actions
- Image load/import clears history
- Settings changes not undo-able

#### Export/Import

**Export Format** (JSON):
```json
{
  "version": "campus-graph-v1",
  "image": {
    "filename": "campus-map.png",
    "width_px": 1600,
    "height_px": 1600
  },
  "settings": {
    "px_per_meter": 3.2,
    "walking_speed_mps": 1.4,
    "penalties": {
      "stairs_s": 20,
      "steep_s": 15,
      "covered_s": -5
    }
  },
  "nodes": [...],
  "edges": [...],
  "buildings": [...],
  "overrides": {
    "blockedEdgeIds": []
  },
  "meta": {
    "created": "2025-12-09T10:30:00Z",
    "editedBy": "annotator-v1"
  }
}
```

**Import Validation**:
- Checks version compatibility
- Validates required fields
- Verifies node/edge references
- Reports errors if invalid

---

## Graph Data Structure

### File Location

**Path**: `resources/campus-graph-YYYYMMDD-initial-edges.json`

**Current File**: `campus-graph-20251127-initial-edges.json`

### JSON Schema

#### Top Level

```json
{
  "version": "campus-graph-v1",
  "image": {...},
  "settings": {...},
  "nodes": [...],
  "edges": [...],
  "buildings": [...],
  "overrides": {...},
  "meta": {...}
}
```

#### Image Object

```json
{
  "filename": "campus-map.png",
  "width_px": 1600,
  "height_px": 1600
}
```

**Fields**:
- `filename`: Map image filename (must exist in `resources/`)
- `width_px`: Image width in pixels
- `height_px`: Image height in pixels

#### Settings Object

```json
{
  "px_per_meter": 3.2,
  "walking_speed_mps": 1.4,
  "penalties": {
    "stairs_s": 20,
    "steep_s": 15,
    "covered_s": -5
  }
}
```

**Fields**:
- `px_per_meter`: Calibration ratio (pixels per meter)
- `walking_speed_mps`: Average walking speed (meters/second)
- `penalties`: Time adjustments (seconds)
  - `stairs_s`: Added time for stairs
  - `steep_s`: Added time for steep slopes
  - `covered_s`: Time bonus for covered paths (negative)

#### Node Object

```json
{
  "id": "n1",
  "x": 726.96,
  "y": 944.08,
  "name": "BE-entrance-West",
  "type": "entrance",
  "buildingId": "BE",
  "entrance": true
}
```

**Fields**:
- `id` (string, required): Unique node identifier
- `x` (number, required): X coordinate (pixels)
- `y` (number, required): Y coordinate (pixels)
- `name` (string, optional): Human-readable name
- `type` (string, optional): Node type (`intersection`, `entrance`, `other`)
- `buildingId` (string, optional): Associated building code
- `entrance` (boolean, optional): Is building entrance

#### Edge Object

```json
{
  "id": "e1",
  "from": "n1",
  "to": "n2",
  "length_px": 245.67,
  "length_m": 76.77,
  "flags": {
    "accessible": true,
    "stairs": false,
    "covered": false,
    "blocked": false
  },
  "penalty_s": 0
}
```

**Fields**:
- `id` (string, required): Unique edge identifier
- `from` (string, required): Source node ID
- `to` (string, required): Destination node ID
- `length_px` (number, calculated): Length in pixels
- `length_m` (number, calculated): Length in meters
- `flags` (object, optional): Terrain/accessibility flags
  - `accessible`: Wheelchair accessible
  - `stairs`: Has stairs
  - `covered`: Indoor or covered
  - `blocked`: Temporarily blocked
- `penalty_s` (number, optional): Custom time penalty (seconds)

#### Building Object

```json
{
  "id": "BE",
  "name": "Brown Hall East",
  "entranceNodeIds": ["n1", "n2", "n3"]
}
```

**Fields**:
- `id` (string, required): Short building code
- `name` (string, required): Full building name
- `entranceNodeIds` (array, required): Array of entrance node IDs

#### Overrides Object

```json
{
  "blockedEdgeIds": ["e42", "e103"]
}
```

**Fields**:
- `blockedEdgeIds` (array): List of edge IDs to exclude from routing

#### Meta Object

```json
{
  "created": "2025-11-27T10:00:00Z",
  "editedBy": "annotator-v1"
}
```

**Fields**:
- `created` (string): ISO timestamp of creation
- `editedBy` (string): Tool/user identifier

---

## Routing Algorithm

### Dijkstra's Algorithm Implementation

**File**: `routes/planner.py`

**Function**: `_dijkstra(start, goal, adjacency)`

**Algorithm**:

```python
def _dijkstra(start, goal, adjacency):
    """
    Compute shortest path using Dijkstra's algorithm.
    
    Args:
        start: Starting node ID
        goal: Goal node ID
        adjacency: Dict mapping node_id -> [(neighbor_id, weight), ...]
    
    Returns:
        (distance, path): Total time and list of node IDs
    """
    queue = [(0.0, start)]  # Priority queue: (distance, node)
    distances = {start: 0.0}
    previous = {start: None}
    
    while queue:
        current_distance, node = heapq.heappop(queue)
        
        if node == goal:
            break
            
        if current_distance > distances.get(node, float("inf")):
            continue
            
        for neighbor, weight in adjacency.get(node, []):
            distance = current_distance + weight
            
            if distance < distances.get(neighbor, float("inf")):
                distances[neighbor] = distance
                previous[neighbor] = node
                heapq.heappush(queue, (distance, neighbor))
    
    # Reconstruct path
    path = []
    node = goal
    while node is not None:
        path.append(node)
        node = previous.get(node)
    path.reverse()
    
    return distances.get(goal), path
```

**Complexity**:
- Time: O((V + E) log V) where V = nodes, E = edges
- Space: O(V)

### Adjacency List Construction

**Function**: `_build_adjacency(graph)`

**Process**:

1. Extract settings and blocked edge list
2. For each edge:
   - Calculate travel time using `_edge_travel_time()`
   - Skip if blocked
   - Add bidirectional entries to adjacency list
3. Return adjacency dict

**Adjacency Structure**:
```python
{
  "n1": [("n2", 45.5), ("n3", 67.2)],
  "n2": [("n1", 45.5), ("n4", 32.1)],
  ...
}
```

### Travel Time Calculation

**Function**: `_edge_travel_time(edge, settings, blocked_edge_ids)`

**Formula**:
```python
base_time_s = edge["length_m"] / settings["walking_speed_mps"]
penalty = edge.get("penalty_s", 0)

if edge.flags.get("stairs"):
    penalty += settings.penalties.stairs_s
if edge.flags.get("steep"):
    penalty += settings.penalties.steep_s
if edge.flags.get("covered"):
    penalty += settings.penalties.covered_s

total_time = base_time_s + penalty
```

**Example**:
```
Edge: 50m length, has stairs
Walking speed: 1.4 m/s
Stairs penalty: 20s

base_time = 50 / 1.4 = 35.7s
penalty = 0 + 20 = 20s
total_time = 35.7 + 20 = 55.7s
```

### Multi-Stop Routing

**Function**: `_shortest_path_between_buildings(building_start, building_end, adjacency)`

**Process**:

1. Get entrance nodes for both buildings
2. For each entrance pair:
   - Run Dijkstra's algorithm
   - Record time and path
3. Select pair with minimum time
4. Return best path

**Example**: BE → GC
```
BE entrances: [n1, n2, n3]
GC entrances: [n6, n7]

Tests:
n1 → n6: 130.2s
n1 → n7: 145.7s
n2 → n6: 125.3s ← BEST
n2 → n7: 140.8s
n3 → n6: 128.9s
n3 → n7: 142.1s

Result: Use n2 → n6 (125.3s)
```

---

## Language Support

### Supported Languages

The planner supports localized labels in 9 languages:

| Code | Language | Label Example |
|------|----------|--------------|
| `""` or `en` | English | "Total time: 5.2 min" |
| `es` | Spanish | "Tiempo total: 5.2 min" |
| `fr` | French | "Durée totale: 5.2 min" |
| `de` | German | "Gesamtzeit: 5.2 Min" |
| `zh` | Chinese (Mandarin) | "总用时: 5.2 分" |
| `ja` | Japanese | (configurable) |
| `ko` | Korean | (configurable) |
| `pt` | Portuguese | (configurable) |
| `ru` | Russian | (configurable) |

### Translation Implementation

**Backend Function**: `_localized_strings(lang)`

**Returns**: Dictionary with localized strings:
```python
{
  "total_time_label": "Total time:",
  "minutes_unit": "min",
  "error_invalid": "Request must include...",
  "error_unknown_codes": "Unknown building codes:",
  "error_no_path": "No available path between..."
}
```

**Response Modes**:

1. **Direct** (default):
   - Only localized strings sent
   - Frontend displays in selected language

2. **Both**:
   - Original (English) + localized strings
   - Format:
   ```json
   {
     "localized": {
       "original": {
         "total_time_label": "Total time:",
         "minutes_unit": "min"
       },
       "total_time_label": "Tiempo total:",
       "minutes_unit": "min"
     }
   }
   ```

### Adding New Languages

**Steps**:

1. Edit `routes/planner.py`, function `_localized_strings()`
2. Add new language code to `translations` dict:
   ```python
   "it": {  # Italian
     "total_time_label": "Tempo totale:",
     "minutes_unit": "min",
     "error_invalid": "La richiesta deve includere...",
     "error_unknown_codes": "Codici edificio sconosciuti:",
     "error_no_path": "Nessun percorso tra {from_code} e {to_code}."
   }
   ```
3. Add language option to `templates/planner.html`:
   ```html
   <option value="it">Italian</option>
   ```

---

## Directory Structure

### Planner-Related Files

```
project-root/
├── resources/
│   ├── campus-graph-20251127-initial-edges.json  # Graph data
│   └── campus-map.png                            # Campus map image
│
├── routes/
│   └── planner.py                                # Backend routing logic
│
├── templates/
│   ├── planner.html                              # Planner UI
│   └── annotator.html                            # Annotator UI
│
├── static/
│   ├── planner.js                                # Planner frontend logic
│   ├── planner.css                               # Planner styles
│   ├── annotator.js                              # Annotator frontend (1700+ lines)
│   └── annotator.css                             # Annotator styles
│
└── documentation/
    └── planner.md                                # This file
```

### File Descriptions

**`campus-graph-*.json`**:
- Complete graph definition
- Nodes, edges, buildings, settings
- Created/edited by annotator
- Read by planner for routing

**`campus-map.png`**:
- Base map image
- Referenced by graph JSON
- Displayed in planner and annotator
- Typically 1600×1600 pixels

**`planner.py`**:
- Flask blueprint for `/planner` routes
- Dijkstra's algorithm implementation
- Route computation logic
- Localization support
- ~340 lines

**`planner.js`**:
- Frontend route visualization
- SVG polyline drawing
- Request/response handling
- ~150 lines

**`annotator.js`**:
- Full interactive editor
- Canvas rendering
- Tool implementations
- Undo/redo system
- Export/import
- ~1700 lines

---

## API Endpoints

### Planner Endpoints

#### GET `/planner/`

**Purpose**: Render planner interface

**Response**: HTML template with:
- Building list (IDs and names)
- Map dimensions
- Empty route overlay

**Template**: `planner.html`

#### POST `/planner/route`

**Purpose**: Compute route between buildings

**Request**:
```json
{
  "buildings": ["BE", "BB", "GC"],
  "target_language": "es",
  "response_mode": "direct"
}
```

**Parameters**:
- `buildings` (array, required): List of building codes
- `target_language` (string, optional): Language code
- `response_mode` (string, optional): "direct" or "both"

**Success Response** (200):
```json
{
  "image": {
    "width_px": 1600,
    "height_px": 1600,
    "url": "/planner/campus-map"
  },
  "legs": [
    {
      "from_building": "BE",
      "to_building": "BB",
      "time_s": 125.3,
      "polyline": [
        {"x": 726.96, "y": 944.08},
        {"x": 750.23, "y": 932.45},
        ...
      ],
      "label_position": {"x": 800, "y": 900}
    },
    ...
  ],
  "total_time_s": 312.7,
  "localized": {
    "total_time_label": "Tiempo total:",
    "minutes_unit": "min",
    "total_time_format": "{minutes} min"
  }
}
```

**Error Response** (400):
```json
{
  "error": "Unknown building codes: XY",
  "localized": {
    "error_message": "Códigos de edificio desconocidos: XY"
  }
}
```

#### GET `/planner/campus-map`

**Purpose**: Serve campus map image

**Response**: PNG image

**Path**: `resources/campus-map.png`

**Usage**: Referenced by planner and annotator

#### GET `/planner/annotator`

**Purpose**: Render annotator interface

**Response**: HTML template

**Template**: `annotator.html`

---

## Customization Guide

### Adjusting Walking Parameters

**File**: `resources/campus-graph-*.json`

**Settings to Modify**:

```json
{
  "settings": {
    "walking_speed_mps": 1.4,  // Increase for faster walking
    "penalties": {
      "stairs_s": 20,          // Increase to discourage stairs
      "steep_s": 15,           // Increase for steep terrain
      "covered_s": -5          // Make more negative to prefer covered paths
    }
  }
}
```

**Effect**: Changes route optimization preferences

### Adding New Buildings

**Option 1: Annotator (Recommended)**

1. Open annotator at `/planner/annotator`
2. Import existing graph
3. Use "Add Node" tool to create entrance nodes
4. Use "Building Assign" tool or Building Inspector to create building
5. Assign nodes as entrances
6. Connect entrances to path network with edges
7. Export updated graph

**Option 2: Manual JSON Edit**

1. Add building to `buildings` array:
   ```json
   {
     "id": "NB",
     "name": "New Building",
     "entranceNodeIds": ["n101", "n102"]
   }
   ```

2. Add entrance nodes:
   ```json
   {
     "id": "n101",
     "x": 1200,
     "y": 800,
     "name": "NB-entrance-main",
     "type": "entrance",
     "buildingId": "NB",
     "entrance": true
   }
   ```

3. Add edges connecting entrances to network

4. Save and test in planner

### Blocking Paths

**Temporary Closure**:

Add edge IDs to `overrides.blockedEdgeIds`:
```json
{
  "overrides": {
    "blockedEdgeIds": ["e42", "e103"]
  }
}
```

**Permanent Removal**:

Use annotator:
1. Select edge
2. Check "Blocked" flag
3. Or use Delete tool to remove edge entirely

### Custom Edge Penalties

**Use Case**: Long outdoor segment to discourage in winter

**Steps**:

1. Open annotator
2. Select edge
3. Set "Penalty (s)" to desired value (e.g., 60)
4. Export graph

**Effect**: Edge will cost additional 60 seconds in routing

---

## Troubleshooting

### Planner Issues

#### "No available path between X and Y"

**Causes**:
- Buildings not connected by edges
- All paths blocked
- Graph topology error

**Solutions**:
1. Open annotator and verify path exists
2. Check for isolated graph components
3. Verify entrance nodes connected to network
4. Check `overrides.blockedEdgeIds` doesn't block all paths

#### Route Not Displaying on Map

**Causes**:
- JavaScript error
- SVG overlay not rendering
- Coordinates out of bounds

**Solutions**:
1. Check browser console for errors
2. Verify polyline coordinates within map bounds
3. Check SVG viewBox matches image dimensions
4. Refresh page and try again

#### Building Codes Not Recognized

**Causes**:
- Typo in building code
- Building not in graph
- Graph file not loaded

**Solutions**:
1. Check spelling against "Available Buildings" list
2. Verify graph JSON contains building
3. Check server logs for graph load errors
4. Restart application

### Annotator Issues

#### Canvas Not Displaying Image

**Causes**:
- Image file not found
- Incorrect path in graph JSON
- Browser security restrictions

**Solutions**:
1. Verify `campus-map.png` exists in `resources/`
2. Check `image.filename` in graph JSON
3. Clear browser cache
4. Check browser console for errors

#### Nodes/Edges Not Selectable

**Causes**:
- Wrong tool selected
- Zoom level too low
- Canvas not focused

**Solutions**:
1. Press `V` to activate Select tool
2. Zoom in for precision
3. Click canvas area first
4. Check status bar shows "Select" tool

#### Export Not Working

**Causes**:
- Browser blocking download
- Invalid graph data
- Insufficient permissions

**Solutions**:
1. Check browser download permissions
2. Validate graph has required fields
3. Try different browser
4. Check console for errors

#### Calibration Gives Wrong Values

**Causes**:
- Incorrect reference distance
- Points too close together
- Measurement error

**Solutions**:
1. Use longer reference distance (50m+ recommended)
2. Ensure points are clearly identifiable
3. Measure reference distance accurately
4. Recalibrate with different points

### Performance Issues

#### Annotator Slow with Large Graphs

**Symptoms**: Lag when panning/zooming

**Solutions**:
1. Reduce node/edge count if possible
2. Use modern browser (Chrome/Edge recommended)
3. Close other applications
4. Disable browser extensions
5. Use smaller canvas area

#### Route Computation Timeout

**Symptoms**: Request takes too long

**Causes**:
- Very large graph
- Complex multi-stop route
- Server overloaded

**Solutions**:
1. Simplify graph (remove unnecessary nodes)
2. Reduce number of stops
3. Optimize graph topology
4. Increase server timeout settings

---

## Advanced Topics

### Graph Validation

**Recommended Checks**:

1. **Connectivity**: All buildings reachable from each other
2. **Entrance Assignment**: Every building has ≥1 entrance
3. **Edge Lengths**: All edges have positive length
4. **Node References**: All edge endpoints exist
5. **Building IDs**: All unique and non-empty

**Validation Script** (Python):
```python
def validate_graph(graph):
    errors = []
    
    # Check node references
    node_ids = {n["id"] for n in graph["nodes"]}
    for edge in graph["edges"]:
        if edge["from"] not in node_ids:
            errors.append(f"Edge {edge['id']}: invalid 'from' node")
        if edge["to"] not in node_ids:
            errors.append(f"Edge {edge['id']}: invalid 'to' node")
    
    # Check building entrances
    for building in graph["buildings"]:
        if not building.get("entranceNodeIds"):
            errors.append(f"Building {building['id']}: no entrances")
        for node_id in building.get("entranceNodeIds", []):
            if node_id not in node_ids:
                errors.append(f"Building {building['id']}: invalid entrance {node_id}")
    
    return errors
```

### Batch Route Computing

For analyzing multiple routes programmatically:

```python
import requests

buildings_list = [
    ["BE", "GC", "CT"],
    ["BB", "HH", "AH"],
    ["CK", "KB", "MH"]
]

results = []
for buildings in buildings_list:
    response = requests.post(
        "http://localhost:5000/planner/route",
        json={"buildings": buildings}
    )
    data = response.json()
    results.append({
        "route": " → ".join(buildings),
        "time_min": data["total_time_s"] / 60
    })

# Analyze results
for r in results:
    print(f"{r['route']}: {r['time_min']:.1f} min")
```

### Custom Map Images

**Requirements**:
- Format: PNG or JPEG
- Recommended size: 1600×1600 px (or larger)
- Clear, high-contrast
- North-oriented (optional)

**Steps**:
1. Obtain campus map image
2. Save as `campus-map.png` in `resources/`
3. Open annotator
4. Click "Load Image"
5. Create graph from scratch or import existing
6. Export with correct image dimensions

---

**Version**: 1.0  
**Application**: Full-Stack LLMs Vibe Coding Project - Campus Path Planner
