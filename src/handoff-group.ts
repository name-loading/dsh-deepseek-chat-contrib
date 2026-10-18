import type { ChatMessage, ChatTranscript } from './handoff-types.js'

export interface TranscriptTurn {
  /** Stable key for selection: the id of this turn's first message. */
  readonly key: string
  readonly title: string
  readonly messages: readonly ChatMessage[]
}

const MAX_TITLE_LENGTH = 80

function firstLine(text: string): string {
  const line = text.split('\n').map(part => part.trim()).find(Boolean) ?? ''
  return line.length > MAX_TITLE_LENGTH ? `${line.slice(0, MAX_TITLE_LENGTH)}…` : line
}

/**
 * Build one collapsible group per user message so a long captured transcript can
 * be reviewed by opening only the turns that matter.
 */
export function groupTranscriptTurns(messages: readonly ChatMessage[]): TranscriptTurn[] {
  const turns: { key: string; title: string; messages: ChatMessage[] }[] = []
  for (const message of messages) {
    const last = turns.at(-1)
    const startsTurn = message.role === 'user' || last === undefined || last.messages.every(item => item.role !== 'user')
    if (startsTurn) {
      const text = firstLine(message.markdown)
      turns.push({
        key: message.id,
        title: message.role === 'user' ? (text || '（用户消息）') : `助手回复 · ${text || '（无文本）'}`,
        messages: [message],
      })
      continue
    }
    if (!last) continue
    last.messages.push(message)
  }
  return turns
}

/**
 * Keep only the turns the user left selected. Unselected turns are removed from
 * both the API summary request and the exported transcript file.
 */
export function filterTranscript(
  transcript: ChatTranscript,
  deselectedTurnKeys: readonly string[],
): { readonly transcript: ChatTranscript; readonly selected: number; readonly total: number } {
  const turns = groupTranscriptTurns(transcript.messages)
  if (!deselectedTurnKeys.length) return { transcript, selected: turns.length, total: turns.length }
  const excluded = new Set(deselectedTurnKeys)
  const selectedTurns = turns.filter(turn => !excluded.has(turn.key))
  const messages = Object.freeze(selectedTurns.flatMap(turn => turn.messages))
  const note = `本文件仅包含用户勾选的 ${selectedTurns.length}/${turns.length} 轮对话。`
  return {
    transcript: Object.freeze({
      ...transcript,
      messages,
      scopeNote: transcript.scopeNote.includes(note) ? transcript.scopeNote : `${transcript.scopeNote} ${note}`,
    }),
    selected: selectedTurns.length,
    total: turns.length,
  }
}
