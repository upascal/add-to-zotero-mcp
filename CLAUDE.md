# Zotero Assistant MCP — Project Context

## Purpose

This MCP server enables Claude to **read, write, and manage** items in the user's Zotero library. It's designed for **non-standard information sources** — primary source materials, government documents, webpages, obscure PDFs — where automated metadata extraction fails.

The key insight: **Claude is the intelligence layer**. Unlike typical Zotero integrations that rely on structured metadata, this MCP leverages Claude's ability to:
- Read and understand unstructured documents
- Extract bibliographic information from messy sources
- Determine the appropriate item type (report, legal document, webpage, etc.)
- Search and analyze the user's existing library

## Design Philosophy

1. **Claude does extraction** — The MCP provides fetching and saving tools, but Claude interprets the content
2. **Thorough metadata** — Always aim to capture: title, authors, date, abstract, publisher, URL, and a snapshot/PDF
3. **Preserve sources** — Attach snapshots for webpages, PDFs for documents (sources may disappear)
4. **Use collections** — Ask the user which collection/folder if unclear
5. **Avoid duplicates** — Search before creating new items

## Available Tools (14 total)

### Search & Browse
- `search_items` — Search library by text, tags, type, or collection
- `get_collection_items` — List items in a specific collection
- `get_recent_items` — Recently added/modified items
- `list_collections` — All collections (folders) in the library
- `list_tags` — All tags in library

### Read
- `get_item` — Full metadata + children summary for a single item
- `get_item_fulltext` — Extracted text content (from PDFs, notes, etc.)

### Write
- `save_item` — Create new item with metadata + attachments
- `attach_pdf` — Attach PDF to existing item
- `attach_snapshot` — Attach webpage snapshot to existing item
- `create_note` — Create note on existing item (for analysis/summaries)
- `update_item` — Modify metadata/tags on existing item

### Utility
- `get_help` — Workflow instructions (call when unsure)
- `get_item_types` — List valid item types
- `prepare_url` — Get fetch instructions for a URL

## Recommended Workflow

### Adding a URL or document to Zotero:

1. **Check for duplicates** — Call `search_items` with keywords from the title
2. **Fetch the content** — Use your web tools to get the full text (DO NOT open browser tabs)
3. **Extract metadata** — Use your intelligence to identify:
   - Title, Author(s), Publication date, Abstract (write one if missing)
   - Publisher or website name, Item type, **2-5 descriptive tags**
4. **Find the right collection** — Call `list_collections`; ask user if multiple options match
5. **Assess your confidence** — See approval rules below
6. **Create the item** — Call `save_item` with all metadata and `pdf_url` or `snapshot_url`

### After saving:
- Use `create_note` to add your analysis or summary
- Use `get_item` to verify the saved metadata

## Confidence-Based Approval

**Proceed automatically if:**
- Source has clear, unambiguous metadata (title, author, date all found)
- Academic paper with DOI, news article with byline, blog post with author
- You're confident in your extraction (no guessing)
- User specified which collection to use

**Ask for approval if:**
- Source is messy or ambiguous (government PDF, scanned document, old webpage)
- You had to guess or infer significant metadata
- Multiple possible interpretations exist
- No clear collection match — show options and ask
- You wrote an abstract because none existed

When asking, show a brief summary:
> "I extracted: **Title**, by **Author** (Date). Abstract: ... 
> Save to 'Collection Name'?"

## Configuration

The server requires two environment variables:
- `ZOTERO_API_KEY` — Your Zotero API key
- `ZOTERO_LIBRARY_ID` — Your Zotero user library ID

Get both from: https://www.zotero.org/settings/keys
