/**
 * Zotero API helper — thin wrapper around zotero-api-client.
 *
 * Provides the same operations as the Python server (server.py) but in JS.
 * Every public function returns a plain object suitable for MCP tool responses.
 */

import zoteroApiClient from "zotero-api-client";
const api = zoteroApiClient.default || zoteroApiClient;

// -------------------------------------------------------------------------
// Item type mapping (mirrors server.py ITEM_TYPE_MAP)
// -------------------------------------------------------------------------

const ITEM_TYPE_MAP = {
  article: "journalArticle",
  journal: "journalArticle",
  book: "book",
  chapter: "bookSection",
  conference: "conferencePaper",
  thesis: "thesis",
  report: "report",
  webpage: "webpage",
  blog: "blogPost",
  news: "newspaperArticle",
  magazine: "magazineArticle",
  document: "document",
  legal: "statute",
  case: "case",
  patent: "patent",
  video: "videoRecording",
  podcast: "podcast",
  presentation: "presentation",
};

// -------------------------------------------------------------------------
// URL unwrapping (mirrors server.py _unwrap_url)
// -------------------------------------------------------------------------

const WRAPPER_PATTERNS =
  /pdfrenderer|pdf\.svc|htmltopdf|html2pdf|render.*pdf|pdf.*render|webshot|screenshot|snapshot|proxy\.php|fetch\.php/i;

const URL_PARAM_NAMES = ["url", "source", "target", "uri", "link", "src"];

function unwrapUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }

  const isWrapper = WRAPPER_PATTERNS.test(parsed.pathname);

  for (const param of URL_PARAM_NAMES) {
    const candidate = parsed.searchParams.get(param);
    if (!candidate) continue;
    const decoded = decodeURIComponent(candidate);
    if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
      if (isWrapper) return decoded;
      // Not a known wrapper but has a full URL param — still unwrap if the
      // outer URL looks like a service endpoint (≥ 2 path segments).
      const segments = parsed.pathname.replace(/^\/|\/$/g, "").split("/");
      if (segments.length >= 2) return decoded;
    }
  }

  return raw;
}

// -------------------------------------------------------------------------
// Zotero client factory
// -------------------------------------------------------------------------

/**
 * Create a bound Zotero API client for a user library.
 */
function zotClient(apiKey, libraryId) {
  return api(apiKey).library("user", libraryId);
}

// -------------------------------------------------------------------------
// Public helpers
// -------------------------------------------------------------------------

export function getItemTypes() {
  return Object.keys(ITEM_TYPE_MAP);
}

export function resolveItemType(simple) {
  return ITEM_TYPE_MAP[simple.toLowerCase()] || simple;
}

/**
 * Format a raw Zotero item into a clean summary object.
 */
function formatItemSummary(raw) {
  const d = raw.data || raw;
  const creators = (d.creators || [])
    .map((c) => (c.name ? c.name : `${c.firstName || ""} ${c.lastName || ""}`.trim()))
    .filter(Boolean)
    .join("; ");
  return {
    key: raw.key || d.key,
    title: d.title || "(untitled)",
    itemType: d.itemType,
    creators: creators || null,
    date: d.date || null,
    tags: (d.tags || []).map((t) => t.tag || t),
    url: d.url || null,
  };
}

/**
 * List all collections in the library.
 */
export async function listCollections(apiKey, libraryId) {
  const zot = zotClient(apiKey, libraryId);
  const response = await zot.collections().get();
  const raw = response.raw; // array of collection objects
  return raw.map((c) => ({
    key: c.key,
    name: c.data.name,
    parent: c.data.parentCollection || null,
  }));
}

/**
 * Get an item template for a given Zotero item type.
 */
export async function getItemTemplate(itemType) {
  // The template endpoint is not library-scoped
  const response = await api().template(itemType).get();
  return response.getData();
}

/**
 * Create a Zotero item with metadata, optionally attaching a PDF or snapshot.
 */
export async function createItem(
  apiKey,
  libraryId,
  {
    title,
    itemType = "webpage",
    authors = [],
    date,
    url,
    abstract,
    publication,
    volume,
    issue,
    pages,
    doi,
    tags = [],
    collectionId,
    pdfUrl,
    snapshotUrl,
    extra,
  }
) {
  const zoteroType = resolveItemType(itemType);

  // Get template
  let template;
  try {
    template = await getItemTemplate(zoteroType);
  } catch (err) {
    return { success: false, error: `Invalid item type '${zoteroType}': ${err.message}` };
  }

  // Fill template
  template.title = title;
  if (date) template.date = date;
  if (url && "url" in template) template.url = url;
  if (abstract && "abstractNote" in template) template.abstractNote = abstract;
  if (extra && "extra" in template) template.extra = extra;

  if (publication) {
    if ("publicationTitle" in template) template.publicationTitle = publication;
    else if ("blogTitle" in template) template.blogTitle = publication;
    else if ("websiteTitle" in template) template.websiteTitle = publication;
  }

  if (volume && "volume" in template) template.volume = volume;
  if (issue && "issue" in template) template.issue = issue;
  if (pages && "pages" in template) template.pages = pages;
  if (doi && "DOI" in template) template.DOI = doi;

  // Authors
  if (authors.length > 0 && "creators" in template) {
    template.creators = authors.map((name) => {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return {
          creatorType: "author",
          firstName: parts.slice(0, -1).join(" "),
          lastName: parts[parts.length - 1],
        };
      }
      return { creatorType: "author", name };
    });
  }

  // Tags
  if (tags.length > 0) {
    template.tags = tags.map((t) => ({ tag: t }));
  }

  // Collection
  if (collectionId) {
    template.collections = [collectionId];
  }

  // Create
  const zot = zotClient(apiKey, libraryId);
  try {
    const response = await zot.items().post([template]);

    const successful = response.getEntityByIndex(0);
    if (!successful) {
      return { success: false, error: `Failed to create item: ${JSON.stringify(response.raw)}` };
    }

    const itemKey = successful.key;
    const result = {
      success: true,
      item_key: itemKey,
      message: `Created ${zoteroType}: ${title}`,
    };

    // Attach PDF (takes priority)
    if (pdfUrl) {
      result.pdf_attachment = await attachPdfFromUrl(apiKey, libraryId, itemKey, pdfUrl);
    } else if (snapshotUrl) {
      result.snapshot_attachment = await attachSnapshot(apiKey, libraryId, itemKey, snapshotUrl);
    }

    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Download a PDF from a URL and attach it to an existing Zotero item.
 */
export async function attachPdfFromUrl(apiKey, libraryId, parentItemKey, pdfUrl, filename) {
  pdfUrl = unwrapUrl(pdfUrl);

  try {
    console.error(`[attach_pdf] Fetching PDF from: ${pdfUrl}`);
    const response = await fetch(pdfUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AddToZoteroMCP/1.0)" },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      return { success: false, error: `Failed to download PDF: HTTP ${response.status} ${response.statusText}` };
    }

    const contentType = response.headers.get("content-type") || "";
    console.error(`[attach_pdf] Response content-type: ${contentType}, status: ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) {
      return { success: false, error: "Downloaded PDF is empty (0 bytes)" };
    }

    // Warn if content-type doesn't look like a PDF
    const isPdfContent = contentType.includes("pdf") || contentType.includes("octet-stream");
    if (!isPdfContent) {
      console.error(`[attach_pdf] Warning: content-type "${contentType}" may not be a PDF. Buffer size: ${buffer.length}`);
    }

    // Determine filename
    if (!filename) {
      const cd = response.headers.get("content-disposition") || "";
      if (cd.includes("filename=")) {
        filename = cd.split("filename=").pop().replace(/['"]/g, "").trim();
      } else {
        filename = pdfUrl.split("/").pop().split("?")[0];
        if (!filename.endsWith(".pdf")) filename = "attachment.pdf";
      }
    }

    console.error(`[attach_pdf] Creating attachment item: ${filename} (${buffer.length} bytes)`);

    // Upload via Zotero API
    const zot = zotClient(apiKey, libraryId);
    const attachmentTemplate = {
      itemType: "attachment",
      parentItem: parentItemKey,
      linkMode: "imported_file",
      title: filename,
      contentType: "application/pdf",
      filename,
    };

    const createResp = await zot.items().post([attachmentTemplate]);
    const attachmentItem = createResp.getEntityByIndex(0);

    if (!attachmentItem) {
      const rawResp = JSON.stringify(createResp.raw || createResp);
      return { success: false, error: `Failed to create attachment item. API response: ${rawResp}` };
    }

    console.error(`[attach_pdf] Attachment item created: ${attachmentItem.key}. Uploading file content...`);

    // Upload the file content
    const uploadResp = await zot
      .items(attachmentItem.key)
      .attachment(filename, buffer, "application/pdf")
      .post();

    // Check upload response
    const uploadStatus = uploadResp?.response?.status || uploadResp?.status;
    const uploadOk = uploadResp?.response?.ok ?? uploadResp?.ok;
    console.error(`[attach_pdf] Upload response status: ${uploadStatus}, ok: ${uploadOk}`);

    if (uploadOk === false) {
      const uploadBody = JSON.stringify(uploadResp?.raw || uploadResp?.getData?.() || "unknown");
      return {
        success: false,
        error: `Attachment item created (${attachmentItem.key}) but file upload failed. Status: ${uploadStatus}. Response: ${uploadBody}`,
        attachment_key: attachmentItem.key,
      };
    }

    console.error(`[attach_pdf] Successfully attached ${filename} to ${parentItemKey}`);
    return { success: true, filename, size_bytes: buffer.length, attachment_key: attachmentItem.key };
  } catch (err) {
    console.error(`[attach_pdf] Error: ${err.message}\n${err.stack}`);
    return { success: false, error: `Failed to attach PDF: ${err.message}` };
  }
}

/**
 * Save a webpage as an HTML snapshot and attach it to an existing Zotero item.
 */
export async function attachSnapshot(apiKey, libraryId, parentItemKey, url, title) {
  url = unwrapUrl(url);

  try {
    console.error(`[attach_snapshot] Fetching page: ${url}`);
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AddToZoteroMCP/1.0)" },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      return { success: false, error: `Failed to fetch page: HTTP ${response.status} ${response.statusText}` };
    }

    const contentType = response.headers.get("content-type") || "";
    const finalUrl = response.url; // capture after redirects
    console.error(`[attach_snapshot] Response status: ${response.status}, content-type: ${contentType}, final URL: ${finalUrl}`);

    if (response.redirected) {
      console.error(`[attach_snapshot] Redirected from ${url} to ${finalUrl}`);
    }

    const html = await response.text();

    if (!html || html.length === 0) {
      return { success: false, error: "Fetched page is empty (0 bytes)" };
    }

    // Check if we got actual HTML content vs a login page or error
    const isHtml = contentType.includes("html") || html.trim().startsWith("<") || html.trim().startsWith("<!DOCTYPE");
    if (!isHtml) {
      console.error(`[attach_snapshot] Warning: response may not be HTML. Content-type: "${contentType}", first 200 chars: ${html.slice(0, 200)}`);
    }

    // Determine title
    if (!title) {
      const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      title = match ? match[1].trim() : url;
    }

    console.error(`[attach_snapshot] Page title: "${title}", HTML size: ${html.length} bytes`);

    const safeName = title.replace(/[^\w\s\-.]/g, "").slice(0, 80).trim() || "snapshot";
    const filename = `${safeName}.html`;
    const buffer = Buffer.from(html, "utf-8");

    // Upload via Zotero API
    const zot = zotClient(apiKey, libraryId);
    const attachmentTemplate = {
      itemType: "attachment",
      parentItem: parentItemKey,
      linkMode: "imported_file",
      title: title,
      contentType: "text/html",
      filename,
    };

    console.error(`[attach_snapshot] Creating attachment item: ${filename}`);
    const createResp = await zot.items().post([attachmentTemplate]);
    const attachmentItem = createResp.getEntityByIndex(0);

    if (!attachmentItem) {
      const rawResp = JSON.stringify(createResp.raw || createResp);
      return { success: false, error: `Failed to create attachment item. API response: ${rawResp}` };
    }

    console.error(`[attach_snapshot] Attachment item created: ${attachmentItem.key}. Uploading HTML content (${buffer.length} bytes)...`);

    const uploadResp = await zot
      .items(attachmentItem.key)
      .attachment(filename, buffer, "text/html")
      .post();

    // Check upload response
    const uploadStatus = uploadResp?.response?.status || uploadResp?.status;
    const uploadOk = uploadResp?.response?.ok ?? uploadResp?.ok;
    console.error(`[attach_snapshot] Upload response status: ${uploadStatus}, ok: ${uploadOk}`);

    if (uploadOk === false) {
      const uploadBody = JSON.stringify(uploadResp?.raw || uploadResp?.getData?.() || "unknown");
      return {
        success: false,
        error: `Attachment item created (${attachmentItem.key}) but file upload failed. Status: ${uploadStatus}. Response: ${uploadBody}`,
        attachment_key: attachmentItem.key,
      };
    }

    console.error(`[attach_snapshot] Successfully attached snapshot to ${parentItemKey}`);
    return { success: true, filename, title, size_bytes: buffer.length, attachment_key: attachmentItem.key };
  } catch (err) {
    console.error(`[attach_snapshot] Error: ${err.message}\n${err.stack}`);
    return { success: false, error: `Failed to attach snapshot: ${err.message}` };
  }
}

// -------------------------------------------------------------------------
// Search & Browse
// -------------------------------------------------------------------------

/**
 * Search items in the library by text query, tags, item type, or collection.
 */
export async function searchItems(
  apiKey,
  libraryId,
  { query, tag, itemType, collectionId, sort = "dateModified", direction = "desc", limit = 25, offset = 0 }
) {
  const zot = zotClient(apiKey, libraryId);
  const params = { sort, direction, limit, start: offset };

  if (query) params.q = query;
  if (tag) params.tag = Array.isArray(tag) ? tag.join(" || ") : tag;
  if (itemType) params.itemType = resolveItemType(itemType);

  try {
    let response;
    if (collectionId) {
      response = await zot.collections(collectionId).items().top().get(params);
    } else {
      response = await zot.items().top().get(params);
    }

    const totalResults = response.response?.headers?.get("Total-Results") || null;
    const items = (response.raw || [])
      .filter((r) => r.data?.itemType !== "attachment" && r.data?.itemType !== "note")
      .map(formatItemSummary);

    return { items, totalResults: totalResults ? parseInt(totalResults, 10) : items.length, offset, limit };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Get full metadata for a single item by its key, including children summary.
 */
export async function getItem(apiKey, libraryId, itemKey) {
  const zot = zotClient(apiKey, libraryId);
  try {
    const [itemResp, childrenResp] = await Promise.all([
      zot.items(itemKey).get(),
      zot.items(itemKey).children().get(),
    ]);

    const raw = itemResp.raw;
    const data = raw.data || raw;

    const children = (childrenResp.raw || []).map((c) => ({
      key: c.key,
      itemType: c.data?.itemType,
      title: c.data?.title || c.data?.note?.slice(0, 100) || null,
      contentType: c.data?.contentType || null,
    }));

    return {
      key: raw.key,
      version: raw.version,
      ...data,
      children,
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Get the full-text content of an item (extracted text from PDFs, notes, etc.).
 */
export async function getItemFulltext(apiKey, libraryId, itemKey) {
  const zot = zotClient(apiKey, libraryId);
  try {
    // First check if this item has fulltext directly
    try {
      const ftResp = await zot.items(itemKey).fulltext().get();
      const ftData = ftResp.getData?.() || ftResp.raw;
      if (ftData?.content) {
        return { item_key: itemKey, content: ftData.content, source: "fulltext_api" };
      }
    } catch {
      // No direct fulltext — try children
    }

    // Look for child attachments with fulltext
    const childrenResp = await zot.items(itemKey).children().get();
    const attachments = (childrenResp.raw || []).filter(
      (c) => c.data?.itemType === "attachment" && c.data?.contentType
    );

    for (const att of attachments) {
      try {
        const ftResp = await zot.items(att.key).fulltext().get();
        const ftData = ftResp.getData?.() || ftResp.raw;
        if (ftData?.content) {
          return {
            item_key: itemKey,
            attachment_key: att.key,
            content: ftData.content,
            source: "child_attachment_fulltext",
          };
        }
      } catch {
        continue;
      }
    }

    return { item_key: itemKey, content: null, message: "No full-text content available for this item." };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * List items in a specific collection.
 */
export async function getCollectionItems(
  apiKey,
  libraryId,
  collectionId,
  { sort = "dateModified", direction = "desc", limit = 25, offset = 0 }
) {
  const zot = zotClient(apiKey, libraryId);
  try {
    const response = await zot.collections(collectionId).items().top().get({
      sort,
      direction,
      limit,
      start: offset,
    });

    const totalResults = response.response?.headers?.get("Total-Results") || null;
    const items = (response.raw || [])
      .filter((r) => r.data?.itemType !== "attachment" && r.data?.itemType !== "note")
      .map(formatItemSummary);

    return { items, totalResults: totalResults ? parseInt(totalResults, 10) : items.length, offset, limit };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * List all tags in the library.
 */
export async function listTags(apiKey, libraryId, { limit = 100, offset = 0 }) {
  const zot = zotClient(apiKey, libraryId);
  try {
    const response = await zot.tags().get({ limit, start: offset });
    const tags = (response.raw || []).map((t) => ({
      tag: t.tag,
      numItems: t.meta?.numItems || 0,
    }));
    return { tags, offset, limit };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Get recently added or modified items.
 */
export async function getRecentItems(apiKey, libraryId, { limit = 10, sort = "dateAdded" }) {
  const zot = zotClient(apiKey, libraryId);
  try {
    const response = await zot.items().top().get({ sort, direction: "desc", limit });
    const items = (response.raw || [])
      .filter((r) => r.data?.itemType !== "attachment" && r.data?.itemType !== "note")
      .map(formatItemSummary);
    return { items };
  } catch (err) {
    return { error: err.message };
  }
}

// -------------------------------------------------------------------------
// Collections
// -------------------------------------------------------------------------

/**
 * Create a new collection (folder) in the library.
 */
export async function createCollection(apiKey, libraryId, name, parentCollectionId) {
  if (!name || !name.trim()) {
    return { success: false, error: "Collection name is required" };
  }

  const zot = zotClient(apiKey, libraryId);
  const data = { name: name.trim() };
  if (parentCollectionId) {
    data.parentCollection = parentCollectionId;
  }

  try {
    console.error(`[create_collection] Creating collection: "${data.name}"${parentCollectionId ? ` under parent ${parentCollectionId}` : " (top-level)"}`);

    const response = await zot.collections().post([data]);
    const created = response.getEntityByIndex(0);

    if (!created) {
      const rawResp = JSON.stringify(response.raw || response);
      console.error(`[create_collection] Failed. API response: ${rawResp}`);
      return { success: false, error: `Failed to create collection. API response: ${rawResp}` };
    }

    console.error(`[create_collection] Created collection: ${created.key}`);
    return {
      success: true,
      collection_key: created.key,
      name: data.name,
      parent: parentCollectionId || null,
      message: `Created collection: ${data.name}`,
    };
  } catch (err) {
    console.error(`[create_collection] Error: ${err.message}\n${err.stack}`);
    return { success: false, error: `Failed to create collection: ${err.message}` };
  }
}

// -------------------------------------------------------------------------
// Write / Manage
// -------------------------------------------------------------------------

/**
 * Create a note attached to an existing item.
 */
export async function createNote(apiKey, libraryId, parentItemKey, content, tags = []) {
  const zot = zotClient(apiKey, libraryId);
  try {
    const template = await getItemTemplate("note");
    template.parentItem = parentItemKey;
    template.note = content;
    if (tags.length > 0) {
      template.tags = tags.map((t) => ({ tag: t }));
    }

    const response = await zot.items().post([template]);
    const created = response.getEntityByIndex(0);
    if (!created) {
      return { success: false, error: "Failed to create note" };
    }
    return { success: true, item_key: created.key, message: `Note created on item ${parentItemKey}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Update metadata on an existing item.
 */
export async function updateItem(apiKey, libraryId, itemKey, changes) {
  const zot = zotClient(apiKey, libraryId);
  try {
    // Fetch current item to get version and existing data
    const itemResp = await zot.items(itemKey).get();
    const raw = itemResp.raw;
    const version = raw.version;
    const data = { ...raw.data };

    // Apply changes
    if (changes.title !== undefined) data.title = changes.title;
    if (changes.abstract !== undefined) data.abstractNote = changes.abstract;
    if (changes.date !== undefined) data.date = changes.date;
    if (changes.extra !== undefined) data.extra = changes.extra;

    // Tag handling: replace, add, or remove
    if (changes.tags !== undefined) {
      data.tags = changes.tags.map((t) => ({ tag: t }));
    } else {
      const existingTags = (data.tags || []).map((t) => t.tag || t);
      let updated = [...existingTags];
      if (changes.add_tags) {
        for (const t of changes.add_tags) {
          if (!updated.includes(t)) updated.push(t);
        }
      }
      if (changes.remove_tags) {
        updated = updated.filter((t) => !changes.remove_tags.includes(t));
      }
      if (changes.add_tags || changes.remove_tags) {
        data.tags = updated.map((t) => ({ tag: t }));
      }
    }

    // Collections
    if (changes.collections !== undefined) {
      data.collections = changes.collections;
    }

    // PATCH the item
    await zot.items(itemKey).patch(version, data);

    return { success: true, item_key: itemKey, message: `Item ${itemKey} updated` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
