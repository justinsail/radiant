import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execFile, spawn } from 'child_process'

const MAX_OUTPUT = 40_000

// background jobs (run_command with run_in_background:true). id -> job
const jobs = new Map()
function newJob (command, cwd) {
  const id = 'job_' + crypto.randomBytes(3).toString('hex')
  const proc = spawn('bash', ['-lc', command], { cwd, detached: false })
  const job = { id, command, output: '', done: false, exitCode: null, startedAt: Date.now(), proc }
  const cap = d => { job.output = (job.output + d.toString()).slice(-200_000) }
  proc.stdout.on('data', cap)
  proc.stderr.on('data', cap)
  proc.on('close', code => { job.done = true; job.exitCode = code; job.proc = null })
  proc.on('error', e => { job.output += `\n[spawn error: ${e.message}]`; job.done = true; job.exitCode = -1; job.proc = null })
  jobs.set(id, job)
  return id
}

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
    description: 'Run a shell command in the workspace directory with bash. Output is truncated to 40000 characters. Timeout 120s. For long-running commands (builds, test watchers, dev servers), set run_in_background:true to get a job id back immediately and keep working.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The bash command to run' },
        run_in_background: { type: 'boolean', description: 'Run detached and return a job id immediately instead of waiting (for builds, servers, watchers).' }
      },
      required: ['command']
    }
  },
  {
    name: 'job_output',
    description: 'Get the current output and status of a background job started with run_command(run_in_background:true).',
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'The job id' } }, required: ['id'] }
  },
  {
    name: 'job_list',
    description: 'List background jobs and whether each is still running.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'job_kill',
    description: 'Stop a background job.',
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'The job id' } }, required: ['id'] }
  },
  {
    name: 'todo_write',
    description: 'Record or update your task checklist for this session so the user can follow along on multi-step work. Call it when you start a multi-step task and whenever a step\'s status changes. Always send the FULL list each time (it replaces the previous one). Keep exactly one item "in_progress".',
    input_schema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The complete ordered checklist.',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Short task description' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'done'], description: 'Current status' }
            },
            required: ['text', 'status']
          }
        }
      },
      required: ['todos']
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
        if (input.run_in_background) {
          const id = newJob(input.command, cwd)
          return `Started in the background as ${id}. Use job_output("${id}") to check on it, job_kill("${id}") to stop it.`
        }
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
      case 'job_output': {
        const job = jobs.get(input.id)
        if (!job) return `No job ${input.id}. Use job_list to see running jobs.`
        const status = job.done ? `finished (exit ${job.exitCode})` : 'still running'
        return truncate(`[job ${job.id} — ${status}]\n${job.output || '(no output yet)'}`)
      }
      case 'job_list': {
        if (!jobs.size) return 'No background jobs.'
        return [...jobs.values()].map(j => `${j.id}  ${j.done ? `done(${j.exitCode})` : 'running'}  ${j.command.slice(0, 60)}`).join('\n')
      }
      case 'job_kill': {
        const job = jobs.get(input.id)
        if (!job) return `No job ${input.id}.`
        if (job.proc) { try { job.proc.kill('SIGKILL') } catch {} }
        return `Killed ${input.id}.`
      }
      default:
        return `Error: unknown tool ${name}`
    }
  } catch (e) {
    return `Error: ${e.message}`
  }
}
