import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { ChatTranscript, ExportTranscriptRequest, ExportTranscriptResult } from './handoff-types.js'
import { chatTranscriptSchema, exportTranscriptRequestSchema } from './handoff-protocol.js'

/** Only the public read-only target methods needed by handoff. No session log reads. */
export interface HandoffTargetServices {
  workspaceRegistry?: { get(id: string): { readonly path: string } | undefined | Promise<{ readonly path: string } | undefined> }
  sessionPersistence?: { open(id: string, access: 'read', options?: { signal?: AbortSignal }): Promise<{
    readonly header: { readonly cwd?: string }; close(): Promise<void>
  }> }
}
export class HandoffExportError extends Error {}

function abortable<T>(promise: Promise<T>, signal: AbortSignal, releaseUnclaimed?: (value: T) => Promise<void>): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    let cancelled = false
    const abort = () => { cancelled = true; reject(signal.reason ?? new HandoffExportError('Handoff export was cancelled.')) }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(value => {
      if (cancelled || signal.aborted) {
        if (releaseUnclaimed) void releaseUnclaimed(value).catch(() => {})
        reject(signal.reason ?? new HandoffExportError('Handoff export was cancelled.'))
      } else resolve(value)
    }, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export function renderTranscriptMarkdown(value: ChatTranscript): string {
  const transcript = chatTranscriptSchema.parse(value)
  const lines = [
    `# ${transcript.title.replace(/\r?\n/g, ' ') || 'DeepSeek CHAT handoff'}`, '',
    `Source: ${transcript.sourceUrl}`, `Captured at: ${new Date(transcript.capturedAt).toISOString()}`,
    `Scope: ${transcript.scope}`, `Scope note: ${transcript.scopeNote}`, `Branch: ${transcript.branchSignature}`, '',
    'Attachment notes describe the source only; attachment binaries are not copied.', '',
  ]
  for (const [index, message] of transcript.messages.entries()) {
    lines.push(`## ${index + 1}. ${message.role === 'user' ? 'User' : 'Assistant'}`, '', message.markdown, '')
    if (message.attachments?.length) lines.push('Source attachments:', ...message.attachments.map(note => `- ${note}`), '')
  }
  return lines.join('\n') + '\n'
}

async function targetDirectory(request: ExportTranscriptRequest, services: HandoffTargetServices, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted()
  let directory: string | undefined
  const target = request.target
  if (target.kind === 'directory') directory = target.directory
  else if (target.kind === 'workspace') {
    if (!services.workspaceRegistry) throw new HandoffExportError('Local workspace service is unavailable. Choose an existing local directory.')
    directory = (await abortable(Promise.resolve(services.workspaceRegistry.get(target.workspaceId)), signal))?.path
  } else {
    if (!services.sessionPersistence) throw new HandoffExportError('Local session service is unavailable. Choose an existing local directory.')
    const handle = await abortable(services.sessionPersistence.open(target.sessionId, 'read', { signal }), signal, value => value.close())
    try { signal.throwIfAborted(); directory = handle.header.cwd }
    finally { await handle.close() }
  }
  signal.throwIfAborted()
  if (!directory || !isAbsolute(directory) || directory.includes('\0')) throw new HandoffExportError('Choose an absolute existing local directory.')
  const canonical = await realpath(directory)
  if (!(await stat(canonical)).isDirectory()) throw new HandoffExportError('The handoff target must be an existing local directory.')
  signal.throwIfAborted()
  return canonical
}

async function ensureChild(parent: string, name: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted()
  const child = join(parent, name)
  try { await mkdir(child) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  const info = await lstat(child)
  if (info.isSymbolicLink() || !info.isDirectory() || await realpath(child) !== child) {
    throw new HandoffExportError('Unsafe symbolic-link export path; choose another local target directory.')
  }
  signal.throwIfAborted()
  return child
}

/** Exclusive atomic publication: a retry may reuse identical bytes, never replace a transcript. */
export async function exportTranscript(value: ExportTranscriptRequest, services: HandoffTargetServices, parent: AbortSignal): Promise<ExportTranscriptResult> {
  const signal = AbortSignal.any([parent, AbortSignal.timeout(30_000)])
  signal.throwIfAborted()
  const request = exportTranscriptRequestSchema.parse(value)
  if (request.transcript.scope === 'loaded' && !request.allowPartial) throw new HandoffExportError('Explicit acceptance is required for a partial transcript.')
  const directory = await targetDirectory(request, services, signal)
  let container = directory
  for (const component of ['.dsh', 'chat-handoffs']) container = await ensureChild(container, component, signal)
  const stableDirectory = join(container, request.transcript.id)
  const filePath = join(stableDirectory, 'transcript.md')
  const temporary = join(container, `.handoff-${randomUUID()}.tmp`)
  const markdown = renderTranscriptMarkdown(request.transcript)
  let temporaryCreated = false
  try {
    await mkdir(temporary)
    temporaryCreated = true
    const handle = await open(join(temporary, 'transcript.md'), 'wx', 0o600)
    try { await handle.writeFile(markdown, { encoding: 'utf8', signal }); await handle.sync() }
    finally { await handle.close() }
    signal.throwIfAborted()
    try { await rename(temporary, stableDirectory); temporaryCreated = false }
    catch (error) {
      // Renaming a complete directory publishes all bytes together. Both Windows
      // and POSIX refuse replacement of an existing nonempty stable directory.
      let stable
      try { stable = await lstat(stableDirectory) } catch { throw error }
      if (stable.isSymbolicLink() || !stable.isDirectory() || await realpath(stableDirectory) !== stableDirectory) {
        throw new HandoffExportError('Unsafe symbolic-link export path; choose another local target directory.')
      }
      const info = await lstat(filePath)
      if (info.isSymbolicLink() || !info.isFile() || await readFile(filePath, 'utf8') !== markdown) {
        throw new HandoffExportError('A different transcript already exists for this handoff id. Capture a new handoff.')
      }
    }
    signal.throwIfAborted()
    return { filePath, directory }
  } finally { if (temporaryCreated) await rm(temporary, { recursive: true, force: true }) }
}
