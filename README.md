# Full-Stack LLMs Vibe Coding Project

A full-stack web application that integrates large language models (LLMs) with a Flask backend and modern HTML/JavaScript frontend. This project features:

- **RAG (Retrieval-Augmented Generation)**: Upload documents (PDF, DOCX, PPTX, HTML, plain text) and query them with AI-powered search.
- **Notes Application**: Create, save, and manage persistent notes across browser sessions.
- **Campus Route Planner**: Compute shortest paths between campus buildings using Dijkstra's algorithm with customizable walking speeds and terrain penalties.
- **Map Annotator Tool**: Interactive tool to create and edit campus map overlays, add building annotations, and calibrate coordinate systems.
- **Language Support**: Request answers in multiple languages with optional translation modes.
- **API Key Management**: Store and manage LLM API keys.

---

## Project Structure

```
├── app.py                    # Flask application entry point
├── requirements.txt          # Python dependencies
├── Dockerfile               # Docker container configuration
├── docker-run.ps1           # PowerShell deployment script
├── docker-run.sh            # Bash deployment script
├── routes/                  # Flask blueprints (home, planner, RAG)
├── templates/               # HTML templates (homepage, notes, RAG interface, etc.)
├── static/                  # CSS, JavaScript, and client-side assets
├── resources/               # Persistent data (notes.json)
├── api_keys/                # API key storage (git-ignored)
├── rag_documents/           # RAG vector store and document indices
└── README.md               # This file
```

---

## Configuration

### Environment & Dependencies

- **Python Version**: 3.12+
- **Framework**: Flask with LangChain, LlamaIndex, and Google Generative AI integrations
- **Key Packages**:
  - `langchain`, `langgraph`: LLM orchestration and agent workflows
  - `llama-index`: RAG and vector indexing
  - `pdfplumber`, `python-docx`, `python-pptx`: Document parsing
  - `beautifulsoup4`: HTML parsing and scraping

### Directory Roles

- **`routes/`**: Flask blueprints handling `/`, `/planner`, `/rag` endpoints and API routes
- **`templates/`**: Jinja2 HTML templates for the UI
- **`static/`**: CSS stylesheets and JavaScript for interactivity
- **`resources/`**: Persistent application data (notes.json) and campus graph data (campus-graph-*.json)
- **`api_keys/`**: Stores LLM API keys (one key per provider, git-ignored)
- **`rag_documents/`**: Per-LLM vector store indices and document metadata

---

## Running the Application

### Option 1: Local Development (Without Docker)

#### Prerequisites
- Python 3.12+
- pip package manager

#### Steps

1. **Clone and navigate to the project:**
   ```bash
   cd CSCI4-598A-A-project1
   ```

2. **Create a virtual environment:**
   ```bash
   python3 -m venv venv
   ```

3. **Activate the virtual environment:**
   - **Linux/macOS:**
     ```bash
     source venv/bin/activate
     ```
   - **Windows (PowerShell):**
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```

4. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

5. **Create required directories (if not present):**
   ```bash
   mkdir -p api_keys rag_documents resources
   ```

6. **Set your Google Gemini API key:**
   ```bash
   echo "your-api-key-here" > api_keys/gemini
   ```

7. **Run the application:**
   ```bash
   flask run
   ```

   The app will be available at `http://localhost:5000`

---

### Option 2: Docker with Manual Commands

#### Prerequisites
- Docker installed ([Install Docker](https://docs.docker.com/get-docker/))

#### Steps

1. **Build the Docker image:**
   ```bash
   docker build -t csci-rag-app .
   ```

2. **Create required directories:**
   ```bash
   mkdir -p api_keys rag_documents resources
   ```

3. **Run the container with volume mounts for persistent storage:**
   ```bash
   docker run -d \
     --name csci-rag-container \
     -p 5000:5000 \
     -v $(pwd)/api_keys:/app/api_keys \
     -v $(pwd)/rag_documents:/app/rag_documents \
     -v $(pwd)/resources:/app/resources \
     csci-rag-app
   ```

   **Windows (PowerShell):**
   ```powershell
   docker run -d `
     --name csci-rag-container `
     -p 5000:5000 `
     -v ${PWD}/api_keys:/app/api_keys `
     -v ${PWD}/rag_documents:/app/rag_documents `
     -v ${PWD}/resources:/app/resources `
     csci-rag-app
   ```

4. **Access the application:**
   Open `http://localhost:5000` in your browser.

5. **View logs:**
   ```bash
   docker logs -f csci-rag-container
   ```

6. **Stop the container:**
   ```bash
   docker stop csci-rag-container
   docker rm csci-rag-container
   ```

---

### Option 3: Docker with PowerShell Script (Windows)

The provided `docker-run.ps1` script automates setup, building, and running on Windows.

#### Prerequisites
- Docker for Windows
- PowerShell 5.1 or later

#### Steps

1. **Run the script from the project root:**
   ```powershell
   .\docker-run.ps1
   ```

   This script will:
   - Create `api_keys/`, `rag_documents/`, and `resources/` directories if missing
   - Build the Docker image as `csci-rag-app`
   - Stop and remove any existing `csci-rag-container`
   - Run a new container with all data directories mounted as volumes

2. **Access the application:**
   Open `http://localhost:5000`

3. **Stop the container:**
   ```powershell
   docker stop csci-rag-container
   docker rm csci-rag-container
   ```

---

### Option 4: Docker with Bash Script (Linux/macOS/WSL)

The provided `docker-run.sh` script automates the same process for Bash-compatible shells.

#### Prerequisites
- Docker installed
- Bash or POSIX shell

#### Steps

1. **Make the script executable and run it:**
   ```bash
   chmod +x docker-run.sh
   ./docker-run.sh
   ```

   This script will:
   - Create `api_keys/`, `rag_documents/`, and `resources/` directories if missing
   - Build the Docker image as `csci-rag-app`
   - Stop and remove any existing `csci-rag-container`
   - Run a new container with all data directories mounted as volumes
   - Display container details and log instructions

2. **Access the application:**
   Open `http://localhost:5000`

3. **View logs:**
   ```bash
   docker logs -f csci-rag-container
   ```

4. **Stop the container:**
   ```bash
   docker stop csci-rag-container
   docker rm csci-rag-container
   ```

---

## Persistent Storage

All data is stored in mounted volumes (when using Docker) or local directories:

- **`api_keys/`**: LLM provider API keys (e.g., `api_keys/gemini`)
- **`rag_documents/`**: RAG vector indices per LLM provider
- **`resources/`**: Application data including `notes.json` for saved notes and `campus-graph-*.json` for route planning data

When running locally, these directories store data directly. When running in Docker with the helper scripts or manual volume mounts, these directories persist on the host machine across container restarts.

---

## Features in Detail

### RAG Assistant

The RAG (Retrieval-Augmented Generation) assistant allows you to:

1. **Upload Documents**: Add PDFs, Word documents, PowerPoint presentations, HTML, or plain text files to your document store.
2. **Query with AI**: Ask natural language questions and the assistant will search the uploaded documents and provide answers with source citations.
3. **Language Support**: Request answers in multiple languages (Spanish, French, German, Chinese, etc.) or use "both" mode for original + translated output.

**Access**: Navigate to the RAG Assistant from the homepage or use the `/rag` route.

### Campus Route Planner

The route planner computes optimal paths across campus using a graph-based shortest-path algorithm:

- **Building Selection**: Enter a sequence of building codes (e.g., "CS1 → LIB → SCI2") to plan multi-stop routes.
- **Shortest Path**: Uses Dijkstra's algorithm with customizable parameters:
  - Walking speed (default ~1.4 m/s)
  - Terrain penalties (stairs, steep slopes, covered areas)
  - Edge blocking for closed pathways
- **Visual Feedback**: Routes are drawn on an interactive campus map with distances and estimated travel times.
- **Campus Graph**: Loads pre-configured campus topology from `resources/campus-graph-*.json`.

**Access**: Visit `/planner` or use the "Planner" link from the homepage.

### Map Annotator Tool

The annotator is an interactive canvas tool for creating and editing campus map visualizations:

- **Image Management**: Load campus map images (PNG/JPEG) or import previously saved annotations (JSON).
- **Annotation Tools**:
  - **Buildings**: Click to mark building locations and assign names/codes.
  - **Paths**: Draw lines connecting buildings to represent walkways.
  - **Zones**: Define regions for different campus areas.
  - **Labels**: Add text annotations and metadata.
- **Coordinate Calibration**: Calibrate pixel coordinates to real-world distances using reference points.
- **Export**: Save annotations as JSON for reuse or integration with the route planner.
- **Undo/Redo**: Full undo/redo support for all edits.

**Access**: Click "Use Custom Map Annotator" from the planner page, or navigate to `/planner/annotator`.

---

## Docker Setup (Deprecated - Use Running Instructions Above)

This project includes a Dockerfile for containerized deployment, ensuring consistent behavior across different operating systems.

### Prerequisites

- Docker installed on your system ([Install Docker](https://docs.docker.com/get-docker/))

### Docker Image Details

- **Base Image:** Python 3.12-slim
- **Working Directory:** `/app`
- **Exposed Port:** 5000
- **Installed System Packages:** build-essential, libxml2-dev, libxslt1-dev, zlib1g-dev
- **Persistent Volumes:** `/app/api_keys`, `/app/rag_documents`, `/app/resources`

The Dockerfile automatically:
- Installs all Python dependencies from `requirements.txt`
- Sets up the Flask application environment
- Copies application code and configuration
- Marks data directories as volumes for persistence

**Note:** Use Options 2, 3, or 4 above for running with Docker instead of manual docker commands.

