# Plan: Full Zotero MCP Server — Read, Write & Manage

## Overview

Expand the Node.js MCP server from write-only to a full Zotero management tool. Add search/retrieval tools, item management tools, and rename existing tools for consistency. Remove the Python server since we're going all-in on Node.js.

Informed by analysis of [54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp) (20 tools, Python) and [cookjohn/zotero-mcp](https://github.com/cookjohn/zotero-mcp) (16 tools, Zotero plugin). Both are read-only; ours will be the only MCP that does both read and write.

---

## Tool Renames (consistency: `verb_noun` pattern)

| Current Name | New Name |
|---|---|
| `save_to_zotero` | `save_item` |
| `attach_pdf_from_url` | `attach_pdf` |
| `attach_snapshot` | `attach_snapshot` (keep) |
| `list_zotero_collections` | `list_collections` |
| `get_zotero_help` | `get_help` |
| `get_zotero_item_types` | `get_item_types` |
| `prepare_url_for_zotero` | `prepare_url` |

---

## New Read Tools (added to `server/index.js` + `server/zotero.js`)

### 1. `search_items`
Search the library by text query, tags, item type, or collection.

**Parameters:**
- `query` (optional) — free text search (searches titles + creators by default)
- `tag` (optional) — filter by tag name (string or array for AND logic)
- `item_type` (optional) — filter by item type (e.g. "article", "book")
- `collection_id` (optional) — limit to a specific collection
- `sort` (optional, default: `dateModified`) — sort field
- `direction` (optional, default: `desc`) — sort direction
- `limit` (optional, default: 25) — max results (1-100)
- `offset` (optional, default: 0) — pagination offset

**Returns:** Array of items with key, title, item type, creators, date, tags, and URL. Includes total count for pagination.

**Implementation:** Uses `zotero-api-client` chaining:
```js
zot.items().get({ q, tag, itemType, sort, direction, limit, start: offset })
```

### 2. `get_item`
Get full metadata for a single item by its key, including child attachment summary.

**Parameters:**
- `item_key` (required) — the Zotero item key

**Returns:** Full item metadata (title, creators, date, abstract, tags, URL, collections, etc.) plus a `children` summary listing attachment keys/types and note keys — so Claude knows what's available without a separate call.

**Implementation:**
- `zot.items(itemKey).get()` for metadata
- `zot.items(itemKey).children().get()` for children summary

### 3. `get_item_fulltext`
Get the full-text content of an item (extracted text from PDFs, notes, etc.).

**Parameters:**
- `item_key` (required) — the Zotero item key (of the parent item or attachment)

**Returns:** The extracted text content, if available.

**Implementation:**
- First get the item to check its type
- If it's a parent item, find its child attachments via `zot.items(itemKey).children().get()`
- For PDF/text attachments, use the Zotero full-text content API endpoint: `GET /users/{id}/items/{key}/fulltext`
- **Fallback:** If fulltext API returns empty, try fetching the first text/PDF attachment's content directly (not all items are indexed server-side)
- Return the extracted text content

### 4. `get_collection_items`
List items in a specific collection.

**Parameters:**
- `collection_id` (required) — collection key
- `sort` (optional, default: `dateModified`)
- `direction` (optional, default: `desc`)
- `limit` (optional, default: 25)
- `offset` (optional, default: 0)

**Returns:** Array of items in the collection (same format as `search_items`).

**Implementation:** `zot.collections(collectionId).items().top().get()`

### 5. `list_tags`
List all tags in the library. Useful for discovering what tags exist before filtering.

**Parameters:**
- `limit` (optional, default: 100) — max tags to return
- `offset` (optional, default: 0) — pagination offset

**Returns:** Array of tag names with item counts, sorted alphabetically.

**Implementation:** `zot.tags().get({ limit, start: offset })`

### 6. `get_recent_items`
Get recently added or modified items.

**Parameters:**
- `limit` (optional, default: 10) — max results (1-50)
- `sort` (optional, default: `dateAdded`) — `dateAdded` or `dateModified`

**Returns:** Array of items (same format as `search_items`), sorted by recency.

**Implementation:** `zot.items().top().get({ sort, direction: 'desc', limit })`

---

## New Write/Manage Tools

### 7. `create_note`
Create a new note attached to an existing item. Lets Claude annotate items with analysis, summaries, or observations.

**Parameters:**
- `item_key` (required) — parent item key to attach the note to
- `content` (required) — note text (supports HTML)
- `tags` (optional) — array of tag strings to apply to the note

**Returns:** Confirmation with the new note's item key.

**Implementation:**
- Get note template via `getItemTemplate('note')`
- Set `parentItem`, `note` (HTML content), and `tags`
- Create via `zot.items().post([template])`

### 8. `update_item`
Update metadata on an existing item — fix titles, add/remove tags, change collections, update abstracts.

**Parameters:**
- `item_key` (required) — the item to update
- `title` (optional) — new title
- `tags` (optional) — replacement tag array (replaces all tags)
- `add_tags` (optional) — tags to add (preserves existing)
- `remove_tags` (optional) — tags to remove
- `collections` (optional) — replacement collection array
- `abstract` (optional) — new abstract
- `date` (optional) — new date
- `extra` (optional) — new Extra field content

**Returns:** Confirmation with updated item summary.

**Implementation:**
- Fetch current item via `zot.items(itemKey).get()` to get version
- Merge changes into existing data
- `zot.items(itemKey).patch(version, changes)` or `.put()`
- For `add_tags`/`remove_tags`, merge with existing tag array before sending

---

## Design Improvements (applied across all tools)

### Pagination
All list/search tools include `limit` + `offset`. Responses include `totalResults` count from Zotero API headers when available.

### nextSteps hints in write responses
Save/attach tool responses include contextual guidance:
```json
{
  "success": true,
  "item_key": "ABC123",
  "message": "Item saved to 'Research' collection",
  "nextSteps": [
    "Use attach_pdf or attach_snapshot to preserve the source",
    "Use create_note to add analysis or summary"
  ]
}
```

### Shared `formatItemSummary` helper
Reusable function that extracts a clean summary from raw Zotero API responses. Used by `search_items`, `get_collection_items`, `get_recent_items`, and `get_item` (for the compact format). Returns:
```json
{
  "key": "ABC123",
  "title": "...",
  "itemType": "journalArticle",
  "creators": "Smith, J; Doe, A",
  "date": "2024",
  "tags": ["tag1", "tag2"],
  "url": "https://..."
}
```

---

## Changes to Existing Files

### `server/zotero.js`
Add new exported functions:
- `searchItems(apiKey, libraryId, { query, tag, itemType, collectionId, sort, direction, limit, offset })`
- `getItem(apiKey, libraryId, itemKey)` — returns metadata + children summary
- `getItemFulltext(apiKey, libraryId, itemKey)` — with fallback to attachment content
- `getCollectionItems(apiKey, libraryId, collectionId, { sort, direction, limit, offset })`
- `listTags(apiKey, libraryId, { limit, offset })`
- `getRecentItems(apiKey, libraryId, { limit, sort })`
- `createNote(apiKey, libraryId, parentItemKey, content, tags)`
- `updateItem(apiKey, libraryId, itemKey, changes)`

Add helper:
- `formatItemSummary(rawItem)` — shared result formatter

Rename existing exports to match new tool names.

### `server/index.js`
- Import all new functions
- Register 8 new tools with schemas and handlers
- Rename existing 6 tool registrations to match new names
- Update `get_help` to list all tools organized by category (Search, Read, Write, Manage, Utility)
- Add `nextSteps` to save/attach responses

### `CLAUDE.md`
- Update tool list and workflow docs
- Add read/search workflow guidance
- Document the full 14-tool inventory organized by category

---

## Removal

### Delete Python files
- Remove `server.py`
- Remove `requirements.txt`
- Remove `configure.py` and `credentials.py`

---

## Final Tool Inventory (14 tools)

**Search & Browse:**
1. `search_items` — keyword search with tag/type/collection filtering
2. `get_collection_items` — items in a specific collection
3. `get_recent_items` — recently added/modified items
4. `list_collections` — all collections (existing, renamed)
5. `list_tags` — all tags in library

**Read:**
6. `get_item` — full metadata + children summary
7. `get_item_fulltext` — extracted text content

**Write:**
8. `save_item` — create new item with metadata + attachments (existing, renamed)
9. `attach_pdf` — attach PDF to existing item (existing, renamed)
10. `attach_snapshot` — attach webpage snapshot (existing)
11. `create_note` — create note on existing item
12. `update_item` — modify metadata/tags on existing item

**Utility:**
13. `get_help` — workflow instructions (existing, renamed)
14. `get_item_types` — list valid item types (existing, renamed)

---

## What We're NOT Doing
- No semantic search / embeddings — that's a separate project
- No mode-based result control (minimal/preview/standard/complete) — interesting idea, revisit later
- No full PDF binary download — just the extracted text via Zotero's fulltext API
- No annotation support yet — would love to add later
- No batch operations — keep it simple for now
