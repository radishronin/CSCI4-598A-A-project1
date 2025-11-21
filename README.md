# Full-Stack LLMs Vibe Coding Project

This project demonstrates the integration of large language models (LLMs) with a full-stack web application using Flask. It provides a simple interface to interact with the backend, built using Python and Flask, and a front-end powered by HTML templates.

---

## Setup

To set up the project locally, follow these steps:

1. **Create a virtual environment:**

   ```bash
   python3 -m venv venv
   ```

2. **Activate the virtual environment:**

     ```bash
     source venv/bin/activate
     ```

3. **Optional: Install the required Python dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

## Configuration

### `app.py`

* `app.py` is the main entry point for the Flask application. It handles the communication between the frontend (HTML templates) and the backend (Python code). Ensure that you configure any necessary environment variables (e.g., API keys, secrets) and Flask settings in this file.

### `templates/`

* The `templates/` directory contains all the HTML templates used by the application. You can modify or add new templates here to customize the frontend.

## Usage

Once the setup is complete, you can start the Flask application:

1. **Run the Flask development server:**

   ```bash
   flask run
   ```

---

## Docker Setup (Recommended)

This project includes a Dockerfile for containerized deployment, ensuring consistent behavior across different operating systems.

### Prerequisites

- Docker installed on your system ([Install Docker](https://docs.docker.com/get-docker/))

### Building the Docker Image

Build the Docker image from the project root directory:
NOTE: Be sure that all directories specified in the Dockerfile exist before building (even if empty)!

```bash
docker build -t llm-app .
```

### Running the Container

#### Basic Run

Run the container with basic configuration:

```bash
docker run -p 5000:5000 llm-app
```

The application will be available at `http://localhost:5000`.

#### Run with Persistent Storage

To persist API keys and RAG documents across container restarts, use volume mounts:

```bash
docker run -p 5000:5000 \
  -v $(pwd)/api_keys:/app/api_keys \
  -v $(pwd)/rag_documents:/app/rag_documents \
  llm-app
```

**Note:** On Windows PowerShell, use the provided script `docker-run.ps1`.

For Bash or POSIX-compatible shells (Linux, macOS, WSL, Git Bash), a convenience script
is also included: `docker-run.sh`.

Make the script executable and run it from the project root:

```bash
chmod +x docker-run.sh
./docker-run.sh
```

The Bash script mirrors the PowerShell script's behavior: it creates `api_keys/` and
`rag_documents/` if missing, builds the Docker image, stops/removes any existing
`csci-rag-container`, and runs the container with the correct volume mounts and port mapping.

### Container Management

- **Stop the container:** Press `Ctrl+C` or run `docker stop <container_id>`
- **Run in detached mode:** Add `-d` flag: `docker run -d -p 5000:5000 llm-app`
- **View logs:** `docker logs <container_id>`
- **List running containers:** `docker ps`
- **Remove container:** `docker rm <container_id>`

### Docker Image Details

- **Base Image:** Python 3.12-slim
- **Working Directory:** `/app`
- **Exposed Port:** 5000
- **Installed System Packages:** build-essential, libxml2-dev, libxslt1-dev, zlib1g-dev

The Dockerfile automatically:
- Installs all Python dependencies from `requirements.txt`
- Sets up the Flask application environment
- Configures the application to be accessible from outside the container

---

