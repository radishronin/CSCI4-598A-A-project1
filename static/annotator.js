(function () {
  "use strict";

  // ---------- State ----------

  const state = {
    version: "campus-graph-v1",
    image: {
      img: null,
      filename: "",
      width_px: 0,
      height_px: 0
    },
    settings: {
      px_per_meter: 3.2,
      walking_speed_mps: 1.4,
      penalties: {
        stairs_s: 20,
        steep_s: 15,
        covered_s: -5
      }
    },
    nodes: [],
    edges: [],
    buildings: [],
    overrides: {
      blockedEdgeIds: []
    },
    meta: {
      created: null,
      editedBy: "annotator-v1"
    }
  };

  const view = {
    canvas: null,
    ctx: null,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    minZoom: 0.1,
    maxZoom: 8,
    isPanning: false,
    lastPanX: 0,
    lastPanY: 0,
    spacePanning: false,
    currentTool: "select",
    selected: { type: null, id: null },
    hover: { type: null, id: null },
    calibrationPoints: [],
    pendingEdgeStartNodeId: null,
    nextNodeIndex: 1,
    nextEdgeIndex: 1,
    dirty: true,

    // NEW:
    selectedBuildingId: null
  };

  // ---------- Utility ----------

  function setDirty() {
    view.dirty = true;
  }

  function setTool(tool) {
    view.currentTool = tool;
    view.pendingEdgeStartNodeId = null;
    view.calibrationPoints = [];
    highlightToolButton(tool);
    updateStatusSelection();
    setDirty();
  }

  function highlightToolButton(tool) {
    const buttons = document.querySelectorAll(".tool-button");
    buttons.forEach((btn) => {
      const t = btn.getAttribute("data-tool");
      btn.classList.toggle("active", t === tool);
    });
  }

  function screenToImage(x, y) {
    const rect = view.canvas.getBoundingClientRect();
    const sx = x - rect.left;
    const sy = y - rect.top;
    const ix = (sx - view.offsetX) / view.zoom;
    const iy = (sy - view.offsetY) / view.zoom;
    return { x: ix, y: iy };
  }

  function imageToScreen(x, y) {
    return {
      x: view.offsetX + x * view.zoom,
      y: view.offsetY + y * view.zoom
    };
  }

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function generateNodeId() {
    const id = "n" + view.nextNodeIndex;
    view.nextNodeIndex += 1;
    return id;
  }

  function generateEdgeId() {
    const id = "e" + view.nextEdgeIndex;
    view.nextEdgeIndex += 1;
    return id;
  }

  function recomputeEdgeLengths() {
    const ppm = state.settings.px_per_meter || 1;
    for (const edge of state.edges) {
      const n1 = getNodeById(edge.from);
      const n2 = getNodeById(edge.to);
      if (!n1 || !n2) continue;
      const lenPx = distance(n1, n2);
      edge.length_px = lenPx;
      edge.length_m = lenPx / ppm;
    }
  }

  function getNodeById(id) {
    return state.nodes.find((n) => n.id === id) || null;
  }

  function getEdgeById(id) {
    return state.edges.find((e) => e.id === id) || null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatNumber(value, decimals) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "";
    }
    return value.toFixed(decimals);
  }

  // ---------- Hit-testing ----------

  function hitTestNode(imagePoint) {
    if (!state.image.img) return null;
    const radiusScreen = 8; // px
    const radiusImage = radiusScreen / view.zoom;
    let best = null;
    let bestDist = Infinity;
    for (const node of state.nodes) {
      const d = distance(imagePoint, node);
      if (d <= radiusImage && d < bestDist) {
        bestDist = d;
        best = node;
      }
    }
    return best;
  }

  function pointToSegmentDistance(p, a, b) {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = p.x - a.x;
    const wy = p.y - a.y;

    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return distance(p, a);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return distance(p, b);
    const t = c1 / c2;
    const proj = { x: a.x + t * vx, y: a.y + t * vy };
    return distance(p, proj);
  }

  function hitTestEdge(imagePoint) {
    if (!state.image.img) return null;
    const toleranceScreen = 8;
    const tolImage = toleranceScreen / view.zoom;
    let best = null;
    let bestDist = Infinity;
    for (const edge of state.edges) {
      const n1 = getNodeById(edge.from);
      const n2 = getNodeById(edge.to);
      if (!n1 || !n2) continue;
      const d = pointToSegmentDistance(imagePoint, n1, n2);
      if (d <= tolImage && d < bestDist) {
        bestDist = d;
        best = edge;
      }
    }
    return best;
  }

  // ---------- Drawing ----------

  function resizeCanvas() {
    const container = document.getElementById("canvas-container");
    const rect = container.getBoundingClientRect();
    view.canvas.width = rect.width;
    view.canvas.height = rect.height;
    if (state.image.img && state.image.width_px && state.image.height_px) {
      // Fit image on first load or window resize
      const sx = rect.width / state.image.width_px;
      const sy = rect.height / state.image.height_px;
      const scale = Math.min(sx, sy, 1);
      if (!Number.isFinite(view.zoom) || view.zoom === 1) {
        view.zoom = scale;
        view.offsetX = (rect.width - state.image.width_px * view.zoom) / 2;
        view.offsetY = (rect.height - state.image.height_px * view.zoom) / 2;
      }
    }
    setDirty();
  }

  function draw() {
    if (!view.dirty) return;
    view.dirty = false;

    const ctx = view.ctx;
    const canvas = view.canvas;
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (state.image.img) {
      const w = state.image.width_px;
      const h = state.image.height_px;
      ctx.globalAlpha = 0.7;
      ctx.drawImage(
        state.image.img,
        0,
        0,
        w,
        h,
        view.offsetX,
        view.offsetY,
        w * view.zoom,
        h * view.zoom
      );
      ctx.globalAlpha = 1.0;
    }

    // Draw edges
    for (const edge of state.edges) {
      const n1 = getNodeById(edge.from);
      const n2 = getNodeById(edge.to);
      if (!n1 || !n2) continue;
      const p1 = imageToScreen(n1.x, n1.y);
      const p2 = imageToScreen(n2.x, n2.y);

      let strokeStyle = "#cccccc";
      let lineWidth = 1.5;
      let lineDash = [];

      if (!edge.flags || edge.flags.accessible === undefined) {
        edge.flags = {
          accessible: true,
          stairs: false,
          covered: false,
          blocked: false
        };
      }

      if (edge.flags.blocked) {
        strokeStyle = "#ff4b4b";
        lineWidth = 2.2;
      } else if (!edge.flags.accessible) {
        strokeStyle = "#ffaa00";
        lineDash = [6, 3, 1, 3]; // dot-dash
      } else if (edge.flags.stairs) {
        strokeStyle = "#66d9ff";
        lineDash = [6, 4];
      } else if (edge.flags.covered) {
        strokeStyle = "#90ee90";
        lineWidth = 2;
      }

      if (view.selected.type === "edge" && view.selected.id === edge.id) {
        lineWidth += 1.5;
      }

      ctx.beginPath();
      ctx.setLineDash(lineDash);
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeStyle;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      if (edge.flags.blocked) {
        // draw simple X markers along the edge
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const size = 4;
        ctx.beginPath();
        ctx.setLineDash([]);
        ctx.moveTo(midX - size, midY - size);
        ctx.lineTo(midX + size, midY + size);
        ctx.moveTo(midX - size, midY + size);
        ctx.lineTo(midX + size, midY - size);
        ctx.stroke();
      }
    }

    // Draw nodes
    for (const node of state.nodes) {
      const p = imageToScreen(node.x, node.y);
      const r = 5;

      const isSelected = view.selected.type === "node" && view.selected.id === node.id;

      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.lineWidth = isSelected ? 2 : 1.2;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = isSelected ? "#4a80ff" : "#000000";
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Entrance ring
      const entrance = node.entrance || node.type === "entrance";
      if (entrance) {
        ctx.beginPath();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#00ffcc";
        ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawLoop() {
    requestAnimationFrame(drawLoop);
    draw();
  }

  // ---------- Selection / Inspector ----------

  function setSelection(type, id) {
    view.selected.type = type;
    view.selected.id = id || null;
    view.pendingEdgeStartNodeId = null;
    updateInspector();
    updateListsSelection();
    updateStatusSelection();
    setDirty();
  }

  function updateInspector() {
    const nodeInspector = document.getElementById("node-inspector");
    const edgeInspector = document.getElementById("edge-inspector");
    const noSelection = document.getElementById("no-selection");

    nodeInspector.classList.add("hidden");
    edgeInspector.classList.add("hidden");
    noSelection.classList.add("hidden");

    if (!view.selected.type || !view.selected.id) {
      noSelection.classList.remove("hidden");
      return;
    }

    if (view.selected.type === "node") {
      const node = getNodeById(view.selected.id);
      if (!node) {
        noSelection.classList.remove("hidden");
        return;
      }

      nodeInspector.classList.remove("hidden");
      document.getElementById("node-id").textContent = node.id;
      document.getElementById("node-name").value = node.name || "";
      document.getElementById("node-type").value = node.type || "intersection";
      document.getElementById("node-building-id").value = node.buildingId || "";
      document.getElementById("node-entrance").checked = !!node.entrance;
      document.getElementById("node-pos").textContent =
        "(" + Math.round(node.x) + ", " + Math.round(node.y) + ")";
    } else if (view.selected.type === "edge") {
      const edge = getEdgeById(view.selected.id);
      if (!edge) {
        noSelection.classList.remove("hidden");
        return;
      }
      edgeInspector.classList.remove("hidden");
      document.getElementById("edge-id").textContent = edge.id;
      document.getElementById("edge-from").textContent = edge.from;
      document.getElementById("edge-to").textContent = edge.to;
      document.getElementById("edge-length-px").textContent = formatNumber(edge.length_px || 0, 1);
      document.getElementById("edge-length-m").textContent = formatNumber(edge.length_m || 0, 2);

      const flags = edge.flags || {
        accessible: true,
        stairs: false,
        covered: false,
        blocked: false
      };
      edge.flags = flags;

      document.getElementById("edge-flag-accessible").checked = !!flags.accessible;
      document.getElementById("edge-flag-stairs").checked = !!flags.stairs;
      document.getElementById("edge-flag-covered").checked = !!flags.covered;
      document.getElementById("edge-flag-blocked").checked = !!flags.blocked;
      document.getElementById("edge-penalty").value = edge.penalty_s || 0;
    }
  }

  function updateStatusSelection() {
    const el = document.getElementById("status-selection");
    if (!view.selected.type) {
      el.textContent = "";
      return;
    }
    el.textContent = "Selected: " + view.selected.type + " " + view.selected.id;
  }

  // ---------- Lists / Stats ----------

  function updateLists() {
    const nodeList = document.getElementById("node-list");
    const edgeList = document.getElementById("edge-list");
    const buildingList = document.getElementById("building-list");

    const nodeFilter = document.getElementById("filter-nodes").value.trim().toLowerCase();
    const edgeFilter = document.getElementById("filter-edges").value.trim().toLowerCase();

    nodeList.innerHTML = "";
    edgeList.innerHTML = "";
    buildingList.innerHTML = "";

    // Nodes: entrances first
    const nodesCopy = state.nodes.slice();
    nodesCopy.sort((a, b) => {
      const aEntrance = a.entrance || a.type === "entrance";
      const bEntrance = b.entrance || b.type === "entrance";
      if (aEntrance && !bEntrance) return -1;
      if (!aEntrance && bEntrance) return 1;
      return a.id.localeCompare(b.id);
    });

    for (const node of nodesCopy) {
      const label = (node.name || node.id || "") + " (" + node.id + ")";
      if (nodeFilter && !label.toLowerCase().includes(nodeFilter)) continue;
      const item = document.createElement("div");
      item.className = "list-item";
      item.textContent = label;
      item.dataset.type = "node";
      item.dataset.id = node.id;
      nodeList.appendChild(item);
    }

    // Edges: blocked first
    const edgesCopy = state.edges.slice();
    edgesCopy.sort((a, b) => {
      const ablocked = a.flags && a.flags.blocked;
      const bblocked = b.flags && b.flags.blocked;
      if (ablocked && !bblocked) return -1;
      if (!ablocked && bblocked) return 1;
      return a.id.localeCompare(b.id);
    });

    for (const edge of edgesCopy) {
      const label =
        edge.id +
        " (" +
        edge.from +
        " → " +
        edge.to +
        ", " +
        formatNumber(edge.length_m || 0, 1) +
        " m)";
      if (edgeFilter && !label.toLowerCase().includes(edgeFilter)) continue;
      const item = document.createElement("div");
      item.className = "list-item";
      item.textContent = label;
      item.dataset.type = "edge";
      item.dataset.id = edge.id;
      edgeList.appendChild(item);
    }

    // Buildings
    for (const b of state.buildings) {
      const div = document.createElement("div");
      div.className = "building-item";
      div.dataset.id = b.id;

      if (view.selectedBuildingId === b.id) {
        div.classList.add("selected");
      }

      const title = document.createElement("div");
      title.textContent = b.id + " — " + (b.name || "(no name)");

      const entrances = document.createElement("div");
      entrances.style.opacity = "0.8";
      entrances.textContent =
        "Entrances: " +
        (b.entranceNodeIds && b.entranceNodeIds.length
          ? b.entranceNodeIds.join(", ")
          : "(none)");

      div.appendChild(title);
      div.appendChild(entrances);
      buildingList.appendChild(div);
    }

    updateStats();
    updateListsSelection();
    updateBuildingEditInspector(); // NEW: keep edit panel in sync
  }

  function updateStats() {
    const nodes = state.nodes.length;
    const edges = state.edges.length;
    const entrances = state.nodes.filter(
      (n) => n.entrance || n.type === "entrance"
    ).length;
    const blocked = state.edges.filter((e) => e.flags && e.flags.blocked).length;

    document.getElementById("stat-nodes").textContent = String(nodes);
    document.getElementById("stat-edges").textContent = String(edges);
    document.getElementById("stat-entrances").textContent = String(entrances);
    document.getElementById("stat-blocked-edges").textContent = String(blocked);
  }

  function updateListsSelection() {
    const items = document.querySelectorAll(".list-item");
    items.forEach((item) => {
      const type = item.dataset.type;
      const id = item.dataset.id;
      const selected =
        view.selected.type === type && view.selected.id === id;
      item.classList.toggle("selected", selected);
    });
  }

  function updateBuildingEditInspector() {
    const panel = document.getElementById("building-edit");
    const idSpan = document.getElementById("building-selected-id");
    const nameInput = document.getElementById("building-edit-name");
    const idInput = document.getElementById("building-edit-id");
    const info = document.getElementById("building-edit-info");

    if (!view.selectedBuildingId) {
      panel.classList.add("hidden");
      return;
    }

    const b = state.buildings.find((bb) => bb.id === view.selectedBuildingId);
    if (!b) {
      view.selectedBuildingId = null;
      panel.classList.add("hidden");
      return;
    }

    panel.classList.remove("hidden");
    idSpan.textContent = b.id;
    nameInput.value = b.name || "";
    idInput.value = b.id;

    const nodeCount = state.nodes.filter((n) => n.buildingId === b.id).length;
    const entranceCount = (b.entranceNodeIds || []).length;

    info.textContent =
      "Nodes with this building: " +
      nodeCount +
      ", entrances: " +
      entranceCount;
  }


  // ---------- Buildings ----------

  function ensureBuildingExists(id, nameOpt) {
    if (!id) return null;
    let b = state.buildings.find((bb) => bb.id === id);
    if (!b) {
      b = {
        id: id,
        name: nameOpt || id,
        entranceNodeIds: [],
        courses: []
      };
      state.buildings.push(b);
    } else if (nameOpt && !b.name) {
      b.name = nameOpt;
    }
    return b;
  }

  function rebuildBuildingEntranceListsFromNodes() {
    // Start with empty entranceNodeIds
    for (const b of state.buildings) {
      b.entranceNodeIds = [];
    }
    for (const node of state.nodes) {
      if (!node.buildingId) continue;
      const b = ensureBuildingExists(node.buildingId, null);
      const isEntrance = node.entrance || node.type === "entrance";
      if (isEntrance) {
        if (!b.entranceNodeIds.includes(node.id)) {
          b.entranceNodeIds.push(node.id);
        }
      }
    }
  }

  // ---------- Tools / Canvas events ----------

  function onCanvasMouseDown(e) {
    const isPrimary = e.button === 0;
    if (!isPrimary) return;

    const rect = view.canvas.getBoundingClientRect();
    view.lastPanX = e.clientX - rect.left;
    view.lastPanY = e.clientY - rect.top;

    if (view.currentTool === "select" || view.spacePanning) {
      // Selection or pan
      const imgPt = screenToImage(e.clientX, e.clientY);

      if (view.spacePanning) {
        view.isPanning = true;
        return;
      }

      const node = hitTestNode(imgPt);
      if (node) {
        setSelection("node", node.id);
        return;
      }
      const edge = hitTestEdge(imgPt);
      if (edge) {
        setSelection("edge", edge.id);
        return;
      }

      // Empty click: start pan
      view.isPanning = true;
      setSelection(null, null);
      return;
    }

    const imgPt = screenToImage(e.clientX, e.clientY);

    if (view.currentTool === "add-node") {
      const id = generateNodeId();
      const node = {
        id: id,
        x: imgPt.x,
        y: imgPt.y,
        name: "",
        type: "intersection",
        buildingId: null,
        entrance: false
      };
      state.nodes.push(node);
      recomputeEdgeLengths();
      rebuildBuildingEntranceListsFromNodes();
      updateLists();
      setSelection("node", id);
      setDirty();
    } else if (view.currentTool === "add-edge") {
      const node = hitTestNode(imgPt);
      if (node) {
        if (!view.pendingEdgeStartNodeId) {
          view.pendingEdgeStartNodeId = node.id;
          document.getElementById("top-bar-status").textContent =
            "Add Edge: start at " + node.id + ", click another node to connect.";
        } else if (view.pendingEdgeStartNodeId === node.id) {
          // ignore self-click
        } else {
          const fromId = view.pendingEdgeStartNodeId;
          const toId = node.id;
          const n1 = getNodeById(fromId);
          const n2 = getNodeById(toId);
          if (!n1 || !n2) return;
          const lenPx = distance(n1, n2);
          const lenM = lenPx / (state.settings.px_per_meter || 1);
          const id = generateEdgeId();
          const edge = {
            id: id,
            from: fromId,
            to: toId,
            length_px: lenPx,
            length_m: lenM,
            flags: {
              accessible: true,
              stairs: false,
              covered: false,
              blocked: false
            },
            penalty_s: 0
          };
          state.edges.push(edge);
          view.pendingEdgeStartNodeId = null;
          updateLists();
          setSelection("edge", id);
          setDirty();
          document.getElementById("top-bar-status").textContent =
            "Edge created: " + id;
        }
      }
    } else if (view.currentTool === "delete") {
      const node = hitTestNode(imgPt);
      if (node) {
        // Confirm removal of edges
        const hasEdges = state.edges.some(
          (e2) => e2.from === node.id || e2.to === node.id
        );
        if (hasEdges) {
          const ok = window.confirm(
            "Delete node " + node.id + " and all connected edges?"
          );
          if (!ok) return;
        }
        state.edges = state.edges.filter(
          (e2) => e2.from !== node.id && e2.to !== node.id
        );
        state.nodes = state.nodes.filter((n) => n.id !== node.id);
        rebuildBuildingEntranceListsFromNodes();
        updateLists();
        setSelection(null, null);
        setDirty();
        return;
      }
      const edge = hitTestEdge(imgPt);
      if (edge) {
        const ok = window.confirm("Delete edge " + edge.id + "?");
        if (!ok) return;
        state.edges = state.edges.filter((e2) => e2.id !== edge.id);
        updateLists();
        setSelection(null, null);
        setDirty();
      }
    } else if (view.currentTool === "toggle-flags") {
      const edge = hitTestEdge(imgPt);
      if (!edge) return;
      if (!edge.flags) {
        edge.flags = {
          accessible: true,
          stairs: false,
          covered: false,
          blocked: false
        };
      }
      // Simple cycle: normal -> blocked -> normal
      edge.flags.blocked = !edge.flags.blocked;
      if (edge.flags.blocked) {
        if (!state.overrides.blockedEdgeIds.includes(edge.id)) {
          state.overrides.blockedEdgeIds.push(edge.id);
        }
      } else {
        state.overrides.blockedEdgeIds = state.overrides.blockedEdgeIds.filter(
          (id) => id !== edge.id
        );
      }
      updateLists();
      setSelection("edge", edge.id);
      setDirty();
    } else if (view.currentTool === "building-assign") {
      const node = hitTestNode(imgPt);
      if (!node) return;
      setSelection("node", node.id);
      // Building assignment is handled via inspector;
      // tool mainly just makes it easy to click nodes and then type.
    } else if (view.currentTool === "calibration") {
      // Handled from calibration tool button instead
    }
  }

  function onCanvasMouseMove(e) {
    const rect = view.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const imgPt = screenToImage(e.clientX, e.clientY);
    document.getElementById("status-coords").textContent =
      "Coords: " + Math.round(imgPt.x) + ", " + Math.round(imgPt.y);

    if (view.isPanning) {
      const dx = sx - view.lastPanX;
      const dy = sy - view.lastPanY;
      view.offsetX += dx;
      view.offsetY += dy;
      view.lastPanX = sx;
      view.lastPanY = sy;
      setDirty();
      return;
    }

    // Hover for tooltip
    const node = hitTestNode(imgPt);
    const edge = node ? null : hitTestEdge(imgPt);
    view.hover.type = null;
    view.hover.id = null;
    const tooltip = document.getElementById("hover-tooltip");
    if (node) {
      view.hover.type = "node";
      view.hover.id = node.id;
      tooltip.classList.remove("hidden");
      tooltip.textContent = node.id + (node.name ? " — " + node.name : "");
      const sp = imageToScreen(node.x, node.y);
      tooltip.style.left = sp.x + 8 + "px";
      tooltip.style.top = sp.y + 8 + "px";
    } else if (edge) {
      view.hover.type = "edge";
      view.hover.id = edge.id;
      tooltip.classList.remove("hidden");
      tooltip.textContent =
        edge.id +
        " (" +
        formatNumber(edge.length_m || 0, 1) +
        " m)";
      tooltip.style.left = e.clientX - rect.left + 8 + "px";
      tooltip.style.top = e.clientY - rect.top + 8 + "px";
    } else {
      tooltip.classList.add("hidden");
    }
  }

  function onCanvasMouseUp() {
    view.isPanning = false;
  }

  function onCanvasWheel(e) {
    e.preventDefault();
    if (!state.image.img) return;

    const delta = e.deltaY;
    const zoomFactor = delta > 0 ? 0.9 : 1.1;

    const rect = view.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const prevZoom = view.zoom;
    let newZoom = view.zoom * zoomFactor;
    newZoom = clamp(newZoom, view.minZoom, view.maxZoom);
    const k = newZoom / prevZoom;
    view.zoom = newZoom;

    // adjust offset so zoom is centered at mouse
    view.offsetX = mouseX - (mouseX - view.offsetX) * k;
    view.offsetY = mouseY - (mouseY - view.offsetY) * k;

    document.getElementById("status-zoom").textContent =
      "Zoom: " + Math.round(view.zoom * 100) + "%";

    setDirty();
  }

  // ---------- Calibration ----------

  function startCalibration() {
    view.currentTool = "select"; // temporarily override tool flow via clicks
    view.calibrationPoints = [];
    document.getElementById("top-bar-status").textContent =
      "Calibration: click first point on map.";
    const handler = (e) => {
      const imgPt = screenToImage(e.clientX, e.clientY);
      view.calibrationPoints.push(imgPt);
      if (view.calibrationPoints.length === 1) {
        document.getElementById("top-bar-status").textContent =
          "Calibration: click second point on map.";
      } else if (view.calibrationPoints.length === 2) {
        view.canvas.removeEventListener("mousedown", handler, true);
        finishCalibration();
      }
    };
    view.canvas.addEventListener("mousedown", handler, true);
  }

  function finishCalibration() {
    if (view.calibrationPoints.length !== 2) return;
    const [a, b] = view.calibrationPoints;
    const lenPx = distance(a, b);
    const metersStr = window.prompt(
      "Calibration: distance between points in meters?",
      "10"
    );
    if (!metersStr) {
      document.getElementById("top-bar-status").textContent =
        "Calibration cancelled.";
      view.calibrationPoints = [];
      return;
    }
    const meters = parseFloat(metersStr);
    if (!Number.isFinite(meters) || meters <= 0) {
      window.alert("Invalid distance.");
      document.getElementById("top-bar-status").textContent =
        "Calibration failed (invalid distance).";
      view.calibrationPoints = [];
      return;
    }
    const ppm = lenPx / meters;
    state.settings.px_per_meter = ppm;
    recomputeEdgeLengths();
    updateSettingsInputs();
    updateInspector();
    updateLists();
    setDirty();
    document.getElementById("top-bar-status").textContent =
      "Calibration set: " + ppm.toFixed(3) + " px/m.";
    view.calibrationPoints = [];
  }

  // ---------- Settings inputs ----------

  function updateSettingsInputs() {
    document.getElementById("input-px-per-meter").value =
      state.settings.px_per_meter;
    document.getElementById("input-walking-speed").value =
      state.settings.walking_speed_mps;
    document.getElementById("input-penalty-stairs").value =
      state.settings.penalties.stairs_s;
    document.getElementById("input-penalty-steep").value =
      state.settings.penalties.steep_s;
    document.getElementById("input-penalty-covered").value =
      state.settings.penalties.covered_s;
  }

  function attachSettingsHandlers() {
    document
      .getElementById("input-px-per-meter")
      .addEventListener("change", (e) => {
        const v = parseFloat(e.target.value);
        if (!Number.isFinite(v) || v <= 0) return;
        state.settings.px_per_meter = v;
        recomputeEdgeLengths();
        updateInspector();
        updateLists();
        setDirty();
      });

    document
      .getElementById("input-walking-speed")
      .addEventListener("change", (e) => {
        const v = parseFloat(e.target.value);
        if (!Number.isFinite(v) || v <= 0) return;
        state.settings.walking_speed_mps = v;
      });

    document
      .getElementById("input-penalty-stairs")
      .addEventListener("change", (e) => {
        state.settings.penalties.stairs_s = parseFloat(e.target.value) || 0;
      });
    document
      .getElementById("input-penalty-steep")
      .addEventListener("change", (e) => {
        state.settings.penalties.steep_s = parseFloat(e.target.value) || 0;
      });
    document
      .getElementById("input-penalty-covered")
      .addEventListener("change", (e) => {
        state.settings.penalties.covered_s = parseFloat(e.target.value) || 0;
      });
  }

  // ---------- Inspector input handlers ----------

  function attachInspectorHandlers() {
    document
      .getElementById("node-name")
      .addEventListener("input", (e) => {
        const node = getNodeById(view.selected.id);
        if (!node) return;
        node.name = e.target.value;
        updateLists();
        setDirty();
      });

    document
      .getElementById("node-type")
      .addEventListener("change", (e) => {
        const node = getNodeById(view.selected.id);
        if (!node) return;
        node.type = e.target.value;
        rebuildBuildingEntranceListsFromNodes();
        updateLists();
        setDirty();
      });

    document
      .getElementById("node-building-id")
      .addEventListener("change", (e) => {
        const node = getNodeById(view.selected.id);
        if (!node) return;
        const oldId = node.buildingId;
        const newId = e.target.value.trim() || null;
        node.buildingId = newId;
        rebuildBuildingEntranceListsFromNodes();
        if (oldId || newId) {
          // ensure buildings exist
          if (newId) ensureBuildingExists(newId, null);
        }
        updateLists();
        setDirty();
      });

    document
      .getElementById("node-entrance")
      .addEventListener("change", (e) => {
        const node = getNodeById(view.selected.id);
        if (!node) return;
        node.entrance = e.target.checked;
        rebuildBuildingEntranceListsFromNodes();
        updateLists();
        setDirty();
      });

    // Edge flags
    document
      .getElementById("edge-flag-accessible")
      .addEventListener("change", (e) => {
        const edge = getEdgeById(view.selected.id);
        if (!edge) return;
        if (!edge.flags) {
          edge.flags = {
            accessible: true,
            stairs: false,
            covered: false,
            blocked: false
          };
        }
        edge.flags.accessible = e.target.checked;
        updateLists();
        setDirty();
      });

    document
      .getElementById("edge-flag-stairs")
      .addEventListener("change", (e) => {
        const edge = getEdgeById(view.selected.id);
        if (!edge) return;
        if (!edge.flags) {
          edge.flags = {
            accessible: true,
            stairs: false,
            covered: false,
            blocked: false
          };
        }
        edge.flags.stairs = e.target.checked;
        updateLists();
        setDirty();
      });

    document
      .getElementById("edge-flag-covered")
      .addEventListener("change", (e) => {
        const edge = getEdgeById(view.selected.id);
        if (!edge) return;
        if (!edge.flags) {
          edge.flags = {
            accessible: true,
            stairs: false,
            covered: false,
            blocked: false
          };
        }
        edge.flags.covered = e.target.checked;
        updateLists();
        setDirty();
      });

    document
      .getElementById("edge-flag-blocked")
      .addEventListener("change", (e) => {
        const edge = getEdgeById(view.selected.id);
        if (!edge) return;
        if (!edge.flags) {
          edge.flags = {
            accessible: true,
            stairs: false,
            covered: false,
            blocked: false
          };
        }
        edge.flags.blocked = e.target.checked;
        if (edge.flags.blocked) {
          if (!state.overrides.blockedEdgeIds.includes(edge.id)) {
            state.overrides.blockedEdgeIds.push(edge.id);
          }
        } else {
          state.overrides.blockedEdgeIds = state.overrides.blockedEdgeIds.filter(
            (id) => id !== edge.id
          );
        }
        updateLists();
        setDirty();
      });

    document
      .getElementById("edge-penalty")
      .addEventListener("change", (e) => {
        const edge = getEdgeById(view.selected.id);
        if (!edge) return;
        edge.penalty_s = parseFloat(e.target.value) || 0;
        setDirty();
      });

    document.getElementById("building-list").addEventListener("click", (e) => {
        const item = e.target.closest(".building-item");
        if (!item) return;
        view.selectedBuildingId = item.dataset.id;
        updateLists(); // this will also call updateBuildingEditInspector
      });

    document
      .getElementById("btn-update-building")
      .addEventListener("click", () => {
        if (!view.selectedBuildingId) return;

        const oldId = view.selectedBuildingId;
        const b = state.buildings.find((bb) => bb.id === oldId);
        if (!b) return;

        const newName = document.getElementById("building-edit-name").value.trim();
        const newId = document.getElementById("building-edit-id").value.trim();

        if (!newId) {
          window.alert("Building ID cannot be empty.");
          return;
        }

        if (newId !== oldId && state.buildings.some((bb) => bb.id === newId)) {
          window.alert("Another building already has that ID.");
          return;
        }

        // Update nodes' buildingId if ID changed
        if (newId !== oldId) {
          for (const n of state.nodes) {
            if (n.buildingId === oldId) {
              n.buildingId = newId;
            }
          }
          b.id = newId;
          view.selectedBuildingId = newId;
        }

        b.name = newName || newId;

        rebuildBuildingEntranceListsFromNodes();
        updateLists();
        setDirty();
      });

    document
      .getElementById("btn-delete-building")
      .addEventListener("click", () => {
        if (!view.selectedBuildingId) return;

        const id = view.selectedBuildingId;
        const b = state.buildings.find((bb) => bb.id === id);
        if (!b) return;

        const nodeCount = state.nodes.filter((n) => n.buildingId === id).length;
        const ok = window.confirm(
          "Delete building " +
            id +
            "?\nThis will clear the buildingId on " +
            nodeCount +
            " node(s), but nodes/edges will remain."
        );
        if (!ok) return;

        // Clear buildingId on nodes
        for (const n of state.nodes) {
          if (n.buildingId === id) {
            n.buildingId = null;
          }
        }

        // Remove building
        state.buildings = state.buildings.filter((bb) => bb.id !== id);
        view.selectedBuildingId = null;

        rebuildBuildingEntranceListsFromNodes();
        updateLists();
        setDirty();
      });


    // Lists selection
    document.getElementById("node-list").addEventListener("click", (e) => {
      const item = e.target.closest(".list-item");
      if (!item) return;
      const id = item.dataset.id;
      setSelection("node", id);
    });

    document.getElementById("edge-list").addEventListener("click", (e) => {
      const item = e.target.closest(".list-item");
      if (!item) return;
      const id = item.dataset.id;
      setSelection("edge", id);
    });

    document
      .getElementById("filter-nodes")
      .addEventListener("input", updateLists);
    document
      .getElementById("filter-edges")
      .addEventListener("input", updateLists);

    // Building add
    document
      .getElementById("btn-add-building")
      .addEventListener("click", () => {
        const idInput = document.getElementById("building-new-id");
        const nameInput = document.getElementById("building-new-name");
        const id = idInput.value.trim();
        if (!id) {
          window.alert("Enter a building ID.");
          return;
        }
        const name = nameInput.value.trim() || id;
        if (state.buildings.some((b) => b.id === id)) {
          window.alert("Building with that ID already exists.");
          return;
        }
        state.buildings.push({
          id,
          name,
          entranceNodeIds: [],
          courses: []
        });
        idInput.value = "";
        nameInput.value = "";
        rebuildBuildingEntranceListsFromNodes();
        updateLists();
        setDirty();
      });
  }

  // ---------- Image load ----------

  function attachImageLoad() {
    const btn = document.getElementById("btn-load-image");
    const input = document.getElementById("input-image");
    btn.addEventListener("click", () => input.click());
    input.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        state.image.img = img;
        state.image.filename = file.name;
        state.image.width_px = img.naturalWidth;
        state.image.height_px = img.naturalHeight;
        state.meta.created = new Date().toISOString();
        document.getElementById("top-bar-status").textContent =
          "Loaded image: " +
          file.name +
          " (" +
          img.naturalWidth +
          "×" +
          img.naturalHeight +
          ")";
        // Fit image
        const container = document.getElementById("canvas-container");
        const rect = container.getBoundingClientRect();
        const sx = rect.width / img.naturalWidth;
        const sy = rect.height / img.naturalHeight;
        view.zoom = Math.min(sx, sy, 1);
        view.offsetX = (rect.width - img.naturalWidth * view.zoom) / 2;
        view.offsetY = (rect.height - img.naturalHeight * view.zoom) / 2;
        document.getElementById("status-zoom").textContent =
          "Zoom: " + Math.round(view.zoom * 100) + "%";
        setDirty();
      };
      img.onerror = () => {
        window.alert("Failed to load image.");
      };
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- JSON Import / Export ----------

  function attachJsonHandlers() {
    const btnImport = document.getElementById("btn-import-json");
    const inputJson = document.getElementById("input-json");
    const btnExport = document.getElementById("btn-export-json");

    btnImport.addEventListener("click", () => inputJson.click());

    inputJson.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          importJsonData(data);
        } catch (err) {
          console.error(err);
          window.alert("Invalid JSON file.");
        }
      };
      reader.readAsText(file);
    });

    btnExport.addEventListener("click", () => {
      exportJsonData();
    });
  }

  function importJsonData(data) {
    if (data.version !== state.version) {
      const ok = window.confirm(
        "JSON version is " +
          data.version +
          " but annotator expects " +
          state.version +
          ". Import anyway?"
      );
      if (!ok) return;
    }

    if (data.image) {
      if (
        state.image.width_px &&
        state.image.height_px &&
        (state.image.width_px !== data.image.width_px ||
          state.image.height_px !== data.image.height_px)
      ) {
        const ok = window.confirm(
          "JSON image dimensions differ from loaded image. Continue? Coordinates may be off."
        );
        if (!ok) return;
      }
      state.image.filename = data.image.filename || state.image.filename;
      state.image.width_px = data.image.width_px || state.image.width_px;
      state.image.height_px = data.image.height_px || state.image.height_px;
    }

    if (data.settings) {
      state.settings.px_per_meter = data.settings.px_per_meter || 1;
      state.settings.walking_speed_mps = data.settings.walking_speed_mps || 1.4;
      state.settings.penalties = data.settings.penalties || {
        stairs_s: 20,
        steep_s: 15,
        covered_s: -5
      };
    }

    state.nodes = Array.isArray(data.nodes) ? data.nodes.slice() : [];
    state.edges = Array.isArray(data.edges) ? data.edges.slice() : [];
    state.buildings = Array.isArray(data.buildings)
      ? data.buildings.slice()
      : [];
    state.overrides = data.overrides || { blockedEdgeIds: [] };
    state.meta = data.meta || {
      created: new Date().toISOString(),
      editedBy: "annotator-v1"
    };

    // Recompute lengths based on current px_per_meter
    recomputeEdgeLengths();

    // Rebuild building entrance lists from nodes to ensure consistency
    rebuildBuildingEntranceListsFromNodes();

    // Reset ID counters
    let maxN = 0;
    for (const n of state.nodes) {
      const m = /^n(\d+)$/.exec(n.id);
      if (m) {
        const val = parseInt(m[1], 10);
        if (val > maxN) maxN = val;
      }
    }
    view.nextNodeIndex = maxN + 1;

    let maxE = 0;
    for (const eg of state.edges) {
      const m = /^e(\d+)$/.exec(eg.id);
      if (m) {
        const val = parseInt(m[1], 10);
        if (val > maxE) maxE = val;
      }
    }
    view.nextEdgeIndex = maxE + 1;

    updateSettingsInputs();
    updateLists();
    setSelection(null, null);
    setDirty();

    document.getElementById("top-bar-status").textContent =
      "Imported JSON: nodes=" +
      state.nodes.length +
      ", edges=" +
      state.edges.length;
  }

  function validateGraphForExport() {
    const errors = [];
    const warnings = [];

    const nodeIds = new Set();
    for (const n of state.nodes) {
      if (nodeIds.has(n.id)) {
        errors.push("Duplicate node id: " + n.id);
      } else {
        nodeIds.add(n.id);
      }
    }

    const edgeIds = new Set();
    for (const e of state.edges) {
      if (edgeIds.has(e.id)) {
        errors.push("Duplicate edge id: " + e.id);
      } else {
        edgeIds.add(e.id);
      }
      if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) {
        errors.push(
          "Edge " + e.id + " references missing node(s): " + e.from + ", " + e.to
        );
      }
      if (e.length_px !== undefined && e.length_px < 5) {
        warnings.push("Edge " + e.id + " is very short (" + e.length_px + " px).");
      }
    }

    // degree-0 nodes that are not entrances
    const degree = {};
    for (const e of state.edges) {
      degree[e.from] = (degree[e.from] || 0) + 1;
      degree[e.to] = (degree[e.to] || 0) + 1;
    }
    for (const n of state.nodes) {
      const deg = degree[n.id] || 0;
      const isEntrance = n.entrance || n.type === "entrance";
      if (deg === 0 && !isEntrance) {
        warnings.push("Orphan node (no edges): " + n.id);
      }
    }

    return { errors, warnings };
  }

  function exportJsonData() {
    const { errors, warnings } = validateGraphForExport();
    if (errors.length) {
      window.alert("Cannot export due to errors:\n\n" + errors.join("\n"));
      return;
    }
    if (warnings.length) {
      const ok = window.confirm(
        "Warnings:\n\n" + warnings.join("\n") + "\n\nExport anyway?"
      );
      if (!ok) return;
    }

    // Rebuild building entrances from nodes to keep consistent
    rebuildBuildingEntranceListsFromNodes();

    const data = {
      version: state.version,
      image: {
        filename: state.image.filename || "",
        width_px: state.image.width_px || 0,
        height_px: state.image.height_px || 0
      },
      settings: {
        px_per_meter: state.settings.px_per_meter,
        walking_speed_mps: state.settings.walking_speed_mps,
        penalties: state.settings.penalties
      },
      nodes: state.nodes,
      edges: state.edges,
      buildings: state.buildings,
      overrides: {
        blockedEdgeIds: state.overrides.blockedEdgeIds.slice()
      },
      meta: {
        created: state.meta.created || new Date().toISOString(),
        editedBy: "annotator-v1"
      }
    };

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const filename = "campus-graph-" + y + m + d + ".json";

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    document.getElementById("top-bar-status").textContent =
      "Exported " + filename;
  }

  // ---------- Clear ----------

  function clearGraph() {
    const ok = window.confirm(
      "Clear all nodes, edges, buildings? Image will remain loaded."
    );
    if (!ok) return;
    state.nodes = [];
    state.edges = [];
    state.buildings = [];
    state.overrides = { blockedEdgeIds: [] };
    view.nextNodeIndex = 1;
    view.nextEdgeIndex = 1;
    setSelection(null, null);
    updateLists();
    setDirty();
  }

  // ---------- Keyboard ----------

  function attachKeyboardHandlers() {
    window.addEventListener("keydown", (e) => {
      const tag = e.target.tagName;
      const isTyping =
        tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable;
      if (isTyping && e.key !== " " && !(e.metaKey || e.ctrlKey)) {
        return;
      }

      if (e.key === " " && !isTyping) {
        view.spacePanning = true;
        e.preventDefault();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        exportJsonData();
        return;
      }

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        view.selected.type &&
        !isTyping
      ) {
        if (view.selected.type === "node") {
          const node = getNodeById(view.selected.id);
          if (!node) return;
          const hasEdges = state.edges.some(
            (e2) => e2.from === node.id || e2.to === node.id
          );
          if (hasEdges) {
            const ok = window.confirm(
              "Delete node " + node.id + " and all connected edges?"
            );
            if (!ok) return;
          }
          state.edges = state.edges.filter(
            (e2) => e2.from !== node.id && e2.to !== node.id
          );
          state.nodes = state.nodes.filter((n) => n.id !== node.id);
          rebuildBuildingEntranceListsFromNodes();
          updateLists();
          setSelection(null, null);
          setDirty();
        } else if (view.selected.type === "edge") {
          const edge = getEdgeById(view.selected.id);
          if (!edge) return;
          const ok = window.confirm("Delete edge " + edge.id + "?");
          if (!ok) return;
          state.edges = state.edges.filter((e2) => e2.id !== edge.id);
          updateLists();
          setSelection(null, null);
          setDirty();
        }
      }

      if (isTyping) return;

      if (e.key === "v" || e.key === "V") {
        setTool("select");
      } else if (e.key === "n" || e.key === "N") {
        setTool("add-node");
      } else if (e.key === "e" || e.key === "E") {
        setTool("add-edge");
      } else if (e.key === "t" || e.key === "T") {
        setTool("toggle-flags");
      } else if (e.key === "b" || e.key === "B") {
        setTool("building-assign");
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.key === " ") {
        view.spacePanning = false;
      }
    });
  }

  // ---------- Help ----------

  function attachHelp() {
    document.getElementById("btn-help").addEventListener("click", () => {
      window.alert(
        [
          "Campus Graph Annotator",
          "",
          "Mouse:",
          "- Mouse wheel: zoom in/out (around cursor)",
          "- Drag background or hold Space: pan",
          "- Click nodes/edges: select",
          "",
          "Tools:",
          "- V: Pan / Select",
          "- N: Add Node",
          "- E: Add Edge (click node A, then node B)",
          "- T: Toggle blocked flag on clicked edge",
          "- B: Building assign (click node then edit in inspector)",
          "- Delete/Backspace: delete selected node/edge",
          "",
          "Other:",
          "- Ctrl/Cmd+S: export JSON",
          "- Calibration button: click two points, enter meters to set px/m"
        ].join("\n")
      );
    });
  }

  // ---------- Init ----------

  function init() {
    view.canvas = document.getElementById("map-canvas");
    view.ctx = view.canvas.getContext("2d", { alpha: true });

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    view.canvas.addEventListener("mousedown", onCanvasMouseDown);
    window.addEventListener("mousemove", onCanvasMouseMove);
    window.addEventListener("mouseup", onCanvasMouseUp);
    view.canvas.addEventListener("wheel", onCanvasWheel, { passive: false });

    attachSettingsHandlers();
    attachInspectorHandlers();
    attachImageLoad();
    attachJsonHandlers();
    attachKeyboardHandlers();
    attachHelp();

    document
      .getElementById("btn-clear")
      .addEventListener("click", clearGraph);

    document
      .getElementById("btn-calibration-tool")
      .addEventListener("click", startCalibration);

    // tool buttons
    document.querySelectorAll(".tool-button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tool = btn.getAttribute("data-tool");
        if (tool === "building-assign") {
          setTool("building-assign");
        } else if (tool === "toggle-flags") {
          setTool("toggle-flags");
        } else if (tool === "add-edge") {
          setTool("add-edge");
        } else if (tool === "add-node") {
          setTool("add-node");
        } else if (tool === "delete") {
          setTool("delete");
        } else {
          setTool("select");
        }
      });
    });

    updateSettingsInputs();
    updateLists();
    setTool("select");
    drawLoop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
