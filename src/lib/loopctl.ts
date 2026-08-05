import { spawn } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { realpath, lstat, open } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import { CommandExecutionError } from '@jackwener/opencli/errors'

const MAX_OUTPUT = 2 * 1024 * 1024
const MAX_INPUT = 512 * 1024
const timeoutMs = 30_000
export const jsonValue = z.unknown()

export function binary(): string { return process.env.LOOPCTL_BINARY?.trim() || 'loopctl' }

export async function runLoopctl(args: string[], input?: string): Promise<unknown> {
  if (args.length > 8 || args.some(arg => arg.length > 4096 || arg.includes('\u0000'))) {
    throw new CommandExecutionError('invalid loopctl arguments')
  }
  if (input && Buffer.byteLength(input) > MAX_INPUT) throw new CommandExecutionError('loopctl input is too large')
  return await new Promise((resolveResult, reject) => {
    const child = spawn(binary(), args, { shell:false, env:{...process.env}, stdio:['pipe','pipe','pipe'] })
    let stdout = '', stderr = '', killed = false
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL') }, timeoutMs)
    child.stdout.on('data', chunk => { stdout += String(chunk); if (Buffer.byteLength(stdout) > MAX_OUTPUT) { killed=true; child.kill('SIGKILL') } })
    child.stderr.on('data', chunk => { stderr += String(chunk).slice(0, 4096) })
    child.on('error', error => { clearTimeout(timer); reject(new CommandExecutionError(`loopctl unavailable: ${error.message}`)) })
    child.on('close', code => {
      clearTimeout(timer)
      if (killed) return reject(new CommandExecutionError('loopctl timed out or produced too much output'))
      if (code !== 0) return reject(new CommandExecutionError(`loopctl failed (exit ${code ?? 1})`))
      try { resolveResult(JSON.parse(stdout)) } catch { reject(new CommandExecutionError('loopctl returned invalid JSON')) }
    })
    child.stdin.end(input ?? '')
  })
}

export async function readConfinedFile(file: string): Promise<string> {
  if (!file || isAbsolute(file)) throw new Error('input file must be relative to the current directory')
  const cwd = resolve(process.cwd())
  const requested = resolve(cwd, file)
  const info = await lstat(requested)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('input file must be a regular non-symlink file')
  const actual = await realpath(requested)
  const rel = relative(cwd, actual)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('input file must remain inside the current directory')
  const handle = await open(requested, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new Error('input file must remain a regular file')
    const value = await handle.readFile('utf8')
    if (Buffer.byteLength(value) > MAX_INPUT) throw new Error('input file is too large')
    return value
  } finally { await handle.close() }
}

export const parseJson = (raw: string): unknown => JSON.parse(raw)
export const unwrap = <T>(value: unknown): T => {
  if (value && typeof value === 'object' && 'data' in value) return (value as {data:T}).data
  return value as T
}
