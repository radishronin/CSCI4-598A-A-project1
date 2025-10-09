""" A Flask application for LLM interaction. """
import os
from flask import Flask, request, jsonify, render_template, Response, stream_with_context
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import create_react_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

app = Flask(__name__)

''' Constants '''
GEMINI_MODEL = "gemini-2.0-flash"
OPENAI_MODEL = "gpt-4o-mini"

def get_environment_api_key(llm_choice: str) -> str:
    """Get the API key for the selected LLM from ./api_keys/{llm_choice}"""
    key_dir = os.path.join(".", "api_keys")
    key_path = os.path.join(key_dir, llm_choice)
    if not os.path.exists(key_path):
        return ""
    try:
        with open(key_path, "r", encoding="utf-8") as f:
            value = f.read().strip()
            return value if value else ""
    except OSError:
        return ""

def set_environment_api_key(llm_choice: str, api_key: str):
    """Persist the API key for the selected LLM into ./api_keys/{llm_choice}"""
    key_dir = os.path.join(".", "api_keys")
    os.makedirs(key_dir, exist_ok=True)
    key_path = os.path.join(key_dir, llm_choice)
    # Overwrite any existing value with the new key
    with open(key_path, "w", encoding="utf-8") as f:
        f.write(api_key.strip())

@app.route("/")
def index():
    """ Render the index.html template """
    return render_template("index.html")

def _message_to_text(msg) -> str:
    """Extract plain text from message content which can be a str or list of parts."""
    try:
        content = getattr(msg, "content", msg)
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            # Concatenate text-like parts
            parts = []
            for p in content:
                # parts may be dicts or objects with 'type'/'text' fields
                if isinstance(p, dict):
                    t = p.get("text") or p.get("content") or ""
                    if isinstance(t, str):
                        parts.append(t)
                else:
                    t = getattr(p, "text", None)
                    if isinstance(t, str):
                        parts.append(t)
            return "".join(parts)
        return str(content)
    except Exception:
        return ""

@app.route("/api/prompt", methods=["POST"])
def receive_prompt():
    """ 
    1. Retrieve frontend variables
    2. Create Langchain agent, return response 
    """
    data = request.get_json(silent=True) or {}
    prompt_text = data.get("prompt", "")
    llm_choice = data.get("llm_choice", "")

    if llm_choice == "":
        return jsonify({"ok": False, "error": "SNO: no LLM selected."}), 400

    api_key: str = get_environment_api_key(llm_choice)
    if api_key == "":
        return jsonify({"ok": False, "error": "NO API key set."}), 400

    if llm_choice == "gemini":
        langchain_llm: BaseChatModel = ChatGoogleGenerativeAI(
            model=GEMINI_MODEL,
            google_api_key=api_key
        )
    elif llm_choice == "openai":
        langchain_llm: BaseChatModel = ChatOpenAI(
            model=OPENAI_MODEL,
            api_key=api_key
        )
    else:
        return jsonify({"ok": False, "error": "Invalid LLM selected."}), 400

    langchain_agent: CompiledStateGraph = create_react_agent(
        model=langchain_llm,
        tools=[]
    )

    @stream_with_context
    def generate():
        # Optional: small preamble so client can clear UI
        yield ""

        for step in langchain_agent.stream({"messages": [prompt_text]}, stream_mode="values"):
            msg = step["messages"][-1]

            # Only yield if the message is from the AI (not Human)
            if isinstance(msg, AIMessage):
                text = _message_to_text(msg)
                if text:
                    yield text
        # Optionally end with a newline
        yield "\n"

    return Response(generate(), mimetype="text/plain")

@app.route("/api/set-api-key", methods=["POST"])
def set_api_key():
    """ Set the API key for the selected LLM """
    data = request.get_json(silent=True) or {}
    llm_choice = data.get("llm_choice", "")
    api_key = data.get("api_key", "")
  
    if llm_choice == "":
        return jsonify({"ok": False, "error": "SNO: no LLM choice provided."}), 400
        
    if api_key == "":
        return jsonify({"ok": False, "error": "SNO: no API key provided."}), 400
    
    # Set the environment variable based on LLM choice
    set_environment_api_key(llm_choice, api_key)
    
    return jsonify({"ok": True, "message": f"API key set for {llm_choice}"})


@app.route("/api/upload-files", methods=["POST"])
def upload_files():
    """ Handle file uploads and print file information """
    data = request.get_json(silent=True) or {}
    files = data.get("file_paths", [])
    print(f"[FILE_UPLOAD] Received {len(files)} file(s)")

    # For now, just print out files. Future: add to RAG architecture.
    for i, file_info in enumerate(files, 1):
        print(f"[FILE_UPLOAD] File {i}: {file_info.get('name', 'Unknown')} "
              f"(Size: {file_info.get('size', 0)} bytes, "
              f"Type: {file_info.get('type', 'Unknown')})")
    
    return jsonify({"ok": True, "message": f"Received {len(files)} file(s)"})

if __name__ == "__main__":
    app.run(debug=True)
