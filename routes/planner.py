"""Blueprint and logic for the campus path planner."""
from __future__ import annotations

import heapq
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from flask import (
    Blueprint,
    jsonify,
    render_template,
    request,
    send_from_directory,
    url_for,
)

planner_bp = Blueprint("planner", __name__, url_prefix="/planner")

_RESOURCE_DIR = Path(__file__).resolve().parent.parent / "resources"
_GRAPH_PATH = _RESOURCE_DIR / "campus-graph-20251127-initial-edges.json"

_graph_cache: Optional[dict] = None
_adjacency_cache: Optional[Dict[str, List[Tuple[str, float]]]] = None
_nodes_by_id: Optional[Dict[str, dict]] = None
_buildings_by_id: Optional[Dict[str, dict]] = None


def _load_graph() -> dict:
    """Load and cache the campus graph definition."""
    global _graph_cache, _nodes_by_id, _buildings_by_id
    if _graph_cache is None:
        with _GRAPH_PATH.open("r", encoding="utf-8") as graph_file:
            _graph_cache = json.load(graph_file)
        _nodes_by_id = {node["id"]: node for node in _graph_cache.get("nodes", [])}
        _buildings_by_id = {bldg["id"]: bldg for bldg in _graph_cache.get("buildings", [])}
    return _graph_cache


def _edge_travel_time(edge: dict, settings: dict, blocked_edge_ids: set) -> Optional[float]:
    """Return the travel time for an edge or ``None`` if blocked."""
    flags = edge.get("flags", {})
    if flags.get("blocked"):
        return None
    if edge.get("id") in blocked_edge_ids:
        return None

    base_time_s = edge["length_m"] / settings["walking_speed_mps"]
    penalty = edge.get("penalty_s", 0)

    penalties = settings.get("penalties", {})
    if flags.get("stairs"):
        penalty += penalties.get("stairs_s", 0)
    if flags.get("steep"):
        penalty += penalties.get("steep_s", 0)
    if flags.get("covered"):
        penalty += penalties.get("covered_s", 0)

    return base_time_s + penalty


def _build_adjacency(graph: dict) -> Dict[str, List[Tuple[str, float]]]:
    """Construct an adjacency list keyed by node id."""
    settings = graph.get("settings", {})
    blocked_edge_ids = set(graph.get("overrides", {}).get("blockedEdgeIds", []))

    adjacency: Dict[str, List[Tuple[str, float]]] = {node["id"]: [] for node in graph.get("nodes", [])}

    for edge in graph.get("edges", []):
        travel_time = _edge_travel_time(edge, settings, blocked_edge_ids)
        if travel_time is None:
            continue
        from_node = edge.get("from")
        to_node = edge.get("to")
        if from_node not in adjacency or to_node not in adjacency:
            continue
        adjacency[from_node].append((to_node, travel_time))
        adjacency[to_node].append((from_node, travel_time))

    return adjacency


def _get_adjacency() -> Dict[str, List[Tuple[str, float]]]:
    """Return a cached adjacency list for the graph."""
    global _adjacency_cache
    if _adjacency_cache is None:
        graph = _load_graph()
        _adjacency_cache = _build_adjacency(graph)
    return _adjacency_cache


def _dijkstra(
    start: str, goal: str, adjacency: Dict[str, List[Tuple[str, float]]]
) -> Tuple[Optional[float], List[str]]:
    """Compute the shortest path using Dijkstra's algorithm."""
    queue: List[Tuple[float, str]] = [(0.0, start)]
    distances: Dict[str, float] = {start: 0.0}
    previous: Dict[str, Optional[str]] = {start: None}

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

    if goal not in previous:
        return None, []

    path: List[str] = []
    node: Optional[str] = goal
    while node is not None:
        path.append(node)
        node = previous.get(node)
    path.reverse()

    return distances.get(goal), path


def _shortest_path_between_buildings(
    building_start: str, building_end: str, adjacency: Dict[str, List[Tuple[str, float]]]
) -> Tuple[Optional[float], List[str]]:
    """Evaluate all entrance pairs to find the fastest building-to-building path."""
    building_a = _buildings_by_id.get(building_start, {}) if _buildings_by_id else {}
    building_b = _buildings_by_id.get(building_end, {}) if _buildings_by_id else {}

    best_time: Optional[float] = None
    best_path: List[str] = []

    for start_node in building_a.get("entranceNodeIds", []):
        for end_node in building_b.get("entranceNodeIds", []):
            time_s, path = _dijkstra(start_node, end_node, adjacency)
            if time_s is None or not path:
                continue
            if best_time is None or time_s < best_time:
                best_time = time_s
                best_path = path

    return best_time, best_path


@planner_bp.route("/")
def planner():
    """Render the planner template with building metadata."""
    graph = _load_graph()
    buildings = graph.get("buildings", [])
    image = graph.get("image", {})

    return render_template(
        "planner.html",
        buildings=[{"id": b.get("id"), "name": b.get("name")} for b in buildings],
        image={"width_px": image.get("width_px"), "height_px": image.get("height_px")},
    )


@planner_bp.route("/route", methods=["POST"])
def compute_route():
    """Compute the campus walking route for the given buildings."""
    graph = _load_graph()
    adjacency = _get_adjacency()

    data = request.get_json(force=True, silent=True) or {}
    building_codes: List[str] = data.get("buildings", [])
    # Optional language features
    target_language: str = data.get("target_language", "") or ""
    response_mode: str = data.get("response_mode", "direct")

    def _localized_strings(lang: str) -> dict:
        """Return a small set of localized UI strings for the planner.

        This is intentionally minimal: it covers the total-time label and
        a few common error messages. If you want richer translations we can
        either extend this map or call the project's LLM translation helper.
        """
        # Basic translations for a few languages. Keys: total_time_label,
        # minutes_unit, total_time_format (optional), error messages.
        translations = {
            "": {
                "total_time_label": "Total time:",
                "minutes_unit": "min",
                "error_invalid": "Request must include a list of building codes.",
                "error_unknown_codes": "Unknown building codes:",
                "error_no_path": "No available path between {from_code} and {to_code}.",
            },
            "en": {
                "total_time_label": "Total time:",
                "minutes_unit": "min",
                "error_invalid": "Request must include a list of building codes.",
                "error_unknown_codes": "Unknown building codes:",
                "error_no_path": "No available path between {from_code} and {to_code}.",
            },
            "es": {
                "total_time_label": "Tiempo total:",
                "minutes_unit": "min",
                "error_invalid": "La solicitud debe incluir una lista de códigos de edificio.",
                "error_unknown_codes": "Códigos de edificio desconocidos:",
                "error_no_path": "No hay un camino disponible entre {from_code} y {to_code}.",
            },
            "fr": {
                "total_time_label": "Durée totale:",
                "minutes_unit": "min",
                "error_invalid": "La requête doit inclure une liste de codes de bâtiments.",
                "error_unknown_codes": "Codes de bâtiment inconnus:",
                "error_no_path": "Aucun itinéraire disponible entre {from_code} et {to_code}.",
            },
            "de": {
                "total_time_label": "Gesamtzeit:",
                "minutes_unit": "Min",
                "error_invalid": "Die Anfrage muss eine Liste von Gebäudecodes enthalten.",
                "error_unknown_codes": "Unbekannte Gebäudecodes:",
                "error_no_path": "Kein verfügbarer Weg zwischen {from_code} und {to_code}.",
            },
            "zh": {
                "total_time_label": "总用时:",
                "minutes_unit": "分",
                "error_invalid": "请求必须包含建筑代码列表。",
                "error_unknown_codes": "未知的建筑代码:",
                "error_no_path": "在 {from_code} 和 {to_code} 之间没有可用路径。",
            }
        }
        return translations.get(lang, translations.get(lang.split('-')[0], translations[""]))

    if not isinstance(building_codes, list) or not building_codes:
        localized = _localized_strings(target_language)
        return (
            jsonify({"error": localized.get("error_invalid"), "localized": localized}),
            400,
        )

    invalid_codes = [code for code in building_codes if code not in (_buildings_by_id or {})]
    if invalid_codes:
        localized = _localized_strings(target_language)
        return (
            jsonify({
                "error": f"Unknown building codes: {', '.join(invalid_codes)}",
                "localized": {"error_message": f"{localized.get('error_unknown_codes')} {', '.join(invalid_codes)}"},
            }),
            400,
        )

    if len(building_codes) < 2:
        return jsonify({"error": "Provide at least two building codes to plan a route."}), 400

    legs = []
    total_time_s = 0.0
    combined_path: List[str] = []

    for start_code, end_code in zip(building_codes, building_codes[1:]):
        leg_time, node_path = _shortest_path_between_buildings(start_code, end_code, adjacency)
        if leg_time is None or not node_path:
            localized = _localized_strings(target_language)
            return (
                jsonify({
                    "error": f"No available path between {start_code} and {end_code}.",
                    "localized": {"error_message": localized.get("error_no_path").format(from_code=start_code, to_code=end_code)},
                }),
                400,
            )

        total_time_s += leg_time

        if combined_path and node_path and combined_path[-1] == node_path[0]:
            combined_path.extend(node_path[1:])
        else:
            combined_path.extend(node_path)

        polyline = [
            {"x": _nodes_by_id[node_id]["x"], "y": _nodes_by_id[node_id]["y"]}
            for node_id in node_path
            if node_id in (_nodes_by_id or {})
        ]

        if polyline:
            avg_x = sum(point["x"] for point in polyline) / len(polyline)
            avg_y = sum(point["y"] for point in polyline) / len(polyline)
        else:
            avg_x = avg_y = 0

        legs.append(
            {
                "from_building": start_code,
                "to_building": end_code,
                "time_s": leg_time,
                "polyline": polyline,
                "label_position": {"x": avg_x, "y": avg_y},
            }
        )

    image = graph.get("image", {})

    localized = _localized_strings(target_language)

    response_payload = {
        "image": {
            "width_px": image.get("width_px"),
            "height_px": image.get("height_px"),
            "url": url_for("planner.campus_map"),
        },
        "legs": legs,
        "total_time_s": total_time_s,
        "localized": {},
    }

    # If the client requested 'both', include original (English) and localized
    # messages. Otherwise provide only localized strings to be used by the UI.
    if response_mode == "both":
        response_payload["localized"]["original"] = {
            "total_time_label": "Total time:",
            "minutes_unit": "min",
            "total_time_format": "{minutes} min",
        }

    # Add the selected language strings (these may be identical to original)
    response_payload["localized"].update({
        "total_time_label": localized.get("total_time_label"),
        "minutes_unit": localized.get("minutes_unit"),
        # Provide a simple formatting token the client can use if desired
        "total_time_format": "{minutes} " + localized.get("minutes_unit", "min"),
    })

    return jsonify(response_payload)


@planner_bp.route("/campus-map")
def campus_map():
    """Serve the campus map image used by the planner."""
    return send_from_directory(_RESOURCE_DIR, "campus-map.png")


@planner_bp.route("/annotator")
def annotator():
    """Render the annotator template."""
    return render_template("annotator.html")
