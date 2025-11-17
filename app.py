""" A Flask application for LLM interaction. """
import os
from pathlib import Path
import base64
from PIL import Image
from io import BytesIO
import pdfplumber
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify, render_template, Response, stream_with_context
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import create_react_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from llama_index.core import Document, VectorStoreIndex
from llama_index.core.schema import ImageDocument
from llama_index.core.langchain_helpers.agents import IndexToolConfig, LlamaIndexTool
from llama_index.core import StorageContext, Settings, load_index_from_storage
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.vector_stores.simple import SimpleVectorStore
from llama_index.embeddings.google_genai import GoogleGenAIEmbedding
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.google_genai import GoogleGenAI

import logging
import sys
import time
import json
import traceback

app = Flask(__name__)

# Application logger (console + optional file). Use DEBUG when requested.
logger = logging.getLogger("vibe_app")
logger.setLevel(logging.DEBUG if os.getenv("FLASK_DEBUG") == "1" or os.getenv("DEBUG_LOG") == "1" else logging.INFO)
_fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
_ch = logging.StreamHandler(sys.stdout)
_ch.setFormatter(_fmt)
logger.addHandler(_ch)
try:
    _fh = logging.FileHandler("vibe_app.log")
    _fh.setFormatter(_fmt)
    logger.addHandler(_fh)
except Exception:
    # Best-effort file logging; continue if it fails
    logger.warning("Could not create vibe_app.log (permission or path issue). Continuing without file logging.")

    # ---------------------------------------------------------------------------
    # Module overview
    #
    # This Flask application provides a small web UI and API to interact with
    # different LLM backends (Gemini, OpenAI). It supports:
    # - Setting API keys (persisted to ./api_keys/{llm_name})
    # - Uploading files to be indexed for RAG (stored under ./rag_documents)
    # - Sending prompts to an agent that uses the LLM + a LlamaIndex toolset
    # - Optional "mock" mode to simulate streaming responses for testing
    # - Language filtering/instruction wrapping so the model outputs in a
    #   user-selected target language and supports a 'both' mode (original +
    #   translated output) or 'direct' mode (only the target language)
    #
    # Logging and debugging:
    # - Uses a module logger `logger` which writes to stdout and (optionally)
    #   to `vibe_app.log` in the working directory.
    # - A global error handler returns JSON with a traceback for easier debugging
    #
    # Note: avoid logging secrets (API keys) — we only log high-level request
    # metadata and the selected llm_choice/target_language/response_mode.
    # ---------------------------------------------------------------------------


@app.before_request
def _log_request_info():
    # Safely log basic request metadata and JSON body (if any). Avoid logging secrets.
    try:
        body = request.get_json(silent=True)
    except Exception:
        body = None
    headers = {
        "User-Agent": request.headers.get("User-Agent"),
        "Content-Type": request.headers.get("Content-Type"),
        "Host": request.headers.get("Host")
    }
    try:
        logger.debug("Incoming request %s %s headers=%s json=%s", request.method, request.path, headers, json.dumps(body) if body is not None else None)
    except Exception:
        logger.debug("Incoming request %s %s (body not JSON-serializable)", request.method, request.path)


@app.errorhandler(Exception)
def _handle_unhandled_exception(e):
    # Global fall-through for unexpected exceptions: log full traceback and return JSON
    logger.error("Unhandled exception in request", exc_info=True)
    tb = traceback.format_exc()
    return jsonify({"ok": False, "error": "Unhandled server error.", "detail": str(e), "traceback": tb}), 500

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

    # The initialize path prepares a LlamaIndex-compatible LLM object. This
    # function currently supports 'gemini' (Google) and can be extended to
    # other providers. It primarily ensures API keys are available and sets
    # Settings.llm so downstream LlamaIndex components can access the model.
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
        # Placeholder: OpenAI initialization can be added here if needed.
        pass
    else:
        # Unknown provider: do nothing. Caller will handle missing LLM.
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
        # If no known embedding model is configured for the requested LLM,
        # leave `Settings.embed_model` unchanged. Downstream code should
        # validate that `Settings.embed_model` is set before attempting
        # to create or load vector indexes.
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
    except Exception as ex:
        # Return None on any failure so callers can surface an error to the
        # client. Log the exception for debugging.
        logger.exception("Failed to create or load vector index for %s", llm_choice)
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
def homepage():
    """ Render the homepage.html template """
    return render_template("homepage.html")


@app.route("/planner")
def planner():
    """Placeholder route for planner (some templates reference this)."""
    try:
        return render_template("planner.html")
    except Exception:
        # Fallback simple response if the planner template isn't present
        return "Planner page (template missing).", 200

@app.route("/index")
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
        # If anything goes wrong extracting the message text, return an empty
        # string rather than propagating the exception into the stream.
        logger.exception("Failed to extract text from message object")
        return ""

@app.route("/api/prompt", methods=["POST"])
def receive_prompt():
    """ 
    1. Retrieve frontend variables
    2. Create Langchain agent, return response 
    """
    # Parse JSON body safely. `silent=True` prevents exceptions on invalid JSON.
    data = request.get_json(silent=True) or {}

    # The raw user prompt text (what the user typed in the UI)
    prompt_text = data.get("prompt", "")

    # Which LLM backend the user selected (e.g., 'gemini' or 'openai')
    llm_choice = data.get("llm_choice", "")

    # Accept either 'target_language' or 'language' from the frontend for
    # backward compatibility with different client payloads.
    target_language = data.get("target_language", "") or data.get("language", "")

    # response_mode controls how we instruct the LLM:
    # - 'direct': reply only in the target language
    # - 'both': include original answer then a translated version separated
    #           by a marker (e.g. '---TRANSLATION (Spanish)---')
    response_mode = data.get("response_mode", "direct")

    # Basic validation: ensure caller selected an LLM and we have an API key

    if llm_choice == "":
        return jsonify({"ok": False, "error": "SNO: no LLM selected."}), 400

    api_key: str = get_environment_api_key(llm_choice)
    if api_key == "":
        return jsonify({"ok": False, "error": "NO API key set."}), 400

    # Wrap the handler in try/except to capture unexpected errors and print
    # a stacktrace to the server logs for diagnosis rather than returning a
    # generic 500 without information.
    try:
        # Log key request parameters (do NOT log raw API keys)
        logger.debug("/api/prompt called; llm_choice=%s target_language=%s response_mode=%s", llm_choice, target_language, response_mode)
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
        logger.debug("Agent created for llm_choice=%s", llm_choice)
        # If a target language is requested, prepend a clear instruction so the LLM
        # produces output in that language. Use a small mapping for friendly names.
        if target_language:
            language_map = {
                "en": "English",
                "es": "Spanish",
                "fr": "French",
                "de": "German",
                "zh": "Chinese (Mandarin)",
                "hi": "Hindi",
                "ar": "Arabic",
                "pt": "Portuguese",
                "ru": "Russian",
                "it": "Italian",
                "ja": "Japanese",
                "ko": "Korean",
                "tr": "Turkish",
                "nl": "Dutch",
                "sv": "Swedish",
                "pl": "Polish",
                "vi": "Vietnamese",
                "th": "Thai",
                "id": "Indonesian",
                "bn": "Bengali",
                "ur": "Urdu",
                "fa": "Persian",
                "he": "Hebrew",
                "ro": "Romanian",
                "cs": "Czech",
                "el": "Greek",
                "hu": "Hungarian",
                "no": "Norwegian",
                "sk": "Slovak"
            }
            lang_name = language_map.get(target_language, target_language)
            # Build instructions depending on response_mode
            if response_mode == "both":
                # Ask the agent to provide the primary answer, then a clear translated
                # section. We include markers so the client/user can split them if needed.
                prompt_text = (
                    f"Provide a complete answer to the user's question.\n\n"
                    f"After the full answer, insert a line that says '---TRANSLATION ({lang_name})---' "
                    f"and then provide a translation of the full answer into {lang_name}. "
                    f"Do not include any additional commentary.\n\nUser prompt:\n{prompt_text}"
                )
            else:
                # Strong instruction ensures the agent replies only in the requested language.
                prompt_text = (
                    f"Please respond ONLY in {lang_name}. All output should be in {lang_name}.\n\n"
                    f"User prompt:\n{prompt_text}"
                )
        
        # Mock LLM mode: allow testing without external API calls. Enable by setting
        # the environment variable MOCK_LLM=1 or including {"mock": true} in the POST body.
        mock_mode = (os.getenv("MOCK_LLM", "0") == "1") or bool(data.get("mock", False))
        if mock_mode:
            logger.info("Mock LLM mode active - streaming a simulated response")
            # Use a small generator to simulate streaming chunks
            def mock_gen():
                yield ""
                time.sleep(0.01)
                # main answer (shortened)
                main = f"[MOCK ANSWER] Responding to: {prompt_text}"
                for i in range(0, len(main), 100):
                    yield main[i:i+100]
                    time.sleep(0.01)
                if response_mode == "both":
                    marker = f"\n---TRANSLATION ({lang_name if 'lang_name' in locals() else target_language})---\n"
                    for i in range(0, len(marker), 100):
                        yield marker[i:i+100]
                        time.sleep(0.01)
                    trans = f"[MOCK TRANSLATION into {lang_name if 'lang_name' in locals() else target_language}]"
                    for i in range(0, len(trans), 100):
                        yield trans[i:i+100]
                        time.sleep(0.01)
                yield "\n"

            return Response(stream_with_context(mock_gen()), mimetype="text/plain")
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

        # Normal return: stream generator
        return Response(generate(), mimetype="text/plain")
    except Exception as e:
        # Print full traceback to server logs for debugging
        import traceback
        traceback.print_exc()
        # Return JSON error so frontend can display a useful message
        return jsonify({"ok": False, "error": "Internal server error.", "detail": str(e)}), 500

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

        if not content_b64:
            print(f"[FILE_UPLOAD] No content found for {file_name}")
            continue
        
        if file_type == "application/pdf":
            try:
                with pdfplumber.open(BytesIO(base64.b64decode(content_b64))) as pdf:
                    for page_number, page in enumerate(pdf.pages, 1):
                        text = page.extract_text() or ""
                        extracted_text += f"\n\n--- Page {page_number} ---\n{text}\n"
                        
                        # Extract the images from the PDF
                        for image_index, image in enumerate(page.images):
                            try:
                                print(f"[FILE_UPLOAD] Image: {image}")
                                image_bounding_box = (image["x0"], page.height - image["y1"], image["x1"], page.height - image["y0"])
                                cropped_image = page.crop(image_bounding_box).to_image(resolution=300)
                                print(type(cropped_image))
                                image_document = ImageDocument(
                                    image = Image.fromarray(np.array(cropped_image.original)),
                                    metadata={
                                        "file_name": file_name,
                                        "page_num": page_number,
                                        "image_idx": image_index,
                                        "source_pdf": file_name
                                    }
                                )
                                # TODO: add image to RAG database

                            except Exception as img_error:
                                print(f"[IMAGE UPLOAD] Error with image detection: {img_error}. Continuing.")
                                continue

                        # Convert tables to text descriptions
                        for table in page.extract_tables():
                            df = pd.DataFrame(table[1:], columns=table[0])
                            text += f"\n\nTable:\n{df.to_string()}\n"
                            extracted_text += text
                            text = ""

                if extracted_text.strip():
                    doc = Document(text=extracted_text, metadata={"file_name": file_name, "file_type": file_type})
                    nodes = splitter.get_nodes_from_documents([doc])
                    print(f"[RAG] Inserting {len(nodes)} nodes for {file_name}...")
                    vector_index.insert_nodes(nodes)
                    print(f"[RAG] Inserted nodes for {file_name}")
                    any_inserted = True
        
            except Exception as e:
                print(f"[FILE_UPLOAD] Error extracting text from {file_name}: {e}")
        
        elif file_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            pass

        else:
            print(f"[FILE_UPLOAD] Unsupported file type or empty content: name={file_name}, type={file_type}")

    # Persist once after all inserts (persist to per-LLM directory)
    if any_inserted:
        print("Persisting index")
        index_dir = os.path.join(INDEX_PATH, llm_choice)
        
        # Make sure index directory exists
        if not os.path.exists(index_dir):
            print("Here")
            os.makedirs(index_dir, exist_ok=True)
        
        vector_index.storage_context.persist(Path(index_dir))
    
    return jsonify({"ok": True, "message": f"Received {len(files)} file(s)"})

if __name__ == "__main__":
    app.run(debug=True)