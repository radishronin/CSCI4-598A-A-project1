#!/usr/bin/env bash
set -euo pipefail

# Bash script to build and run the Docker container with volume mounts
# Creates required directories and runs the container (cross-platform where bash is available)

# Color helpers
GREEN="\e[32m"
YELLOW="\e[33m"
CYAN="\e[36m"
RED="\e[31m"
GRAY="\e[90m"
RESET="\e[0m"

echo -e "${CYAN}=== Docker Build and Run Script ===${RESET}"

# Resolve script directory (project root)
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

echo -e "\n${YELLOW}Creating directories...${RESET}"
rag_dir="$script_dir/rag_documents"
api_keys_dir="$script_dir/api_keys"

if [ ! -d "$rag_dir" ]; then
  mkdir -p "$rag_dir"
  echo -e "  ${GREEN}Created: rag_documents/${RESET}"
else
  echo -e "  ${GRAY}rag_documents/ already exists${RESET}"
fi

if [ ! -d "$api_keys_dir" ]; then
  mkdir -p "$api_keys_dir"
  echo -e "  ${GREEN}Created: api_keys/${RESET}"
else
  echo -e "  ${GRAY}api_keys/ already exists${RESET}"
fi

image_name="csci-rag-app"
container_name="csci-rag-container"

echo -e "\n${YELLOW}Building Docker image: ${image_name}${RESET}"
if ! docker build -t "$image_name" .; then
  echo -e "\n${RED}Docker build failed!${RESET}" >&2
  exit 1
fi

echo -e "${GREEN}Docker build completed successfully!${RESET}"

echo -e "\n${YELLOW}Checking for existing container...${RESET}"
if docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
  echo -e "  ${YELLOW}Stopping and removing existing container...${RESET}"
  docker stop "$container_name" 2>/dev/null || true
  docker rm "$container_name" 2>/dev/null || true
fi

# On some platforms (WSL/Git Bash on Windows) the script_dir will already be appropriate for Docker.
# Use the path as-is; Docker on Linux/macOS accepts absolute paths, Docker Desktop handles Windows paths.
rag_mount="$rag_dir"
api_keys_mount="$api_keys_dir"

echo -e "\n${YELLOW}Running Docker container: ${container_name}${RESET}"
echo -e "  Mounting rag_documents: ${GRAY}${rag_mount} -> /app/rag_documents${RESET}"
echo -e "  Mounting api_keys: ${GRAY}${api_keys_mount} -> /app/api_keys${RESET}"
echo -e "  Port mapping: ${GRAY}5000:5000${RESET}\n"

if ! docker run -d \
    --name "$container_name" \
    -p 5000:5000 \
    -v "${rag_mount}:/app/rag_documents" \
    -v "${api_keys_mount}:/app/api_keys" \
    "$image_name"; then
  echo -e "\n${RED}Docker run failed!${RESET}" >&2
  exit 1
fi

echo -e "\n${GREEN}=== Container started successfully! ===${RESET}"
echo -e "  ${CYAN}Container name: ${container_name}${RESET}"
echo -e "  ${CYAN}Application URL: http://localhost:5000${RESET}"
echo -e "\nTo view logs: ${YELLOW}docker logs -f ${container_name}${RESET}"
echo -e "To stop container: ${YELLOW}docker stop ${container_name}${RESET}"
echo -e "To remove container: ${YELLOW}docker rm ${container_name}${RESET}"

exit 0
