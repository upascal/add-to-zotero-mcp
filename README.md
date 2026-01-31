
# Add to Zotero — MCP Server

A Node.js MCP server that lets Claude **read, write, and manage** items in your Zotero library. Built for non-standard sources — primary documents, government PDFs, obscure webpages — where Claude acts as the intelligence layer for metadata extraction.

## Features

- **Search & browse** your existing library
- **Create** any Zotero item type (articles, books, webpages, reports, legal docs, etc.)
- **Attach** PDFs from URLs or save webpage snapshots
- **Add notes** and update metadata on existing items
- **Organize** into collections with descriptive tags

## Quick Start (Setup App)

The easiest way to get started is with the setup app:

<p align="center">
  <img src="readme-assets/ConfigureZotero.png" width="400" alt="Setup form" />
  <img src="readme-assets/SuccessfulConfiguration.png" width="400" alt="Setup success" />
</p>

1. Open the setup app from `setup-app/`
2. Enter your Zotero API credentials
3. Click **Test Connection** to verify
4. Click **Save & Configure Claude Desktop**
5. Click **Restart Claude Desktop** to load the new configuration

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

- "Search my Zotero for papers about machine learning"
- "Add this article to my Zotero library" (give it a URL)
- "Create a Zotero entry for this paper with the PDF"
- "Add a note summarizing this paper"
- "Tag this item with 'important' and 'to-read'"

## Available Tools (14 total)

### Search & Browse
| Tool | Description |
|------|-------------|
| `search_items` | Search by text, tags, type, or collection |
| `get_collection_items` | List items in a specific collection |
| `get_recent_items` | Recently added/modified items |
| `list_collections` | All collections (folders) |
| `list_tags` | All tags in library |

### Read
| Tool | Description |
|------|-------------|
| `get_item` | Full metadata + children summary |
| `get_item_fulltext` | Extracted text content (from PDFs, etc.) |

### Write
| Tool | Description |
|------|-------------|
| `save_item` | Create item with metadata + attachments |
| `attach_pdf` | Attach PDF to existing item |
| `attach_snapshot` | Attach webpage snapshot |
| `create_note` | Add note to existing item |
| `update_item` | Modify metadata/tags |

### Utility
| Tool | Description |
|------|-------------|
| `get_help` | Workflow instructions |
| `get_item_types` | List valid item types |
| `prepare_url` | Get fetch instructions for a URL |

## Item Types

`article` / `journal`, `book`, `chapter`, `conference`, `thesis`, `report`, `webpage`, `blog`, `news`, `magazine`, `document`, `legal`, `case`, `patent`, `video`, `podcast`, `presentation`

## Troubleshooting

**"Zotero not configured"** — Check that `ZOTERO_API_KEY` and `ZOTERO_LIBRARY_ID` are set in your Claude Desktop config.

**"Invalid item type"** — Use one of the supported types listed above.

**PDF attachment fails** — Some sites block automated downloads; try a direct PDF URL.

**Node.js not found** — Install from https://nodejs.org.

## License

MIT
