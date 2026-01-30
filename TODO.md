# Add to Zotero MCP — Development Tasks

## Current Sprint
- [x] Full read/write/manage implementation (plan.md)
  - [x] 8 new tools (search, read, notes, update)
  - [x] Tool renames for consistency
  - [x] Update CLAUDE.md documentation
  - [x] Remove Python server (now Node.js only)

## Backlog
- [x] Easy configuration interface
  - [x] Interactive CLI wizard for first-time setup
  - [x] Auto-detect if running in terminal vs background
  - [x] Generate integration instructions (Claude Desktop JSON, claude.ai URL)
- [ ] OAuth integration with Zotero
  - Register app at https://www.zotero.org/oauth/apps
  - Application Type: Browser
  - Need callback URL (depends on hosting)
  - Implement OAuth flow in server
- [ ] Publish to Claude Connectors Directory
- [ ] One-liner install script (curl)

### UI 
- [ ] Add or remove tools from the UI 
- [ ] Create custom workflows (ie whether or not abstract is required or tags etc)
- [ ] Dark mode support


## Long Term
- [ ] Add support for Zotero groups
- [ ] Add support for reading and summarizing PDFs
- [ ] Add support for notes / annotations

## Future Exploration
- [ ] Multi-platform support (beyond Claude)
  - OpenAI ChatGPT (via Actions / function calling adapter)
  - Google Gemini (via Extensions adapter)
  - Would require thin wrappers around the core `zotero.js` logic
  - MCP may become a standard — wait and see
- [ ] Remote MCP server deployment
  - [ ] HTTP transport support
  - [ ] Dockerfile for deployment
  - [ ] Test with claude.ai
