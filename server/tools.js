import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'

const MAX_OUTPUT = 40_000

// Tool definitions in a neutral shape; providers.js converts per API.
export const TOOL_DEFS = [
  {
    name: 'list_dir',
    description: 'List the files in a directory. Returns names; directories end with "/".',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute or workspace-relative directory path. Defaults to the workspace root.' } },
      required: []
    }
  },
  {
    name: 'read_file',
    description: 'Read a text file. Returns the content with 1-indexed line numbers.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        offset: { type: 'number', description: 'First line to read (1-indexed, optional)' },
        limit: { type: 'number', description: 'Max lines to read (optional, default 2000)' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file with the given content. Creates parent directories as needed.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        content: { type: 'string', description: 'Full file content' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'edit_file',
    description: 'Edit a file by replacing an exact string. The old string must appear exactly once unless replace_all is true.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' },
        replace_all: { type: 'boolean' }
      },
      required: ['path', 'old_string', 'new_string']
    }
  },
  {
    name: 'run_command',
    description: 'Run a shell command in the workspace directory with bash. Output is truncated to 40000 characters. Timeout 120s.',
    input_schema: {
      type: 'object',
      properties: { command: { type: 'string', description: 'The bash command to run' } },
      required: ['command']
    }
  }
]

function resolvePath (p, cwd) {
  if (!p) return cwd
  return path.isAbsolute(p) ? p : path.join(cwd, p)
}

function truncate (text) {
  if (text.length <= MAX_OUTPUT) return text
  return text.slice(0, MAX_OUTPUT) + `\n… [truncated, ${text.length - MAX_OUTPUT} more characters]`
}

export async function runTool (name, input, cwd) {
  try {
    switch (name) {
      case 'list_dir': {
        const dir = resolvePath(input.path, cwd)
        const entries = fs.readdirSync(dir, { withFileTypes: true })
          .map(e => e.name + (e.isDirectory() ? '/' : ''))
          .sort()
        return truncate(entries.join('\n') || '(empty directory)')
      }
      case 'read_file': {
        const file = resolvePath(input.path, cwd)
        const lines = fs.readFileSync(file, 'utf8').split('\n')
        const start = Math.max(1, input.offset || 1)
        const limit = Math.min(input.limit || 2000, 5000)
        const slice = lines.slice(start - 1, start - 1 + limit)
        const numbered = slice.map((l, i) => `${start + i}\t${l}`).join('\n')
        const note = start - 1 + limit < lines.length ? `\n… [${lines.length} lines total]` : ''
        return truncate(numbered + note)
      }
      case 'write_file': {
        const file = resolvePath(input.path, cwd)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, input.content)
        return `Wrote ${Buffer.byteLength(input.content)} bytes to ${file}`
      }
      case 'edit_file': {
        const file = resolvePath(input.path, cwd)
        const text = fs.readFileSync(file, 'utf8')
        const count = text.split(input.old_string).length - 1
        if (count === 0) return 'Error: old_string not found in file'
        if (count > 1 && !input.replace_all) return `Error: old_string appears ${count} times; make it unique or set replace_all`
        const updated = input.replace_all
          ? text.split(input.old_string).join(input.new_string)
          : text.replace(input.old_string, input.new_string)
        fs.writeFileSync(file, updated)
        return `Replaced ${input.replace_all ? count : 1} occurrence(s) in ${file}`
      }
      case 'run_command': {
        return await new Promise(resolve => {
          execFile('bash', ['-c', input.command], { cwd, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            let out = ''
            if (stdout) out += stdout
            if (stderr) out += (out ? '\n--- stderr ---\n' : '') + stderr
            if (err && err.killed) out += '\n[command timed out after 120s]'
            else if (err && err.code) out += `\n[exit code ${err.code}]`
            resolve(truncate(out || '(no output)'))
          })
        })
      }
      default:
        return `Error: unknown tool ${name}`
    }
  } catch (e) {
    return `Error: ${e.message}`
  }
}
