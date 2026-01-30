# Add to Zotero MCP — Development Tasks

## Current Sprint
- [x] Add HTTP transport support for remote deployment
  - [x] Update `server.py` to support `--transport` argument
  - [x] Add `uvicorn` to requirements
  - [x] Add `configure_zotero` tool for runtime credential setup
  - [x] Test HTTP mode locally
  - [ ] Test HTTP mode with claude.ai
  - [ ] Create Dockerfile for deployment

## Backlog
- [ ] Easy configuration interface
  - [ ] Interactive CLI wizard for first-time setup
  - [ ] Auto-detect if running in terminal vs background
  - [ ] Generate integration instructions (Claude Desktop JSON, claude.ai URL)
  - [ ] Copy-to-clipboard support for config snippets
- [ ] OAuth integration with Zotero
  - Register app at https://www.zotero.org/oauth/apps
  - Application Type: Browser
  - Need callback URL (depends on hosting)
  - Implement OAuth flow in server
- [ ] Publish to Claude Connectors Directory
- [ ] One-liner install script (curl)


### UI 
- add or remove tools from the UI 
- create custom workflows (ie whether or not abstract is required or tags etc)
- dark mode support
- 

## Long term
- add support for Zotero groups
- add support for reading and summarizing PDFs
- add support for notes / annotations


## Remote MCP Server
- add support for remote MCP server

