"""
Add to Zotero — MCP Server
A minimal MCP server for creating Zotero items with attachments and snapshots.

Requirements:
    pip install -r requirements.txt

Setup:
    1. Get API key from https://www.zotero.org/settings/keys
    2. Create a .env file in this directory:
       ZOTERO_API_KEY=your_key
       ZOTERO_LIBRARY_ID=your_id
       ZOTERO_LIBRARY_TYPE=user  (optional, defaults to "user")

    Or set environment variables directly, or pass them via Claude Desktop config.

Usage:
    python server.py
"""

import os
import re
import tempfile
from urllib.parse import urlparse, parse_qs, unquote
from dotenv import load_dotenv
import requests
from typing import Optional
from pyzotero import zotero
from fastmcp import FastMCP

# Load .env file from the same directory as this script
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

# Initialize MCP server
mcp = FastMCP("add-to-zotero")

# Zotero client (initialized lazily)
_zot = None

def get_zotero_client():
    """Get or create Zotero client."""
    global _zot
    if _zot is None:
        api_key = os.environ.get("ZOTERO_API_KEY")
        library_id = os.environ.get("ZOTERO_LIBRARY_ID")
        library_type = os.environ.get("ZOTERO_LIBRARY_TYPE", "user")
        
        if not api_key or not library_id:
            raise ValueError(
                "Missing ZOTERO_API_KEY or ZOTERO_LIBRARY_ID environment variables. "
                "Get your API key from https://www.zotero.org/settings/keys"
            )
        
        _zot = zotero.Zotero(library_id, library_type, api_key)
    return _zot


# Known URL wrapper/renderer path patterns
_WRAPPER_PATTERNS = re.compile(
    r"pdfrenderer|pdf\.svc|htmltopdf|html2pdf|render.*pdf|pdf.*render|"
    r"webshot|screenshot|snapshot|proxy\.php|fetch\.php",
    re.IGNORECASE,
)

# Query parameter names that commonly hold the inner source URL
_URL_PARAM_NAMES = ("url", "source", "target", "uri", "link", "src")


def _unwrap_url(url: str) -> str:
    """Extract the inner source URL from wrapper/renderer/proxy URLs.

    Detects patterns like PDF rendering services that embed the real URL as a
    query parameter and returns the unwrapped URL.  If no wrapper is detected,
    returns the original URL unchanged.
    """
    parsed = urlparse(url)

    # Check if the URL path matches known wrapper patterns
    is_wrapper = bool(_WRAPPER_PATTERNS.search(parsed.path))

    # Even without a known wrapper pattern, check for a 'url' param containing
    # a full URL — this is a common generic proxy pattern.
    params = parse_qs(parsed.query)

    for param_name in _URL_PARAM_NAMES:
        values = params.get(param_name)
        if not values:
            continue
        candidate = unquote(values[0])
        if candidate.startswith(("http://", "https://")):
            if is_wrapper:
                # Definitely a wrapper — return the inner URL
                return candidate
            # Not a known wrapper but has a full URL param — still unwrap
            # if the outer URL looks like a service endpoint (has path segments
            # beyond a simple page).
            if len(parsed.path.strip("/").split("/")) >= 2:
                return candidate

    return url


# Mapping of simple type names to Zotero item types
ITEM_TYPE_MAP = {
    "article": "journalArticle",
    "journal": "journalArticle",
    "book": "book",
    "chapter": "bookSection",
    "conference": "conferencePaper",
    "thesis": "thesis",
    "report": "report",
    "webpage": "webpage",
    "blog": "blogPost",
    "news": "newspaperArticle",
    "magazine": "magazineArticle",
    "document": "document",
    "legal": "statute",
    "case": "case",
    "patent": "patent",
    "video": "videoRecording",
    "podcast": "podcast",
    "presentation": "presentation",
}


@mcp.tool()
def create_zotero_item(
    title: str,
    item_type: str = "webpage",
    authors: Optional[list[str]] = None,
    date: Optional[str] = None,
    url: Optional[str] = None,
    abstract: Optional[str] = None,
    publication: Optional[str] = None,
    volume: Optional[str] = None,
    issue: Optional[str] = None,
    pages: Optional[str] = None,
    doi: Optional[str] = None,
    tags: Optional[list[str]] = None,
    collection_id: Optional[str] = None,
    pdf_url: Optional[str] = None,
    extra: Optional[str] = None,
) -> dict:
    """
    Create a new item in your Zotero library.
    
    Args:
        title: Item title (required)
        item_type: Type of item. Options: article, journal, book, chapter, conference,
                   thesis, report, webpage, blog, news, magazine, document, legal,
                   case, patent, video, podcast, presentation
        authors: List of author names (e.g., ["John Smith", "Jane Doe"])
        date: Publication date (e.g., "2025-07-25" or "July 2025" or "2025")
        url: URL of the item
        abstract: Abstract or summary
        publication: Journal/publication name (for articles)
        volume: Volume number
        issue: Issue number
        pages: Page range (e.g., "1-10")
        doi: DOI identifier
        tags: List of tags to apply
        collection_id: Zotero collection ID to add item to
        pdf_url: URL to download PDF attachment from
        extra: Additional notes for the "Extra" field
    
    Returns:
        dict with created item key and status
    """
    zot = get_zotero_client()
    
    # Map item type
    zotero_type = ITEM_TYPE_MAP.get(item_type.lower(), item_type)
    
    # Get template for this item type
    try:
        template = zot.item_template(zotero_type)
    except Exception as e:
        return {"success": False, "error": f"Invalid item type '{zotero_type}': {e}"}
    
    # Fill in the template
    template["title"] = title
    
    if date:
        template["date"] = date
    
    if url and "url" in template:
        template["url"] = url
    
    if abstract and "abstractNote" in template:
        template["abstractNote"] = abstract
    
    if publication:
        # Different item types use different field names
        if "publicationTitle" in template:
            template["publicationTitle"] = publication
        elif "blogTitle" in template:
            template["blogTitle"] = publication
        elif "websiteTitle" in template:
            template["websiteTitle"] = publication
    
    if volume and "volume" in template:
        template["volume"] = volume
    
    if issue and "issue" in template:
        template["issue"] = issue
    
    if pages and "pages" in template:
        template["pages"] = pages
    
    if doi and "DOI" in template:
        template["DOI"] = doi
    
    if extra and "extra" in template:
        template["extra"] = extra
    
    # Handle authors
    if authors and "creators" in template:
        creators = []
        for author in authors:
            parts = author.strip().split()
            if len(parts) >= 2:
                creators.append({
                    "creatorType": "author",
                    "firstName": " ".join(parts[:-1]),
                    "lastName": parts[-1]
                })
            else:
                creators.append({
                    "creatorType": "author",
                    "name": author  # Single name
                })
        template["creators"] = creators
    
    # Handle tags
    if tags:
        template["tags"] = [{"tag": t} for t in tags]
    
    # Handle collection
    if collection_id:
        template["collections"] = [collection_id]
    
    # Create the item
    try:
        result = zot.create_items([template])
        
        if "successful" in result and result["successful"]:
            item_key = list(result["successful"].values())[0]["key"]
            response = {
                "success": True,
                "item_key": item_key,
                "message": f"Created {zotero_type}: {title}"
            }
            
            # Attach PDF if URL provided
            if pdf_url:
                pdf_result = _attach_pdf_from_url(item_key, pdf_url)
                response["pdf_attachment"] = pdf_result
            
            return response
        else:
            return {
                "success": False,
                "error": f"Failed to create item: {result.get('failed', result)}"
            }
            
    except Exception as e:
        return {"success": False, "error": str(e)}


def _attach_pdf_from_url(
    parent_item_key: str,
    pdf_url: str,
    filename: Optional[str] = None
) -> dict:
    """Download a PDF from a URL and attach it to an existing Zotero item."""
    zot = get_zotero_client()
    pdf_url = _unwrap_url(pdf_url)

    try:
        # Download the PDF
        response = requests.get(pdf_url, timeout=60, headers={
            "User-Agent": "Mozilla/5.0 (compatible; ZoteroWriter/1.0)"
        })
        response.raise_for_status()

        # Determine filename
        if not filename:
            # Try to get from Content-Disposition header
            cd = response.headers.get("Content-Disposition", "")
            if "filename=" in cd:
                filename = cd.split("filename=")[-1].strip('"\'')
            else:
                # Extract from URL
                filename = pdf_url.split("/")[-1].split("?")[0]
                if not filename.endswith(".pdf"):
                    filename = "attachment.pdf"

        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(response.content)
            temp_path = f.name

        # Upload to Zotero
        try:
            zot.attachment_simple([temp_path], parent_item_key)
            return {
                "success": True,
                "filename": filename,
                "size_bytes": len(response.content)
            }
        finally:
            # Clean up temp file
            os.unlink(temp_path)

    except requests.RequestException as e:
        return {"success": False, "error": f"Failed to download PDF: {e}"}
    except Exception as e:
        return {"success": False, "error": f"Failed to attach PDF: {e}"}


@mcp.tool()
def attach_pdf_from_url(
    parent_item_key: str,
    pdf_url: str,
    filename: Optional[str] = None
) -> dict:
    """
    Download a PDF from a URL and attach it to an existing Zotero item.

    Args:
        parent_item_key: The key of the parent item to attach to
        pdf_url: URL to download the PDF from
        filename: Optional filename (will be auto-generated if not provided)

    Returns:
        dict with attachment status
    """
    return _attach_pdf_from_url(parent_item_key, pdf_url, filename)


@mcp.tool()
def attach_snapshot(
    parent_item_key: str,
    url: str,
    title: Optional[str] = None,
) -> dict:
    """
    Save a webpage as an HTML snapshot and attach it to an existing Zotero item.

    Downloads the page HTML and uploads it as an attachment.  Useful for
    preserving web pages that may change or disappear.

    Args:
        parent_item_key: The key of the parent item to attach the snapshot to
        url: URL of the webpage to snapshot
        title: Optional title for the snapshot (auto-extracted from page if omitted)

    Returns:
        dict with attachment status, filename, and size
    """
    zot = get_zotero_client()
    url = _unwrap_url(url)

    try:
        response = requests.get(url, timeout=60, headers={
            "User-Agent": "Mozilla/5.0 (compatible; ZoteroWriter/1.0)"
        })
        response.raise_for_status()
    except requests.RequestException as e:
        return {"success": False, "error": f"Failed to fetch page: {e}"}

    html = response.text

    # Determine title
    if not title:
        match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
        if match:
            title = match.group(1).strip()
        else:
            title = url

    # Build a safe filename from the title
    safe_name = re.sub(r'[^\w\s\-.]', '', title)[:80].strip() or "snapshot"
    filename = f"{safe_name}.html"

    # Save to temp file and upload
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            suffix=".html", prefix="zw_snap_", delete=False, mode="w",
            encoding=response.encoding or "utf-8",
        ) as f:
            f.write(html)
            temp_path = f.name

        # Rename temp file so Zotero sees a meaningful filename
        dest_path = os.path.join(os.path.dirname(temp_path), filename)
        os.rename(temp_path, dest_path)
        temp_path = dest_path

        zot.attachment_simple([temp_path], parent_item_key)
        return {
            "success": True,
            "filename": filename,
            "title": title,
            "size_bytes": len(html.encode(response.encoding or "utf-8")),
        }
    except Exception as e:
        return {"success": False, "error": f"Failed to attach snapshot: {e}"}
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)


@mcp.tool()
def list_collections() -> list[dict]:
    """
    List all collections in your Zotero library.
    
    Returns:
        List of collections with their IDs and names
    """
    zot = get_zotero_client()
    
    try:
        collections = zot.collections()
        return [
            {
                "key": c["key"],
                "name": c["data"]["name"],
                "parent": c["data"].get("parentCollection", None)
            }
            for c in collections
        ]
    except Exception as e:
        return [{"error": str(e)}]


@mcp.tool()
def get_item_types() -> list[str]:
    """
    Get list of supported item types.
    
    Returns:
        List of item type names you can use with create_zotero_item
    """
    return list(ITEM_TYPE_MAP.keys())


if __name__ == "__main__":
    mcp.run()
