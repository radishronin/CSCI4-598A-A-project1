# PowerShell script to build and run the Docker container with volume mounts
# This script creates necessary directories and runs the container

Write-Host "=== Docker Build and Run Script ===" -ForegroundColor Cyan

# Get the script directory (project root)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Create directories if they don't exist
Write-Host "`nCreating directories..." -ForegroundColor Yellow
$ragDir = Join-Path $scriptDir "rag_documents"
$apiKeysDir = Join-Path $scriptDir "api_keys"

if (-not (Test-Path $ragDir)) {
    New-Item -ItemType Directory -Path $ragDir | Out-Null
    Write-Host "  Created: rag_documents/" -ForegroundColor Green
} else {
    Write-Host "  rag_documents/ already exists" -ForegroundColor Gray
}

if (-not (Test-Path $apiKeysDir)) {
    New-Item -ItemType Directory -Path $apiKeysDir | Out-Null
    Write-Host "  Created: api_keys/" -ForegroundColor Green
} else {
    Write-Host "  api_keys/ already exists" -ForegroundColor Gray
}

# Docker image name
$imageName = "csci-rag-app"
$containerName = "csci-rag-container"

# Build the Docker image
Write-Host "`nBuilding Docker image: $imageName" -ForegroundColor Yellow
docker build -t $imageName .

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nDocker build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Docker build completed successfully!" -ForegroundColor Green

# Stop and remove existing container if it exists
Write-Host "`nChecking for existing container..." -ForegroundColor Yellow
$existingContainer = docker ps -a --filter "name=$containerName" --format "{{.Names}}"
if ($existingContainer -eq $containerName) {
    Write-Host "  Stopping and removing existing container..." -ForegroundColor Yellow
    docker stop $containerName 2>$null
    docker rm $containerName 2>$null
}

# Convert paths to Windows format for Docker (if needed)
# Docker on Windows can handle both forward and backslashes, but let's use forward slashes
$ragDirMount = $ragDir -replace '\\', '/'
$apiKeysDirMount = $apiKeysDir -replace '\\', '/'

# Run the Docker container with volume mounts
Write-Host "`nRunning Docker container: $containerName" -ForegroundColor Yellow
Write-Host "  Mounting rag_documents: $ragDirMount -> /app/rag_documents" -ForegroundColor Gray
Write-Host "  Mounting api_keys: $apiKeysDirMount -> /app/api_keys" -ForegroundColor Gray
Write-Host "  Port mapping: 5000:5000" -ForegroundColor Gray
Write-Host ""

docker run -d `
    --name $containerName `
    -e "FLASK_ENV=development" `
    -e "FLASK_DEBUG=1" `
    -e "DEBUG_LOG=1" `
    -e "RAG_DEBUG=1" `
    -e "RAG_RETRIEVE_DEBUG=1" `
    -e "MOCK_LLM=0" `
    -p 5000:5000 `
    -v "${ragDirMount}:/app/rag_documents" `
    -v "${apiKeysDirMount}:/app/api_keys" `
    $imageName

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nDocker run failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Container started successfully! ===" -ForegroundColor Green
Write-Host "  Container name: $containerName" -ForegroundColor Cyan
Write-Host "  Application URL: http://localhost:5000" -ForegroundColor Cyan
Write-Host "`nTo view logs: docker logs -f $containerName" -ForegroundColor Yellow
Write-Host "To stop container: docker stop $containerName" -ForegroundColor Yellow
Write-Host "To remove container: docker rm $containerName" -ForegroundColor Yellow

