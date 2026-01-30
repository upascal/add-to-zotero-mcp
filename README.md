# Add to Zotero — MCP Server

A Node.js MCP server that lets Claude save items to your Zotero library. Built for non-standard sources — primary documents, government PDFs, obscure webpages — where Claude acts as the intelligence layer for metadata extraction.

## Features

- Create any Zotero item type (articles, books, webpages, reports, legal docs, etc.)
- Attach PDFs from URLs
- Save webpage snapshots
- Organize into collections
- Apply descriptive tags

## Quick Start (Setup App)

The easiest way to get started is with the setup app:

1. Open the **Add to Zotero — Setup** app from `setup-app/`
2. Enter your Zotero API credentials (see below)
3. The app tests your connection and configures Claude Desktop automatically

To build and run the setup app:

```bash
cd setup-app
npm install
npm start
```

## Manual Setup

### 1. Get Zotero API Credentials

1. Go to https://www.zotero.org/settings/keys
2. Note your **Library ID** (shown at the top: "Your userID for use in API calls is: XXXXXX")
3. Create a new API key with **write access** to your library

### 2. Install Dependencies

```bash
cd server
npm install
```

### 3. Configure Claude Desktop

Add to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "add-to-zotero": {
      "command": "node",
      "args": ["/path/to/add-to-zotero-mcp/server/index.js"],
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
| `get_zotero_help` | Get workflow instructions |
| `prepare_url_for_zotero` | Get fetch instructions for a URL |
| `save_to_zotero` | Create an item with metadata and optional PDF/snapshot |
| `attach_pdf_from_url` | Attach a PDF to an existing item |
| `attach_snapshot` | Save a webpage as an HTML snapshot |
| `list_zotero_collections` | List your Zotero collections/folders |
| `get_zotero_item_types` | List supported item types |

## Item Types

- `article` / `journal` — Journal Article
- `book` — Book
- `chapter` — Book Section
- `conference` — Conference Paper
- `thesis` — Thesis
- `report` — Report
- `webpage` — Web Page
- `blog` — Blog Post
- `news` — Newspaper Article
- `magazine` — Magazine Article
- `document` — Document
- `legal` — Statute
- `case` — Case
- `patent` — Patent
- `video` — Video Recording
- `podcast` — Podcast
- `presentation` — Presentation

## Troubleshooting

**"Zotero not configured"**
Check that `ZOTERO_API_KEY` and `ZOTERO_LIBRARY_ID` are set in your Claude Desktop config `env` block.

**"Invalid item type"**
Use one of the supported types listed above.

**PDF attachment fails**
Some sites block automated downloads; try a direct PDF URL.

**Node.js not found**
The server requires Node.js. Install it from https://nodejs.org.

## License

MIT
