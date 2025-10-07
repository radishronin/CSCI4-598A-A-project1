from flask import Flask, request, jsonify, render_template

app = Flask(__name__)


@app.route("/")
def index():
  return render_template("index.html")


@app.route("/api/prompt", methods=["POST"])
def receive_prompt():
  data = request.get_json(silent=True) or {}
  prompt_text = data.get("prompt", "")
  print(f"[PROMPT] {prompt_text}")
  return jsonify({"ok": True})


if __name__ == "__main__":
  app.run(debug=True)