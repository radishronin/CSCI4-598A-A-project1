"""Blueprint for the planner route."""
from flask import Blueprint, render_template

planner_bp = Blueprint("planner", __name__, url_prefix = "/planner")

@planner_bp.route("/")
def planner():
    """Render the planner template."""
    return render_template("planner.html")
