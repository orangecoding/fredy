 # Fredy MCP Server

The Fredy MCP Server exposes your real estate jobs and listings data to LLM clients. It supports two transports:

- **Stdio**: for local LLM clients (Claude Desktop, LM Studio, llm-cli, mcp-cli, etc.)
- **Streamable HTTP**: for remote LLM clients (ChatGPT, cloud-hosted agents, etc.)

## Authentication

All MCP access is **token-based** based. Every Fredy user is automatically assigned a **permanent, non-expiring MCP token** when their account is created. This token is a secret and should be treated like a password.

### Where to find your token

MCP tokens are displayed in the **User Management** list (Admin → Users). Each user's token is shown in the **"MCP Token"** column.

> **Important:** MCP tokens never expire. They are permanent secrets tied to each user account. If a token is compromised, you must change the token! If you chose to use a token from an admin account, the LLM can query information from ALL jobs/listings. 

## Available Tools

| Tool | Description                                                                    |
|------|--------------------------------------------------------------------------------|
| `list_jobs` | List real estate search jobs with pagination and text filtering                |
| `get_job` | Get detailed information about a specific job                                  |
| `list_listings` | Search and list real estate listings with pagination, text search, and filters |
| `get_listing` | Get full details of a single listing                                           |
| `get_current_date_time` | Gets the current date/time for the llm to be used                              |

### Tool Details

#### list_jobs
- `page` (number, optional) – Page number (default: 1)
- `pageSize` (number, optional) – Results per page (default: 50, max: 1000). Use pagination to fetch more.
- `filter` (string, optional) – Free-text filter on job name

Response: markdown table with columns ID, Name, Enabled, Active Listings. Includes summary and pagination info.

#### get_job
- `jobId` (string, required) – The job ID to retrieve

#### list_listings
- `page` (number, optional) – Page number (default: 1)
- `pageSize` (number, optional) – Results per page (default: 50, max: 1000). Use pagination to fetch more.
- `filter` (string, optional) – Free-text search across title, address, provider, link
- `jobId` (string, optional) – Filter listings by job ID
- `activeOnly` (boolean, optional) – When true, only show active listings
- `provider` (string, optional) – Filter by provider name
- `createdAfter` (number, optional) – Only include listings created at or after this unix timestamp in milliseconds (e.g. `1772008362564`). Useful for queries like "give me all listings from today".
- `createdBefore` (number, optional) – Only include listings created at or before this unix timestamp in milliseconds (e.g. `1772008362564`).
- `minPrice` (number, optional) – Only include listings with price >= this value (e.g. `500`). Numeric, no currency symbol.
- `maxPrice` (number, optional) – Only include listings with price <= this value (e.g. `1500`). Numeric, no currency symbol.
- `sortField` (string, optional) – Sort by: created_at, price, size, provider, title, is_active
- `sortDir` (string, optional) – Sort direction: asc or desc

Response: markdown table with columns ID, Title, Address, Price, Size, Provider, Active, Created, Job. Includes summary and pagination info. Use `get_listing` for full details.

> **Note:** All timestamps are **unix timestamps in milliseconds** (e.g. `1772008362564`), not seconds.

#### get_listing
- `listingId` (string, required) – The listing ID to retrieve

## Usage with Local LLM (stdio transport)

The stdio transport communicates over stdin/stdout and is ideal for local LLM tools.

### Quick Start

```bash
MCP_TOKEN=fredy_<your-token> node mcp/stdio.js
# or
MCP_TOKEN=fredy_<your-token> yarn mcp:stdio
```

### Testing with MCP Inspector

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) lets you interactively test your MCP server in a browser UI.

```bash
npx @modelcontextprotocol/inspector -e MCP_TOKEN=fredy_<your-token> -- node mcp/stdio.js
```

Once the inspector is running, open the URL shown in your terminal (usually `http://localhost:6274`). You can then:
1. Click **Connect** to establish the stdio connection
2. Go to the **Tools** tab to see all available tools
3. Select a tool, fill in parameters, and click **Run** to test it

### LM Studio Configuration

[LM Studio](https://lmstudio.ai/) supports MCP servers natively, allowing your local LLM to access Fredy's jobs and listings data.

#### Setup

1. Open **LM Studio** and load a model that supports tool use (e.g., Qwen 2.5, Llama 3.1, Mistral, etc.)
2. In the right side  under **Integrations** click on "# install" and "edit mcp.json"
3. Edit the LM Studio MCP config file directly (`~/.lmstudio/config/mcp.json` or via the UI export):

   ```json
   {
     "mcpServers": {
       "fredy": {
         "command": "node",
         "args": ["/absolute/path/to/fredy/mcp/stdio.js"],
         "env": {
           "MCP_TOKEN": "fredy_<your-token>"
         }
       }
     }
   }
   ```

4. Toggle the server **on**: LM Studio will spawn the stdio process and connect
5. You should see the Fredy tools appear as available tools

#### Suggestion on LLM
After testing numerous LLM's, I got the best results with Qwen 3.5 or Qwen 2.5.. E.g. `Qwen2.5-14B-Instruct-1M-8bit`.

#### Usage

Once connected, simply ask your LLM about your real estate data in natural language:

- *"Show me all my active search jobs"*
- *"List the latest listings from my Berlin apartment search"*
- *"Get details for listing XYZ"*
- *"What are the cheapest listings across all my jobs?"*

The LLM will automatically call the appropriate Fredy MCP tools and present the results.

> **Tip:** Make sure Fredy is running and the database is accessible before starting the MCP server in LM Studio. The stdio transport initializes its own database connection, so Fredy's main process does not need to be running, but the database file must exist and be up-to-date (migrations applied).

### Claude Desktop Configuration

[Claude Desktop](https://claude.ai/download) supports MCP servers natively via its developer settings.

#### Setup

1. Open **Claude Desktop**
2. Go to **Settings → Developer → Edit Config** - this opens the `claude_desktop_config.json` file
3. Add the `fredy` server to the `mcpServers` object:

   ```json
   {
     "mcpServers": {
       "fredy": {
         "command": "/opt/homebrew/opt/node@22/bin/node",
         "args": ["/absolute/path/to/fredy/lib/mcp/stdio.js"],
         "env": {
           "MCP_TOKEN": "fredy_<your-token>"
         }
       }
     }
   }
   ```

   Replace `/absolute/path/to/fredy` with the actual path on your machine (e.g. `/Users/you/dev/fredy`).

   > **Important:** Claude Desktop launches with a restricted `PATH` and often cannot find `node` by name. Always use the **full absolute path** to the node binary. Find yours by running `which node` in a terminal. Common locations:
   > - Homebrew (default): `/opt/homebrew/bin/node`
   > - Homebrew (versioned, e.g. node@22): `/opt/homebrew/opt/node@22/bin/node`
   > - nvm: `/Users/<you>/.nvm/versions/node/<version>/bin/node`

4. Save the file and **restart Claude Desktop**
5. You should see a hammer icon (🔨) in the chat input - click it to confirm the Fredy tools are listed

#### Usage

Once connected, simply ask Claude about your real estate data:

- *"Show me all my active search jobs"*
- *"List the latest listings from my Berlin apartment search"*
- *"What are the cheapest apartments added this week?"*

Claude will automatically call the appropriate Fredy MCP tools.

> **Note:** Fredy's main web process does not need to be running - the stdio transport opens its own database connection directly. But the SQLite database file must exist and migrations must have been applied.

---

## Usage with Remote LLM (Streamable HTTP transport)

The HTTP transport is automatically available when Fredy is running. It uses the MCP Streamable HTTP protocol at:

```
POST   /api/mcp   – JSON-RPC messages (initialize, tool calls)
GET    /api/mcp   – SSE stream for server-initiated notifications
DELETE /api/mcp   – Terminate session
```

### Authentication

All requests must include the token as a Bearer token:

```
Authorization: Bearer fredy_<your-token>
```

### Example: Initialize a session

```bash
curl -X POST http://localhost:9998/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fredy_<your-token>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "test-client", "version": "1.0.0" }
    }
  }'
```

### Example: Call a tool

```bash
curl -X POST http://localhost:9998/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fredy_<your-token>" \
  -H "Mcp-Session-Id: <session-id-from-init-response>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "list_jobs",
      "arguments": { "page": 1, "pageSize": 10 }
    }
  }'
```

## Security

- Every user is automatically assigned a permanent MCP token at account creation – **tokens never expire**
- Tokens are cryptographically random (256-bit) and prefixed with `fredy_`
- Each token is scoped to a single user – the LLM can only access that user's data
- Non-admin users only see their own jobs and jobs shared with them
- Tokens are stored in the `mcp_token` column of the `users` table
- Tokens are deleted automatically when the owning user is removed
- The `/api/mcp` endpoint uses Bearer token auth (independent of cookie-session)
- Treat MCP tokens like passwords – do not share them publicly

## Response Format

All tool responses use **markdown** instead of JSON for maximum LLM readability and token efficiency:

- **List responses** (list_jobs, list_listings) use markdown tables with a summary line and pagination footer
- **Detail responses** (get_job, get_listing) use markdown key-value lists
- **Error responses** include the tool name and error message

Example list response:

```
**Tool:** list_listings | **Status:** OK

Found **85** listing(s). Showing page 1 of 2 (50 on this page). More pages available - use page=2 to continue.

| ID | Title | Address | Price | Size | Provider | Active | Created | Job |
|----|-------|---------|-------|------|----------|--------|---------|-----|
| abc123 | Nice flat | Berlin | 1200 | 70 | immoscout | yes | 2026-02-25 10:30:00 | My Search |
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

Use **get_listing** with an ID for full details (description, link, image).

**Page:** 1/2 | **Has more:** yes
```

Example detail response:

```
**Tool:** get_listing | **Status:** OK

### Listing: Nice flat

- **ID:** abc123
- **Title:** Nice flat
- **Address:** Berlin
- **Price:** 1200
- **Size:** 70
- **Provider:** immoscout
- **Link:** https://...
- **Active:** yes
- **Created:** 2026-02-25 10:30:00
```

Markdown is used because it is significantly more token-efficient than JSON (~40-60% fewer tokens for tabular data) and natively understood by all LLMs.

## Architecture

```
┌─────────────────┐     stdio      ┌──────────────┐
│  Local LLM      │◄──────────────►│  mcp/stdio.js│
│  (LM Studio,    │                │  (transport)  │
│   Claude, etc.) │                │               │
└─────────────────┘                └──────┬───────┘
                                          │
┌─────────────────┐  Streamable HTTP ┌────┴────────┐
│  Remote LLM     │◄───────────────►│  /api/mcp    │
│                 │  (Bearer token) │  (transport)  │
└─────────────────┘                 └──────┬───────┘
                                           │
                                ┌──────────┴──────────┐
                                │  mcpAuthentication  │
                                │  (token validation, │
                                │   access control)   │
                                └──────────┬──────────┘
                                           │
                                  ┌────────┴────────┐
                                  │  mcpAdapter.js  │
                                  │  (tool routing  │
                                  │   + data fetch) │
                                  └────────┬────────┘
                                           │
                                  ┌────────┴────────┐
                                  │ mcpNormalizer.js│
                                  │ (markdown       │
                                  │  formatting)    │
                                  └────────┬────────┘
                                           │
                                    ┌──────┴───────┐
                                    │  Fredy DB    │
                                    │  (SQLite)    │
                                    └──────────────┘
```
