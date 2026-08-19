import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

// Connect to configured MCP servers and bridge their tools into the agent loop.
// Tool names are namespaced mcp__<serverId>__<tool> so they never collide with
// Radiant's own tools and can be routed back to the right server.

const clients = new Map() // serverId -> { client, tools, error }

async function connect (server) {
  const existing = clients.get(server.id)
  if (existing && !existing.error) return existing
  try {
    const client = new Client({ name: 'radiant', version: '1.0.0' }, { capabilities: {} })
    let transport
    if (server.transport === 'http' || server.url) {
      transport = new StreamableHTTPClientTransport(new URL(server.url))
    } else {
      transport = new StdioClientTransport({
        command: server.command,
        args: server.args || [],
        env: { ...process.env, ...(server.env || {}) }
      })
    }
    await client.connect(transport)
    const { tools } = await client.listTools()
    const entry = { client, tools: tools || [], error: null }
    clients.set(server.id, entry)
    return entry
  } catch (e) {
    const entry = { client: null, tools: [], error: e.message }
    clients.set(server.id, entry)
    return entry
  }
}

export async function disconnect (serverId) {
  const e = clients.get(serverId)
  if (e?.client) { try { await e.client.close() } catch {} }
  clients.delete(serverId)
}

// status for the settings UI: which servers connected and how many tools
export async function mcpStatus (servers) {
  const out = []
  for (const s of (servers || []).filter(s => s.enabled)) {
    const e = await connect(s)
    out.push({ id: s.id, name: s.name, connected: !e.error, error: e.error, toolCount: e.tools.length, tools: e.tools.map(t => t.name) })
  }
  return out
}

// tool definitions (namespaced) for the agent, from all enabled servers
export async function mcpToolDefs (servers) {
  const defs = []
  for (const s of (servers || []).filter(s => s.enabled)) {
    const e = await connect(s)
    for (const t of e.tools) {
      defs.push({
        name: `mcp__${s.id}__${t.name}`,
        description: `[${s.name}] ${t.description || t.name}`,
        input_schema: t.inputSchema || { type: 'object', properties: {} }
      })
    }
  }
  return defs
}

export const isMcpTool = name => name.startsWith('mcp__')

export async function callMcpTool (name, args, servers) {
  const m = name.match(/^mcp__([^_]+(?:_[^_]+)*)__(.+)$/)
  // serverId can contain hyphens but our ids are ag-/sk-/custom-… simple: split on '__'
  const parts = name.split('__')
  const serverId = parts[1]
  const toolName = parts.slice(2).join('__')
  const server = (servers || []).find(s => s.id === serverId)
  if (!server) return `Error: MCP server ${serverId} not found`
  const e = await connect(server)
  if (e.error) return `Error connecting to ${server.name}: ${e.error}`
  try {
    const result = await e.client.callTool({ name: toolName, arguments: args || {} })
    const text = (result.content || [])
      .map(c => c.type === 'text' ? c.text : (c.type === 'resource' ? JSON.stringify(c.resource) : `[${c.type}]`))
      .join('\n')
    return text || '(no output)'
  } catch (err) {
    return `Error: ${err.message}`
  }
}
