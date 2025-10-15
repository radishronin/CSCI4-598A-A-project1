""" A Flask application for LLM interaction. """
import os
from pathlib import Path
import base64
from io import BytesIO
from pypdf import PdfReader
from flask import Flask, request, jsonify, render_template, Response, stream_with_context
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import create_react_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from llama_index.core import Document, VectorStoreIndex
from llama_index.core.langchain_helpers.agents import IndexToolConfig, LlamaIndexTool
from llama_index.core import StorageContext, Settings, load_index_from_storage
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.vector_stores.simple import SimpleVectorStore
from llama_index.embeddings.google_genai import GoogleGenAIEmbedding
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.google_genai import GoogleGenAI

app = Flask(__name__)

''' Constants '''
# Use a stable generally-available model name to avoid metadata lookup issues
GEMINI_MODEL = "gemini-2.0-flash"
OPENAI_MODEL = "gpt-4o-mini"
INDEX_PATH = "./rag_documents"
is_first_llm_run = 1
is_first_embed_run = 1

def initialize_llm(llm_choice : str) -> None:
    """ Initialize LLM in LlamaIndex friendly way. """
    llm = None

    if llm_choice == "gemini":
        api_key = get_environment_api_key(llm_choice)
        if not api_key:
            print("[LLM INIT] Missing Google API key for Gemini.")
            return None

        # Ensure env var for underlying clients
        os.environ["GOOGLE_API_KEY"] = api_key

        try:
            # Use LlamaIndex wrapper
            llm = GoogleGenAI(
                model=GEMINI_MODEL,
                api_key=api_key
            )

        except Exception as e:
            print(f"[LLM INIT] GoogleGenAI constructor failed: {e}")
            return None

        Settings.llm = llm
    
    elif llm_choice == "openai":
        pass
    else:
        pass

def initialize_embedding_model(llm_choice : str):
    """ Initialize embedding model for RAG. """
    embedding_model = None
    
    if llm_choice == "openai":
        embedding_model = OpenAIEmbedding(
            model="text-embedding-3-small",
            api_key=get_environment_api_key(llm_choice)
        )

        Settings.embed_model = embedding_model

    elif llm_choice == "gemini":
        embedding_model = GoogleGenAIEmbedding(
            model_name = "text-embedding-004",
            api_key = get_environment_api_key(llm_choice),
            embedding_config = None,
            vertexai_config = None,
            http_options = None,
            debug_config = None,
            embed_batch_size = 1,
            callback_manager = None,
            retries = 3,
            timeout = 10,
            retry_min_seconds = 1,
            retry_max_seconds = 10,
            retry_exponential_base = 2
        )

        Settings.embed_model = embedding_model

    else:
        pass

def get_vector_index(llm_choice: str):
    """
    Create or load a VectorStoreIndex for the given LLM choice, using a per-LLM
    storage directory and the appropriate embedding model.
    Returns the VectorStoreIndex, or None on failure.
    """
    try:

        index_dir = os.path.join(INDEX_PATH, llm_choice)
        if not Path(index_dir).exists():
            # Fresh index
            vector_store = SimpleVectorStore()
            storage_context = StorageContext.from_defaults(vector_store=vector_store)
            vector_index = VectorStoreIndex(
                nodes=[],
                embed_model=Settings.embed_model,
                use_async=False,
                store_nodes_override=False,
                insert_batch_size=2048,
                storage_context=storage_context,
                callback_manager=None,
                transformations=[]
            )
        else:
            # Load existing index
            storage_context = StorageContext.from_defaults(persist_dir=index_dir)
            vector_index = load_index_from_storage(
                storage_context,
                embed_model=Settings.embed_model,
                use_async=False,
                store_nodes_override=False,
                insert_batch_size=2048,
                callback_manager=None
            )

        return vector_index
    except Exception:
        return None

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
    
    global is_first_llm_run
    if is_first_llm_run == 1:
        print("Initializing LLM")
        initialize_llm(llm_choice)
        is_first_llm_run = 0
    
    global is_first_embed_run
    if is_first_embed_run == 1:
        print("Initializing embedding model")
        initialize_embedding_model(llm_choice)
        is_first_embed_run = 0

    # Obtain VectorStoreIndex for this llm_choice (for file ingestion/RAG)
    vector_index = get_vector_index(llm_choice)
    if vector_index is None:
        return jsonify({"ok": False, "error": "Unable to create or load index."}), 400
    
    print("Vector index made")

    # Create a query engine and expose it as a text-returning tool
    query_engine = vector_index.as_query_engine(similarity_top_k=5)

    print("Query engine made")

    query_tool_config = IndexToolConfig(
        query_engine = query_engine,
        name = "CustomizedQueryingTool",
        description=f"Performs retrieval-augmented generation from {llm_choice} vector store.",
    )

    query_engine_tool = LlamaIndexTool.from_tool_config(query_tool_config)
    print("Tool made")

    tools = [query_engine_tool]

    langchain_agent: CompiledStateGraph = create_react_agent(
        model=langchain_llm,
        tools=tools
    )

    print("Agent made")

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
    llm_choice = data.get("llmChoice", "")
    
    api_key: str = get_environment_api_key(llm_choice)
    if api_key == "":
        return jsonify({"ok": False, "error": "NO API key set."}), 400
    
    global is_first_embed_run
    if is_first_embed_run == 1:
        print("Initializing embedding model")
        initialize_embedding_model(llm_choice)
        is_first_embed_run = 0

    # Obtain VectorStoreIndex for this llm_choice (for file ingestion/RAG)
    vector_index = get_vector_index(llm_choice)
    if vector_index is None:
        return jsonify({"ok": False, "error": "Unable to create or load index."}), 400

    # Add to RAG index as PDFs are parsed
    any_inserted = False
    splitter = SentenceSplitter(chunk_size=1200, chunk_overlap=200)
    for file_info in files:
        content_b64 = file_info.get('content', '')
        file_name = file_info.get('name', '')
        file_type = file_info.get('type', '')
        extracted_text = ""

        if content_b64 and file_type == "application/pdf":
            try:
                pdf_bytes = base64.b64decode(content_b64)
                pdf_stream = BytesIO(pdf_bytes)
                reader = PdfReader(pdf_stream)
                for page in reader.pages:
                    extracted_text += page.extract_text() or ""
                
                if extracted_text.strip():
                    doc = Document(text=extracted_text, metadata={"file_name": file_name, "file_type": file_type})
                    nodes = splitter.get_nodes_from_documents([doc])
                    print(f"[RAG] Inserting {len(nodes)} nodes for {file_name}...")
                    vector_index.insert_nodes(nodes)
                    print(f"[RAG] Inserted nodes for {file_name}")
                    any_inserted = True
        
            except Exception as e:
                print(f"[FILE_UPLOAD] Error extracting text from {file_name}: {e}")
        
        else:
            print(f"[FILE_UPLOAD] Unsupported file type or empty content: name={file_name}, type={file_type}")

    # Persist once after all inserts (persist to per-LLM directory)
    if any_inserted:
        index_dir = os.path.join(INDEX_PATH, llm_choice)
        vector_index.storage_context.persist(index_dir)
    
    return jsonify({"ok": True, "message": f"Received {len(files)} file(s)"})

if __name__ == "__main__":
    app.run(debug=True)