# Add to Zotero — MCP Server

A minimal MCP server that lets Claude create items in your Zotero library.

## Features

- Create any Zotero item type (articles, books, webpages, blog posts, etc.)
- Attach PDFs from URLs
- Save webpage snapshots
- Add to collections
- Apply tags

## Quick Start

```bash
cd add-to-zotero-mcp
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python configure.py
```

The setup script will guide you through entering your Zotero credentials and configuring Claude Desktop.

## Manual Setup

### 1. Get Zotero API Credentials

1. Go to https://www.zotero.org/settings/keys
2. Create a new API key with write access
3. Note your **Library ID** (shown at the top of the page, e.g., "12345678")

### 2. Install

```bash
cd add-to-zotero-mcp

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure Credentials

**Option A: `.env` file** (recommended for development)

Create a `.env` file in this directory:
```
ZOTERO_API_KEY=your_api_key_here
ZOTERO_LIBRARY_ID=your_library_id_here
```

**Option B: Claude Desktop config** (recommended for production)

Add to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "add-to-zotero": {
      "command": "/path/to/add-to-zotero-mcp/.venv/bin/python",
      "args": ["/path/to/add-to-zotero-mcp/server.py"],
      "env": {
        "ZOTERO_API_KEY": "your_api_key_here",
        "ZOTERO_LIBRARY_ID": "your_library_id_here"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

The "add-to-zotero" tools should now appear.

## Usage

Once connected, you can ask Claude to:

- "Add this article to my Zotero library" (give it a URL)
- "Create a Zotero entry for this paper with the PDF"
- "Save this to Zotero as a blog post"
- "Save a snapshot of this webpage to Zotero"

## Available Tools

| Tool | Description |
|------|-------------|
| `create_zotero_item` | Create a new item with metadata and optional PDF |
| `attach_pdf_from_url` | Attach a PDF to an existing item |
| `attach_snapshot` | Save a webpage as an HTML snapshot |
| `list_collections` | List your Zotero collections |
| `get_item_types` | List supported item types |

## Item Types

- `article` / `journal` → Journal Article
- `book` → Book
- `chapter` → Book Section
- `conference` → Conference Paper
- `thesis` → Thesis
- `report` → Report
- `webpage` → Web Page
- `blog` → Blog Post
- `news` → Newspaper Article
- `magazine` → Magazine Article
- `document` → Document
- `legal` → Statute
- `case` → Case
- `patent` → Patent
- `video` → Video Recording
- `podcast` → Podcast
- `presentation` → Presentation

## Example Workflow

1. You: "Add this to Zotero: https://example.com/article"
2. Claude: Fetches the URL, extracts metadata
3. Claude: Calls `create_zotero_item` with the extracted data
4. Item appears in your Zotero library (syncs automatically)

## Troubleshooting

**"Missing ZOTERO_API_KEY"**  
→ Check your `.env` file or Claude Desktop config has the env variables set correctly

**"Invalid item type"**  
→ Use one of the supported types listed above

**PDF attachment fails**  
→ Some sites block automated downloads; try a direct PDF URL

## License

MIT
