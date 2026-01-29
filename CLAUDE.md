# Add to Zotero MCP — Project Context

## Purpose

This MCP server enables Claude to save items to the user's Zotero library. It's designed for **non-standard information sources** — primary source materials, government documents, webpages, obscure PDFs — where automated metadata extraction fails.

The key insight: **Claude is the intelligence layer**. Unlike typical Zotero integrations that rely on structured metadata, this MCP leverages Claude's ability to:
- Read and understand unstructured documents
- Extract bibliographic information from messy sources
- Determine the appropriate item type (report, legal document, webpage, etc.)
- Identify abstracts, authors, and dates that aren't in standard formats

## Design Philosophy

1. **Claude does extraction** — The MCP provides fetching and saving tools, but Claude interprets the content
2. **Thorough metadata** — Always aim to capture: title, authors, date, abstract, publisher, URL, and a snapshot/PDF
3. **Preserve sources** — Attach snapshots for webpages, PDFs for documents (sources may disappear)
4. **Use collections** — Ask the user which collection/folder if unclear

## Recommended Workflow

When adding a URL or document to Zotero:

1. **Fetch the content** — Use web tools to get the full text
2. **Extract metadata** — Use your intelligence to identify:
   - Title
   - Author(s) — may be an organization, government body, or individual
   - Publication date (even if approximate)
   - Abstract or summary (write one if not present)
   - Publisher or website name
   - Item type (webpage, report, legal, document, etc.)
   - **2-5 descriptive tags** based on content topics
3. **Assess your confidence** — See approval rules below
4. **Find the right collection** — Call `list_collections`; ask user if multiple options
5. **Create the item with attachment** — Call `create_zotero_item` with:
   - All extracted metadata
   - `pdf_url` if a PDF is available (preferred)
   - `snapshot_url` for webpages (used if no PDF)

## Confidence-Based Approval

**Proceed automatically if:**
- Source has clear, unambiguous metadata (title, author, date all found)
- Academic paper with DOI, news article with byline, blog post with author
- You're confident in your extraction (no guessing)
- User specified which collection to use

**Ask for approval if:**
- Source is messy or ambiguous (government PDF, scanned document, old webpage)
- You had to guess or infer significant metadata (author unclear, date approximate)
- Multiple possible interpretations exist
- No clear collection match — show options and ask
- You wrote an abstract because none existed (let user verify it's accurate)

When asking, show a brief summary:
> "I extracted: **Title**, by **Author** (Date). Abstract: ... 
> Save to 'Collection Name'?"

## Available Tools

- `get_zotero_help` — Get workflow instructions (call when unsure)
- `prepare_url_for_zotero` — Start here for URLs! Returns fetch instructions (don't open tabs!)
- `setup_zotero_step1_library_id` — First step of Zotero setup
- `setup_zotero_step2_api_key` — Second step (validates & saves credentials)
- `save_to_zotero` — Save an item with metadata and attachments
- `list_zotero_collections` — Find collection IDs
- `get_zotero_item_types` — See valid item types
- `attach_pdf_from_url` — Add PDF to existing item
- `attach_snapshot` — Add webpage snapshot to existing item

## First-Time Setup / Configuration Errors

If Zotero isn't configured or there's a connection error, guide the user step-by-step:

**Step 1:** Call `setup_zotero_step1_library_id`
> "I need to connect to your Zotero. What's your Library ID?  
> Find it at https://www.zotero.org/settings/keys — look for 'Your userID for use in API calls is: XXXXXX'"

**Step 2:** After step 1 succeeds, call `setup_zotero_step2_api_key`
> "Got it! Now I need your API key. On the same page, create a new private key (check 'Allow library access'). Copy it carefully — it's only shown once!"

**Step 3:** If success → confirm and proceed. If failure → suggest double-checking and retry.

**Important:** Never echo the API key back to the user — treat it as a secret.
