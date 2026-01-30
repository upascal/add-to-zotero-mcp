# Plan: Add Read/Search Tools + Remove Python Server

## Overview

Add basic query/retrieval tools to the Node.js MCP server so Claude can search your Zotero library and read items. Also remove the Python server since we're going all-in on Node.js.

## New Tools (added to `server/index.js` + `server/zotero.js`)

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

**Returns:** Array of items with key, title, item type, creators, date, tags, and URL.

**Implementation:** Uses `zotero-api-client` chaining:
```js
zot.items().get({ q, tag, itemType, sort, direction, limit })
```

### 2. `get_item`
Get full metadata for a single item by its key.

**Parameters:**
- `item_key` (required) — the Zotero item key

**Returns:** Full item metadata (title, creators, date, abstract, tags, URL, collections, etc.)

**Implementation:** `zot.items(itemKey).get()`

### 3. `get_item_fulltext`
Get the full-text content of an item (extracted text from PDFs, notes, etc.).

**Parameters:**
- `item_key` (required) — the Zotero item key (of the parent item or attachment)

**Returns:** The extracted text content, if available.

**Implementation:**
- First get the item to check its type
- If it's a parent item, find its child attachments via `zot.items(itemKey).children().get()`
- For PDF/text attachments, use the Zotero full-text content API endpoint: `GET /users/{id}/items/{key}/fulltext`
- Return the extracted text content

### 4. `get_collection_items`
List items in a specific collection (extends existing `list_zotero_collections`).

**Parameters:**
- `collection_id` (required) — collection key
- `sort` (optional, default: `dateModified`)
- `direction` (optional, default: `desc`)
- `limit` (optional, default: 25)

**Returns:** Array of items in the collection (same format as `search_items`).

**Implementation:** `zot.collections(collectionId).items().top().get()`

## Changes to Existing Files

### `server/zotero.js`
Add 4 new exported functions:
- `searchItems(apiKey, libraryId, { query, tag, itemType, collectionId, sort, direction, limit })`
- `getItem(apiKey, libraryId, itemKey)`
- `getItemFulltext(apiKey, libraryId, itemKey)`
- `getCollectionItems(apiKey, libraryId, collectionId, { sort, direction, limit })`

Add a helper `formatItemSummary(rawItem)` to extract a clean summary object from raw API responses (reused across search/list tools).

### `server/index.js`
- Import the 4 new functions
- Register 4 new tools with schemas and handlers
- Update `get_zotero_help` to list the new retrieval tools

### `CLAUDE.md`
- Update tool list and workflow docs to mention the new read tools

## Removal

### Delete `server.py`
- Remove the Python MCP server entirely
- Remove `requirements.txt`
- Remove `configure.py` and `credentials.py` (Python-only config utilities)

## What We're NOT Doing
- No semantic search / embeddings — that's a separate project
- No item creation/update from the read tools — existing save tools handle that
- No full PDF binary download — just the extracted text via Zotero's fulltext API
- No annotation support yet — can add later
