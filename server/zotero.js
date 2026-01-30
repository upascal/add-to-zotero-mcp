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
    const response = await fetch(pdfUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AddToZoteroMCP/1.0)" },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      return { success: false, error: `Failed to download PDF: HTTP ${response.status}` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());

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
      return { success: false, error: "Failed to create attachment item" };
    }

    // Upload the file content
    await zot
      .items(attachmentItem.key)
      .attachment(filename, buffer, "application/pdf")
      .post();

    return { success: true, filename, size_bytes: buffer.length };
  } catch (err) {
    return { success: false, error: `Failed to attach PDF: ${err.message}` };
  }
}

/**
 * Save a webpage as an HTML snapshot and attach it to an existing Zotero item.
 */
export async function attachSnapshot(apiKey, libraryId, parentItemKey, url, title) {
  url = unwrapUrl(url);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AddToZoteroMCP/1.0)" },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      return { success: false, error: `Failed to fetch page: HTTP ${response.status}` };
    }

    const html = await response.text();

    // Determine title
    if (!title) {
      const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      title = match ? match[1].trim() : url;
    }

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

    const createResp = await zot.items().post([attachmentTemplate]);
    const attachmentItem = createResp.getEntityByIndex(0);

    if (!attachmentItem) {
      return { success: false, error: "Failed to create attachment item" };
    }

    await zot
      .items(attachmentItem.key)
      .attachment(filename, buffer, "text/html")
      .post();

    return { success: true, filename, title, size_bytes: buffer.length };
  } catch (err) {
    return { success: false, error: `Failed to attach snapshot: ${err.message}` };
  }
}
