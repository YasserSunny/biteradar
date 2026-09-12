# Use Astral's official uv image to provide the uv binary
FROM ghcr.io/astral-sh/uv:latest AS uv

# Python 3.12 slim base
FROM python:3.12-slim-bookworm

# Install uv from the build stage
COPY --from=uv /uv /uvx /bin/

# Set working directory
WORKDIR /app

# Optimize uv and Python execution
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV PYTHONUNBUFFERED=1

# Install dependencies with lockfile (layer cached)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Add virtual environment to PATH
ENV PATH="/app/.venv/bin:$PATH"

# Copy application source code
COPY . .

# Google Cloud Run default port
EXPOSE 8080

# Run uvicorn bound to 0.0.0.0 and dynamic $PORT provided by Cloud Run
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
