# RAG Application & Notes App - Complete User Guide

## Table of Contents

1. [Overview](#overview)
2. [LLM Configuration](#llm-configuration)
3. [RAG Assistant Features](#rag-assistant-features)
4. [Notes Application](#notes-application)
5. [File Upload System](#file-upload-system)
6. [Language & Translation Options](#language--translation-options)
7. [Directory Structure](#directory-structure)
8. [Logging & Debugging](#logging--debugging)
9. [Frontend Interface Reference](#frontend-interface-reference)
10. [API Endpoints](#api-endpoints)
11. [Troubleshooting](#troubleshooting)

---

## Overview

The RAG (Retrieval-Augmented Generation) application is a Flask-based web interface that combines large language models with document search capabilities. It allows users to:

- Upload documents and query them using AI-powered search
- Create and manage persistent notes
- Request answers in multiple languages with translation support

The application uses **Google Gemini** as its primary LLM backend with support for extensibility to other providers.

---

## LLM Configuration

### Supported LLM: Google Gemini

**Models Used:**
- **Chat Model**: `gemini-2.5-flash` (temperature: 0.1)
- **Embedding Model**: `text-embedding-004`

### Getting a Free Google Gemini API Key

A free API key is required to use the RAG system. The easiest method is through Google AI Studio:

#### Step 1: Visit Google AI Studio
1. Go to [Google AI Studio API Keys](https://aistudio.google.com/app/api-keys)
2. Sign in with your Google account (create one if needed)
3. Click the **"Create API Key"** button
4. If prompted, select or create a Google Cloud Project (you can let Google create a default one)
5. Your new API key will appear immediately on the screen
6. **Copy the key** - you'll need it in the next step

#### Step 2: Add the Key to Your Application
Choose one of these methods:

**Method 1: Via Web Interface (Recommended)**
1. Start the application
2. Navigate to `http://localhost:5000/rag`
3. Attempt to submit a prompt
4. An API key modal will appear automatically
5. Paste your Gemini API key into the input field
6. Click "Submit"
7. Your key will be saved for future sessions

**Method 2: Manual File Creation**
1. Create the `api_keys/` directory if it doesn't exist:
   ```bash
   mkdir -p api_keys
   ```
2. Create a file named `gemini` in that directory:
   ```bash
   echo "your-api-key-here" > api_keys/gemini
   ```
3. Replace `your-api-key-here` with your actual API key

#### Verify Your Setup
- Check that the API key is stored correctly: `cat api_keys/gemini`
- Test the connection by submitting a prompt in the RAG interface
- If successful, you should see a response from the Gemini model

#### Troubleshooting Common Issues

**429 Quota Exceeded Error**
- You may have hit your free tier quota limits (1M requests/day is typical)
- If you get persistent 429 errors, consider:
  - Waiting for the quota to reset (quotas reset daily)
  - Upgrading to a paid plan in [Google Cloud Console](https://console.cloud.google.com/)
  - Using a different Google account with a fresh free tier quota

**"API key not found" Error**
- Verify the file exists: `ls api_keys/gemini`
- Check that the key is not empty: `cat api_keys/gemini`
- Ensure the file is readable by the application user

**Invalid API Key Error**
- Verify you copied the entire key correctly from [Google AI Studio](https://aistudio.google.com/app/api-keys)
- Check for extra spaces or line breaks in the key
- Try creating a new API key if the current one is corrupted

**Wrong Model Selected**
- The application uses `gemini-2.5-flash` by default
- Check the model name in `routes/rag.py` (line 36: `GEMINI_MODEL = "gemini-2.5-flash"`)
- Verify that model has a quota > 0 in the Quotas section

### API Key Setup

#### Method 1: Via Web Interface (Recommended)

1. Navigate to the RAG interface at `http://localhost:5000/rag`
2. Submit a prompt without setting an API key
3. An API key modal will appear automatically
4. Enter your Google Gemini API key
5. Click "Submit" or press Enter

**Modal Controls:**
- **Input Field**: Password-masked text input for API key
- **Cancel Button**: Close modal without saving
- **Submit Button**: Save API key to server
- **Keyboard Shortcuts**:
  - `Enter`: Submit key
  - `Escape`: Cancel and close modal

#### Method 2: Manual File Creation

Create a file named `gemini` in the `api_keys/` directory:

```bash
echo "your-api-key-here" > api_keys/gemini
```

**Important Notes:**
- API keys are stored in plain text in `./api_keys/gemini`
- This directory is git-ignored for security
- API keys persist across sessions
- When running in Docker, mount the `api_keys/` volume to retain keys across container restarts

### API Key Storage Location

- **Path**: `./api_keys/{llm_name}`
- **Format**: Plain text file, one key per file
- **Permissions**: Read/write by application user only
- **Persistence**: Keys survive container restarts when using volume mounts

---

## RAG Assistant Features

### Document Upload & Indexing

The RAG system supports multiple document formats:

#### Supported File Types

1. **PDF** (`.pdf`)
   - Extracts text and tables using `pdfplumber`
   - Handles multi-page documents
   - Preserves table structure

2. **Microsoft Word** (`.docx`)
   - Extracts paragraphs and tables
   - Converts tables to markdown-style formatting
   - Preserves document structure

3. **PowerPoint** (`.pptx`)
   - Extracts text from all slides
   - Processes table content
   - Maintains slide order

4. **HTML** (`.html`, `.htm`)
   - Strips scripts and styles
   - Converts tables to text format
   - Extracts visible content only

5. **Plain Text** (`.txt`, `.md`)
   - Direct text ingestion
   - Markdown support

### Document Processing Pipeline

1. **Upload**: Files are base64-encoded by the frontend and sent to `/rag/api/upload-files`
2. **Parsing**: Content is extracted based on file type
3. **Chunking**: Text is split into chunks using `SentenceSplitter`:
   - **Chunk size**: 1200 characters
   - **Overlap**: 200 characters
4. **Embedding**: Chunks are embedded using Google's `text-embedding-004` model
5. **Indexing**: Embeddings are stored in a `SimpleVectorStore`
6. **Persistence**: Index is saved to `./rag_documents/{llm_choice}/`

### Query Engine Configuration

When you submit a prompt, the RAG system:

1. **Retrieves** relevant passages using these parameters:
   - `similarity_top_k`: 10 (number of chunks returned to synthesizer)
   - `fetch_k`: 50 (candidates fetched before reranking)
   - `similarity_cutoff`: 0.1 (minimum similarity threshold)
   - `response_mode`: "compact" (synthesis strategy)

2. **Enforces tool usage**: The system instructs the LLM to ALWAYS call the `RAG_Document_Search` tool for every query

3. **Synthesizes**: Combines retrieved passages with the LLM's knowledge to generate answers

## Notes Application

### Overview

The Notes app is a simple note-taking system with persistent storage. Notes are stored in JSON format and survive application restarts.

### Storage Location

- **File**: `resources/notes.json`
- **Format**: JSON array of note objects
- **Persistence**: Atomic writes with `.json.tmp` intermediate file
- **Directory Creation**: `resources/` directory is auto-created on first save

### Note Structure

Each note contains:

```json
{
  "id": 1,
  "title": "Note Title",
  "content": "Note content here...",
  "created_at": "2025-12-09T10:30:00Z",
  "updated_at": "2025-12-09T11:45:00Z"  // Only if edited
}
```

### Frontend Interface

**Access**: Navigate to `/rag/notes` or click "Notes" button from main interface

**Available Actions**:

1. **Create New Note**
   - **Title Field**: Optional text input for note title
   - **Content Field**: Multi-line textarea (required)
   - **Save Button**: Saves note and auto-generates ID
   - Notes without titles display as "Note {id}"

2. **View Saved Notes**
   - Listed in reverse chronological order (newest first)
   - Displays title, content, and metadata
   - Content preserves newlines and formatting

3. **Delete Note**
   - Each note has a "Delete" button
   - Confirmation dialog before deletion
   - Immediate removal from list upon confirmation

4. **Navigation**
   - **Back to Interface**: Returns to RAG assistant
   - **Dark Mode Toggle**: Top-right corner theme switcher

### API Endpoints for Notes

**GET** `/rag/api/notes`
- Returns all saved notes as JSON array
- Response: `{"ok": true, "notes": [...]}`

**POST** `/rag/api/notes`
- Creates new note or updates existing (if `id` provided)
- Request: `{"title": "...", "content": "...", "id": 123}`
- Response: `{"ok": true, "note": {...}}`

**DELETE** `/rag/api/notes/<note_id>`
- Deletes note by ID
- Response: `{"ok": true}` or `{"ok": false, "error": "Not found"}`

---

## File Upload System

### Frontend File Selection

**Input Element**: `<input id="file-input" type="file" multiple />`

**Features**:
- Multiple file selection supported
- Triggers upload on file selection
- Validates LLM selection before upload
- Shows loading spinner during processing

### Upload Process

1. **File Reading**:
   - Files are read using `FileReader` API
   - Converted to base64 data URLs
   - Header stripped, only base64 content sent

2. **Metadata Captured**:
   ```javascript
   {
     name: "document.pdf",
     size: 1024576,
     type: "application/pdf",
     lastModified: 1702345678,
     content: "base64-encoded-data..."
   }
   ```

3. **Server Processing**:
   - Validates API key presence
   - Initializes embedding model if needed
   - Creates/loads vector index
   - Parses files based on type
   - Chunks and embeds content
   - Persists index to disk

4. **User Feedback**:
   - Spinner displays during upload
   - Alert confirms successful upload
   - File input is cleared

### Upload Constraints

- **Maximum files**: No frontend limit, but large batches may timeout
- **File size**: Limited by server memory (base64 encoding increases size ~33%)
- **Concurrent uploads**: One at a time (sequential processing)
- **Supported MIME types**: See "Supported File Types" section above

---

## Language & Translation Options

### Available Languages (29 Languages)

The application supports output in the following languages:

| Code | Language | Code | Language | Code | Language |
|------|----------|------|----------|------|----------|
| `en` | English | `es` | Spanish | `fr` | French |
| `de` | German | `zh` | Chinese (Mandarin) | `hi` | Hindi |
| `ar` | Arabic | `pt` | Portuguese | `ru` | Russian |
| `it` | Italian | `ja` | Japanese | `ko` | Korean |
| `tr` | Turkish | `nl` | Dutch | `sv` | Swedish |
| `pl` | Polish | `vi` | Vietnamese | `th` | Thai |
| `id` | Indonesian | `bn` | Bengali | `ur` | Urdu |
| `fa` | Persian (Farsi) | `he` | Hebrew | `ro` | Romanian |
| `cs` | Czech | `el` | Greek | `hu` | Hungarian |
| `no` | Norwegian | `sk` | Slovak | | |

### Response Modes

#### 1. Direct Mode (Default)

**Setting**: `response_mode: "direct"`

**Behavior**:
- LLM responds ONLY in the selected target language
- No English translation provided
- System instruction: _"Respond to the user ONLY in {language}. Do not include any output in English or other languages."_

**Example**:
```
User: "What is photosynthesis?" (Language: Spanish, Mode: Direct)
Response: "La fotosíntesis es el proceso por el cual..."
```

#### 2. Original + Translation Mode

**Setting**: `response_mode: "both"`

**Behavior**:
- LLM first provides complete answer in English
- Then inserts separator: `---TRANSLATION ({Language})---`
- Follows with full translation in target language
- System instruction enforces clear separation

**Example**:
```
User: "What is photosynthesis?" (Language: Spanish, Mode: Both)
Response:
"Photosynthesis is the process by which green plants..."

---TRANSLATION (Spanish)---

La fotosíntesis es el proceso por el cual las plantas verdes...
```

### Frontend Controls

**Language Dropdown**: `<select id="language-select">`
- Displays full language names
- Sends ISO 639-1 language codes to backend
- Default: English (`en`)

**Mode Dropdown**: `<select id="mode-select">`
- Options:
  - "Direct — respond only in the selected language"
  - "Original + Translation — include original response and then a translated version"
- Default: Direct mode

---

## Directory Structure

### Application Directories

```
project-root/
├── api_keys/                    # API key storage
│   └── gemini                   # Google Gemini API key (plain text)
│
├── rag_documents/               # RAG vector indices
│   └── gemini/                  # Per-LLM storage
│       ├── default__vector_store.json
│       ├── docstore.json
│       ├── graph_store.json
│       ├── image__vector_store.json
│       └── index_store.json
│
├── resources/                   # Persistent application data
│   ├── notes.json              # Notes storage
│   └── campus-graph-*.json     # Campus planner data
│
├── routes/                      # Flask blueprints
│   ├── __init__.py
│   ├── home.py                 # Homepage routes
│   ├── planner.py              # Campus planner routes
│   └── rag.py                  # RAG and notes routes
│
├── static/                      # Frontend assets
│   ├── styles.css
│   ├── index.js                # Main JS (RAG + Notes)
│   ├── darkmode.js             # Theme toggler
│   ├── planner.js
│   ├── planner.css
│   ├── annotator.js
│   └── annotator.css
│
├── templates/                   # HTML templates
│   ├── homepage.html
│   ├── index.html              # RAG interface
│   ├── notes.html              # Notes interface
│   ├── planner.html
│   └── annotator.html
│
├── app.py                       # Application entry point
├── requirements.txt             # Python dependencies
├── Dockerfile                   # Container definition
└── vibe_app.log                # Application log file
```

### Data Persistence in Docker

When running in Docker, mount these directories as volumes:

```bash
docker run -d \
  -v $(pwd)/api_keys:/app/api_keys \
  -v $(pwd)/rag_documents:/app/rag_documents \
  -v $(pwd)/resources:/app/resources \
  -p 5000:5000 \
  csci-rag-app
```

**Volume Purposes**:
- `api_keys/`: Persist API keys across container restarts
- `rag_documents/`: Preserve uploaded document indices
- `resources/`: Maintain notes and configuration data

---

## Logging & Debugging

### Logger Configuration

**Logger Name**: `vibe_app`

**Log Levels**:
- **INFO**: Default mode (startup, key events)
- **DEBUG**: Enabled when `FLASK_DEBUG=1` or `DEBUG_LOG=1`

**Output Destinations**:
1. **Console** (stdout): Always enabled
2. **File** (`vibe_app.log`): Best-effort (continues if file creation fails)

**Log Format**: `%(asctime)s %(levelname)s %(message)s`

### Environment Variables for Debugging

Set these in your environment or Dockerfile to enable advanced debugging:

```bash
# Flask debugging
FLASK_ENV=development
FLASK_DEBUG=1
DEBUG_LOG=1

# RAG-specific debugging
RAG_DEBUG=1                    # Enables query engine debug wrappers
RAG_RETRIEVE_DEBUG=1           # Logs retrieval details (nodes, scores, metadata)

# Testing mode
MOCK_LLM=1                     # Simulates LLM responses without API calls
```

### Debug Output Examples

#### RAG Debug Mode (`RAG_DEBUG=1`)

Logs every query engine invocation:

```
[RAG DEBUG] Running query with args= ('user question',) kwargs= {}
[RAG DEBUG] Retrieved 10 nodes:
  1. score=0.85 metadata={'source': 'doc.pdf', 'page': 2} text_snippet=The process of photosynthesis involves...
  2. score=0.78 metadata={'source': 'doc.pdf', 'page': 3} text_snippet=Chloroplasts are organelles that...
```

#### RAG Retrieve Debug Mode (`RAG_RETRIEVE_DEBUG=1`)

Tests retrieval methods and displays results:

```
[RAG RETRIEVE DEBUG] Calling method: query()
[RAG RETRIEVE DEBUG] Result type from query: <class 'Response'>
[RAG RETRIEVE DEBUG] query returned 10 nodes:
  1. score=0.85 metadata={...} text_snippet=...
```

#### Tool Invocation Logging

Logs when the LLM agent calls the RAG tool:

```
[RAG TOOL DEBUG] Agent invoked tool: run with args= ('What is photosynthesis?',)
[RAG TOOL DEBUG] Tool returned result type: <class 'str'>
[RAG TOOL DEBUG] Retrieved 5 source nodes with scores: [0.85, 0.78, 0.72, 0.68, 0.65]
```

### Request Logging

Every HTTP request logs metadata (headers, JSON body) at DEBUG level:

```
2025-12-09 10:30:45 DEBUG Incoming request POST /rag/api/prompt headers={'User-Agent': '...', 'Content-Type': 'application/json', 'Host': 'localhost:5000'} json={"prompt": "test", "target_language": "es", "response_mode": "direct"}
```

**Note**: API keys are NEVER logged.

### Error Handling

**Global Exception Handler**: Catches all unhandled exceptions

**Response Format**:
```json
{
  "ok": false,
  "error": "Unhandled server error.",
  "detail": "ValueError: Invalid input",
  "traceback": "Traceback (most recent call last):\n  File ..."
}
```

**HTTP Status**: 500

---

## Frontend Interface Reference

### Main RAG Interface (`/rag` or `/rag/`)

**URL**: `http://localhost:5000/rag`

**Page Elements**:

#### Header Section
- **Title**: "Interface"
- **Description**: Brief intro about the study assistant
- **Navigation Buttons**:
  - `Try Campus Path Planner` → `/planner`
  - `Notes` → `/rag/notes`
- **Dark Mode Toggle**: Top-right corner theme switch

#### Prompt Input Section
- **Label**: "Your prompt"
- **Input**: Multi-line textarea (`#prompt-input`)
- **Placeholder**: "Type your question to the LLM..."
- **Enter Button**: Submits prompt
- **Keyboard Shortcuts**:
  - `Ctrl+Enter` or `Cmd+Enter`: Submit (without Shift)
  - `Shift+Enter`: New line

#### Language Selection
- **Label**: "Select Output Language"
- **Dropdown**: 29 language options
- **Default**: English

#### Response Mode Selection
- **Label**: "Response mode"
- **Dropdown**:
  - Direct (default)
  - Original + Translation
- **Help Text**: Explains "Original + Translation" mode

#### File Upload
- **Label**: "Attach files (optional)"
- **Input**: Multi-file selector
- **Behavior**: Auto-uploads on file selection

#### Output Display
- **Label**: "LLM output"
- **Area**: Scrollable text box (`#output-box`)
- **Initial Text**: "_Model responses will appear here._"
- **Live Updates**: Streams text as it arrives (aria-live="polite")

#### Loading Indicators
- **Fullscreen Spinner**: Overlays entire page during processing
- **Text**: "Processing..."

#### Modals
- **API Key Modal**:
  - **Trigger**: Automatic when API key missing
  - **Fields**: Password-masked input
  - **Buttons**: Cancel, Submit
  - **Keyboard**: Enter to submit, Escape to cancel

### Notes Interface (`/rag/notes`)

**URL**: `http://localhost:5000/rag/notes`

**Page Elements**:

#### Header Section
- **Title**: "Notes"
- **Description**: "Create and manage quick notes. Notes are stored locally on the server in a simple JSON file."
- **Navigation**: "Back to Interface" button → `/rag`
- **Dark Mode Toggle**: Top-right corner

#### Note Creation Form
- **Title Input**: Optional text field (`#notes-title`)
- **Content Textarea**: Required, 10 rows (`#notes-content`)
- **Placeholder**: "Write a note..."
- **Save Button**: Creates new note

#### Saved Notes List
- **Heading**: "Saved notes"
- **List**: Unordered list (`#notes-ul`)
- **Note Display**:
  - Bold title (or "Note {id}" if untitled)
  - Delete button (per note)
  - Content with preserved formatting
- **Delete Confirmation**: Browser confirm dialog

---

## API Endpoints

### RAG Endpoints

#### POST `/rag/api/prompt`

**Purpose**: Submit a prompt to the RAG assistant

**Request Body**:
```json
{
  "prompt": "What is photosynthesis?",
  "llm_choice": "gemini",
  "target_language": "es",
  "response_mode": "direct",
  "mock": false
}
```

**Parameters**:
- `prompt` (string, required): User's question
- `llm_choice` (string): LLM provider (default: "gemini")
- `target_language` (string): ISO language code (default: "")
- `response_mode` (string): "direct" or "both" (default: "direct")
- `mock` (boolean): Enable mock mode for testing (default: false)

**Response**: Plain text stream (text/plain)

**Error Response** (JSON):
```json
{
  "ok": false,
  "error": "NO API key set."
}
```

#### POST `/rag/api/set-api-key`

**Purpose**: Set or update LLM API key

**Request Body**:
```json
{
  "llm_choice": "gemini",
  "api_key": "your-api-key-here"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "API key set for gemini"
}
```

#### POST `/rag/api/upload-files`

**Purpose**: Upload documents for RAG indexing

**Request Body**:
```json
{
  "file_paths": [
    {
      "name": "document.pdf",
      "size": 1024576,
      "type": "application/pdf",
      "lastModified": 1702345678,
      "content": "base64-encoded-content"
    }
  ],
  "llmChoice": "gemini"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Received 1 file(s)"
}
```

#### POST `/rag/api/scrape`

**Purpose**: Scrape and optionally index web content

**Request Body**:
```json
{
  "url": "https://example.com/article",
  "insert": true,
  "llm_choice": "gemini"
}
```

**Response**:
```json
{
  "ok": true,
  "url": "https://example.com/article",
  "text": "Extracted content here...",
  "inserted": true
}
```

### Notes Endpoints

#### GET `/rag/api/notes`

**Purpose**: Retrieve all saved notes

**Response**:
```json
{
  "ok": true,
  "notes": [
    {
      "id": 1,
      "title": "My Note",
      "content": "Note content...",
      "created_at": "2025-12-09T10:30:00Z"
    }
  ]
}
```

#### POST `/rag/api/notes`

**Purpose**: Create new note or update existing

**Request Body** (Create):
```json
{
  "title": "New Note",
  "content": "Note content here"
}
```

**Request Body** (Update):
```json
{
  "id": 1,
  "title": "Updated Title",
  "content": "Updated content"
}
```

**Response**:
```json
{
  "ok": true,
  "note": {
    "id": 1,
    "title": "New Note",
    "content": "Note content here",
    "created_at": "2025-12-09T10:30:00Z"
  }
}
```

#### DELETE `/rag/api/notes/<note_id>`

**Purpose**: Delete a note by ID

**Response** (Success):
```json
{
  "ok": true
}
```

**Response** (Not Found):
```json
{
  "ok": false,
  "error": "Note not found."
}
```

**HTTP Status**: 404

### Navigation Endpoints

#### GET `/rag/` or `/rag`

**Purpose**: Render main RAG interface

**Returns**: HTML template (`index.html`)

#### GET `/rag/notes`

**Purpose**: Render notes interface

**Returns**: HTML template (`notes.html`)

#### GET `/rag/planner`

**Purpose**: Redirect to campus planner

**Returns**: Redirect to `/planner/planner`

---

## Troubleshooting

### Common Issues

#### 1. "NO API key set" Error

**Symptoms**: Modal appears when submitting prompt

**Solutions**:
- Enter API key through modal interface
- Create `api_keys/gemini` file manually
- Verify file permissions (readable by app)
- Check Docker volume mounts if using containers

#### 2. File Upload Fails

**Symptoms**: Spinner never disappears, alert shows error

**Possible Causes**:
- API key not set (set key first)
- File too large (memory constraints)
- Unsupported file type
- Embedding model not initialized

**Solutions**:
- Set API key before uploading
- Try smaller files or fewer files at once
- Verify file type in supported list
- Check server logs for initialization errors

#### 3. Notes Not Persisting

**Symptoms**: Notes disappear after server restart

**Causes**:
- Docker volume not mounted
- File permissions issue
- `resources/` directory not writable

**Solutions**:
- Add volume mount: `-v $(pwd)/resources:/app/resources`
- Check directory permissions
- Verify `resources/notes.json` exists and is writable

#### 4. No RAG Results Returned

**Symptoms**: LLM responds without using document context

**Debugging Steps**:
1. Enable `RAG_DEBUG=1` to see if tool is called
2. Enable `RAG_RETRIEVE_DEBUG=1` to inspect retrieved nodes
3. Check if documents were successfully indexed
4. Verify `rag_documents/gemini/` contains index files
5. Try re-uploading documents

#### 5. Language Translation Not Working

**Symptoms**: Output always in English regardless of selection

**Causes**:
- JavaScript not passing `target_language` parameter
- System instruction not being applied
- LLM ignoring instruction

**Solutions**:
- Check browser console for errors
- Verify dropdown selection is being captured
- Try "both" mode to see if translation works
- Check server logs for `target_language` parameter

#### 6. Spinner Stuck on Screen

**Symptoms**: Loading spinner never disappears

**Causes**:
- JavaScript error during stream processing
- Network timeout
- Server crash
- 429 (if using free API)

**Solutions**:
- Check browser console for errors
- Refresh page
- Check server logs for exceptions
- Verify server is still running

### Debug Checklist

When troubleshooting, check:

1. **Browser Console**: Look for JavaScript errors
2. **Server Logs**: Check `vibe_app.log` for exceptions
3. **Network Tab**: Inspect request/response payloads
4. **Environment Variables**: Verify debug flags if needed
5. **File Permissions**: Ensure directories are writable
6. **Docker Volumes**: Confirm mounts are correct
7. **API Key**: Verify key is valid and saved

### Getting Help

For additional support:

1. Enable all debug flags (`FLASK_DEBUG=1`, `RAG_DEBUG=1`, `RAG_RETRIEVE_DEBUG=1`)
2. Reproduce the issue
3. Collect logs from:
   - Docker logs: `docker logs csci-rag-container`
4. Document steps to reproduce
5. Note your environment (OS, Python version, Docker version)

---

## Advanced Configuration

### Customizing Query Engine

Edit `routes/rag.py`, function `receive_prompt()`:

```python
query_engine = vector_index.as_query_engine(
    similarity_top_k=10,      # Increase for more context
    fetch_k=50,               # Increase for better reranking
    similarity_cutoff=0.1,    # Raise to filter low-quality matches
    response_mode="compact"   # Try "tree_summarize" for longer docs
)
```

### Customizing Chunking

Edit chunk parameters in `upload_files()`:

```python
splitter = SentenceSplitter(
    chunk_size=1200,    # Larger = more context per chunk
    chunk_overlap=200   # Larger = more redundancy
)
```

### Adding New LLM Providers

1. Add initialization logic in `initialize_llm()` and `initialize_embedding_model()`
2. Add API key handling in `get_environment_api_key()`
3. Update frontend to include new provider option
4. Test thoroughly with provider-specific models

### Changing Temperature

Edit `receive_prompt()` in `routes/rag.py`:

```python
langchain_llm: BaseChatModel = ChatGoogleGenerativeAI(
    model=GEMINI_MODEL,
    google_api_key=api_key,
    temperature=0.1  # Lower = more deterministic, Higher = more creative
)
```

---

## Security Considerations

### API Keys
- **Storage**: Plain text in `api_keys/` directory
- **Future Recommendation**: Use environment variables or secrets management in production
- **Git**: Ensure `.gitignore` excludes `api_keys/`

### File Uploads
- **Validation**: Only MIME type checking (client-side)
- **Risk**: Malicious files could be uploaded
- **Future Recommendation**: Add server-side validation and sandboxing

### CORS
- **Current**: No CORS restrictions
- **Future Recommendation**: Add CORS middleware for production deployments

### Authentication
- **Current**: None
- **Future Recommendation**: Add user authentication before deploying publicly

---

## Performance Tips

1. **Index Management**: Delete old indices periodically to save space
2. **Chunk Size**: Larger chunks = fewer embeddings = faster indexing
3. **Similarity Top K**: Lower values = faster queries but less context
4. **Mock Mode**: Use `MOCK_LLM=1` for frontend testing without API calls
5. **Batch Uploads**: Upload multiple files at once instead of one-by-one

---

**Version**: 1.0  
**Application**: Full-Stack LLMs Vibe Coding Project