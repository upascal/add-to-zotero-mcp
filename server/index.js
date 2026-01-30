/**
 * Add to Zotero — Node.js MCP Server
 *
 * A direct port of server.py using the MCP TypeScript SDK
 * and zotero-api-client. No Python dependency required.
 *
 * Usage:
 *   node index.js
 *
 * Environment variables:
 *   ZOTERO_API_KEY    — Zotero API key
 *   ZOTERO_LIBRARY_ID — Zotero user library ID
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  getItemTypes,
  listCollections,
  createItem,
  attachPdfFromUrl,
  attachSnapshot,
} from "./zotero.js";

// -------------------------------------------------------------------------
// Credentials helper
// -------------------------------------------------------------------------

function getCredentials() {
  const apiKey = process.env.ZOTERO_API_KEY;
  const libraryId = process.env.ZOTERO_LIBRARY_ID;

  if (!apiKey || !libraryId) {
    throw new Error(
      "Zotero not configured. Set ZOTERO_API_KEY and ZOTERO_LIBRARY_ID environment variables. " +
        "Get credentials from: https://www.zotero.org/settings/keys"
    );
  }

  return { apiKey, libraryId };
}

// -------------------------------------------------------------------------
// MCP Server
// -------------------------------------------------------------------------

const server = new McpServer({
  name: "add-to-zotero",
  version: "1.0.0",
});

// -- get_zotero_help ------------------------------------------------------

server.registerTool(
  "get_zotero_help",
  {
    title: "Get Zotero Help",
    description:
      "Get workflow instructions for adding items to Zotero. " +
      "Call this whenever you're unsure how to proceed.",
  },
  async () => {
    const help = {
      workflow: {
        step1_fetch:
          "Use YOUR OWN built-in tools to fetch the URL content. " +
          "DO NOT open new browser tabs — just fetch the content.",
        step2_extract:
          "Read the content and extract metadata: " +
          "title, authors (may be organizations), date, abstract (write one if missing), " +
          "publisher/website name, and 2-5 descriptive tags.",
        step3_find_collection:
          "Call list_zotero_collections to find the right folder. " +
          "If user didn't specify and multiple options match, ask them.",
        step4_assess_confidence:
          "If confident (clear metadata, no guessing) -> proceed. " +
          "If uncertain (messy source, wrote abstract, guessed fields) -> ask user to confirm.",
        step5_save:
          "Call save_to_zotero with all extracted metadata. " +
          "Include pdf_url if PDF available, OR snapshot_url for webpages.",
      },
      available_tools: [
        "save_to_zotero - Save an item with metadata and attachments",
        "list_zotero_collections - Find collection IDs",
        "get_zotero_item_types - See valid item types",
        "attach_pdf_from_url - Add PDF to existing item",
        "attach_snapshot - Add webpage snapshot to existing item",
      ],
      tips: [
        "Always include tags (2-5 descriptive keywords)",
        "Write an abstract if the source lacks one",
        "Authors can be organizations like 'World Health Organization'",
        "Use snapshot_url for webpages, pdf_url for documents",
        "Don't open browser tabs just to read content — use fetch tools instead",
      ],
    };

    return { content: [{ type: "text", text: JSON.stringify(help, null, 2) }] };
  }
);

// -- prepare_url_for_zotero -----------------------------------------------

server.registerTool(
  "prepare_url_for_zotero",
  {
    title: "Prepare URL for Zotero",
    description:
      "Get instructions for fetching a URL's content before saving to Zotero. " +
      "This tool does NOT fetch the content itself.",
    inputSchema: {
      url: z.string().url().describe("The URL you want to fetch content from"),
    },
  },
  async ({ url }) => {
    const isPdf = /\.pdf$/i.test(url) || /\/pdf\//i.test(url);

    const result = {
      url,
      is_pdf: isPdf,
      instructions: isPdf
        ? "This appears to be a PDF. When you call save_to_zotero, " +
          "include this URL as the pdf_url parameter to attach it."
        : "DO NOT open a browser tab for this URL. " +
          "Use your built-in web_fetch or read_url tool to get the content. " +
          "Then extract the metadata and call save_to_zotero.",
      next_steps: [
        `1. Fetch content from ${url} using your internal tools`,
        "2. Extract: title, authors, date, abstract, tags",
        "3. Call list_zotero_collections to find the right folder",
        `4. Call save_to_zotero with all metadata and ${isPdf ? `pdf_url='${url}'` : `snapshot_url='${url}'`}`,
      ],
    };

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// -- save_to_zotero -------------------------------------------------------

server.registerTool(
  "save_to_zotero",
  {
    title: "Save to Zotero",
    description:
      "Create a new item in your Zotero library. " +
      "WORKFLOW: 1) Fetch and read source content thoroughly. " +
      "2) Extract ALL metadata: title, authors, date, abstract, publisher. " +
      "3) Generate 2-5 descriptive tags. 4) Call list_collections for the right folder. " +
      "5) If confident → proceed. If uncertain → ask user first. " +
      "ATTACHMENTS: Include pdf_url for PDFs, snapshot_url for webpages.",
    inputSchema: {
      title: z.string().describe("Item title (required)"),
      item_type: z
        .string()
        .default("webpage")
        .describe(
          "Type: article, journal, book, chapter, conference, thesis, report, " +
            "webpage, blog, news, magazine, document, legal, case, patent, video, podcast, presentation"
        ),
      authors: z
        .array(z.string())
        .optional()
        .describe('Author names — can be organizations like "WHO"'),
      date: z.string().optional().describe('Publication date, e.g. "2025-07-25" or "July 2025"'),
      url: z.string().optional().describe("URL of the item"),
      abstract: z.string().optional().describe("Abstract or summary — write one if missing"),
      publication: z.string().optional().describe("Journal/publication/website name"),
      volume: z.string().optional().describe("Volume number"),
      issue: z.string().optional().describe("Issue number"),
      pages: z.string().optional().describe("Page range"),
      doi: z.string().optional().describe("DOI identifier"),
      tags: z.array(z.string()).optional().describe("2-5 descriptive tags"),
      collection_id: z.string().optional().describe("Collection ID from list_zotero_collections"),
      pdf_url: z.string().optional().describe("URL to download PDF attachment from"),
      snapshot_url: z.string().optional().describe("URL to save as HTML snapshot"),
      extra: z.string().optional().describe("Additional notes for the Extra field"),
    },
  },
  async (params) => {
    const { apiKey, libraryId } = getCredentials();

    const result = await createItem(apiKey, libraryId, {
      title: params.title,
      itemType: params.item_type,
      authors: params.authors || [],
      date: params.date,
      url: params.url,
      abstract: params.abstract,
      publication: params.publication,
      volume: params.volume,
      issue: params.issue,
      pages: params.pages,
      doi: params.doi,
      tags: params.tags || [],
      collectionId: params.collection_id,
      pdfUrl: params.pdf_url,
      snapshotUrl: params.snapshot_url,
      extra: params.extra,
    });

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// -- attach_pdf_from_url --------------------------------------------------

server.registerTool(
  "attach_pdf_from_url",
  {
    title: "Attach PDF from URL",
    description: "Download a PDF from a URL and attach it to an existing Zotero item.",
    inputSchema: {
      parent_item_key: z.string().describe("The key of the parent item to attach to"),
      pdf_url: z.string().url().describe("URL to download the PDF from"),
      filename: z.string().optional().describe("Optional filename"),
    },
  },
  async ({ parent_item_key, pdf_url, filename }) => {
    const { apiKey, libraryId } = getCredentials();
    const result = await attachPdfFromUrl(apiKey, libraryId, parent_item_key, pdf_url, filename);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// -- attach_snapshot ------------------------------------------------------

server.registerTool(
  "attach_snapshot",
  {
    title: "Attach Snapshot",
    description:
      "Save a webpage as an HTML snapshot and attach it to an existing Zotero item. " +
      "Always call this for webpage sources — content can disappear.",
    inputSchema: {
      parent_item_key: z.string().describe("The key returned by save_to_zotero"),
      url: z.string().url().describe("URL of the webpage to snapshot"),
      title: z.string().optional().describe("Optional title for the snapshot"),
    },
  },
  async ({ parent_item_key, url, title }) => {
    const { apiKey, libraryId } = getCredentials();
    const result = await attachSnapshot(apiKey, libraryId, parent_item_key, url, title);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// -- list_zotero_collections ----------------------------------------------

server.registerTool(
  "list_zotero_collections",
  {
    title: "List Zotero Collections",
    description:
      "List all collections (folders) in the Zotero library. " +
      "Call this before save_to_zotero to find the right collection_id.",
  },
  async () => {
    const { apiKey, libraryId } = getCredentials();

    try {
      const collections = await listCollections(apiKey, libraryId);
      return { content: [{ type: "text", text: JSON.stringify(collections, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
    }
  }
);

// -- get_zotero_item_types ------------------------------------------------

server.registerTool(
  "get_zotero_item_types",
  {
    title: "Get Zotero Item Types",
    description: "Get list of supported item types for save_to_zotero.",
  },
  async () => {
    return { content: [{ type: "text", text: JSON.stringify(getItemTypes(), null, 2) }] };
  }
);

// -------------------------------------------------------------------------
// Start
// -------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
