FROM python:3.12-slim
WORKDIR /app
COPY . ./potterdoc_mcp/
RUN pip install --no-cache-dir ./potterdoc_mcp/
EXPOSE 8080
CMD ["python", "-m", "potterdoc_mcp", "--transport", "http"]
