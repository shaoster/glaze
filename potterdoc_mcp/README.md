# PotterDoc MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes PotterDoc's REST API as semantic MCP tools, enabling LLM clients (Claude Desktop, ChatGPT, etc.) to manage your pottery catalog hands-free.

## Prerequisites

- Python 3.12+
- A running PotterDoc instance
- An API token (generated from **Settings → API Tokens** in PotterDoc)

## Installation

From the repo root:

```bash
pip install -e potterdoc_mcp/
```

Or with `uv`:

```bash
uv pip install -e potterdoc_mcp/
```

## Configuration

Set two environment variables before running:

| Variable | Default | Description |
|---|---|---|
| `POTTERDOC_API_URL` | `http://localhost:8000` | Base URL of your PotterDoc instance |
| `POTTERDOC_API_TOKEN` | *(required)* | Agent token starting with `pdagent_` |

## Running

```bash
POTTERDOC_API_URL=https://your-instance.potterdoc.com \
POTTERDOC_API_TOKEN=pdagent_... \
python -m potterdoc_mcp
```

The server communicates over **stdio** (standard MCP transport for desktop clients).

## Claude Desktop Integration

Add the following to your `claude_desktop_config.json` (usually at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "potterdoc": {
      "command": "python",
      "args": ["-m", "potterdoc_mcp"],
      "env": {
        "POTTERDOC_API_URL": "https://your-instance.potterdoc.com",
        "POTTERDOC_API_TOKEN": "pdagent_..."
      }
    }
  }
}
```

Restart Claude Desktop. You should see PotterDoc tools available in the tool panel.

## Available Tools

| Tool | Description |
|---|---|
| `list_pieces` | Search and filter pottery pieces by name, state, or tags |
| `get_piece_details` | Full detail including state history and custom fields |
| `create_piece` | Initialize a new piece in the `designed` state |
| `get_workflow_schema` | Discover available states, transitions, and required fields |
| `transition_piece` | Advance a piece through the firing workflow |
| `update_piece_metadata` | Update name, notes, sharing flag, or tags |
| `upload_piece_image` | Attach an image (by URL or base64) to a piece |
| `crop_piece_image` | Set crop bounds on a piece's image |

## Example Usage (via Claude Desktop)

> "List my bowls that are in the bisque-fired state"
> → Claude calls `list_pieces(search="bowl", state=["bisque_fired"])`

> "What states can I transition piece abc-123 to?"
> → Claude calls `get_workflow_schema()` then `get_piece_details("abc-123")`

> "Mark piece abc-123 as glazed with celadon"
> → Claude calls `get_workflow_schema()` to find required fields, then `transition_piece("abc-123", "glazed", {"glaze_type": 5})`

## Development

```bash
# Install dev dependencies
pip install -e "potterdoc_mcp/[dev]"

# Run tests
cd potterdoc_mcp && python -m pytest tests/ -v
```
