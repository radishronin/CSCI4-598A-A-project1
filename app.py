""" A Flask application for LLM interaction. """
from os import environ
from flask import Flask, request, jsonify, render_template
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import create_react_agent
from langchain_core.language_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

app = Flask(__name__)

''' Constants '''
GEMINI_MODEL = "gemini-2.0-flash-exp"
OPENAI_MODEL = "gpt-4o-mini"

""" 
TODO: set API keys to file reads instead of environment variables later. 
The file read will be persistent and less annoying.
"""
def get_environment_api_key(llm_choice: str) -> str:
    """ Get the API key for the selected LLM """
    if llm_choice == "gemini":
        if "GOOGLE_API_KEY" in environ:
            return environ["GOOGLE_API_KEY"]
    if llm_choice == "openai":
        if "OPENAI_API_KEY" in environ:
            return environ["OPENAI_API_KEY"]
    return ""

def set_environment_api_key(llm_choice: str, api_key: str):
    """ Set the API key for the selected LLM """
    if llm_choice == "gemini":
        environ["GOOGLE_API_KEY"] = api_key
    if llm_choice == "openai":
        environ["OPENAI_API_KEY"] = api_key

@app.route("/")
def index():
    """ Render the index.html template """
    return render_template("index.html")


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

    api_key : str = get_environment_api_key(llm_choice)

    if api_key == "":
        return jsonify({"ok": False, "error": "NO API key set."}), 400

    # Make Langchain agent depending on selected LLM.
    if llm_choice == "gemini":
        langchain_llm : BaseChatModel = ChatGoogleGenerativeAI(
            model = GEMINI_MODEL, 
            google_api_key = environ["GEMINI_API_KEY"]
        )
    elif llm_choice == "openai":
        langchain_llm : BaseChatModel = ChatOpenAI(
            model = OPENAI_MODEL,
            api_key = environ["OPENAI_API_KEY"]
        )
    else:
        return jsonify({"ok": False, "error": "Invalid LLM selected."}), 400

    # TODO: Add tools later
    langchain_agent : CompiledStateGraph = create_react_agent(
      model = langchain_llm,
      tools = []
    )
  
    return jsonify({"ok": True})


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
