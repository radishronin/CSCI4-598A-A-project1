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

3. **Install the required Python dependencies:**

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

