# Use Python 3.12 slim as base image
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for the application
# - build-essential: for compiling Python packages
# - libxml2-dev, libxslt1-dev: for lxml (XML/HTML parsing)
# - zlib1g-dev: for PDF processing
RUN apt-get update && apt-get install -y \
    build-essential \
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file first (for better Docker layer caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY app.py .
COPY templates/ ./templates/
COPY static/ ./static/

# Copy API keys and RAG documents directories
# These will be included in the image so they persist across container instances
# Note: Ensure directories exist first, then copy their contents
RUN mkdir -p api_keys rag_documents
COPY api_keys/ ./api_keys/
COPY rag_documents/ ./rag_documents/

# Expose Flask default port
EXPOSE 5000

# Set environment variables for Flask
ENV FLASK_APP=app.py
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1

# Run Flask application
# Use 0.0.0.0 to make it accessible from outside the container
CMD ["python", "-m", "flask", "run", "--host=0.0.0.0", "--port=5000"]

