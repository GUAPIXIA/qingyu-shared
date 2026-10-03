import { resolveMessageSpeakerKind } from './messageIdentity'
import type { DialogueDirection, Message, GroupMessage, LorebookCompressionCacheEntry } from './types'

export type FeatureOwner = { kind: 'single'; characterId: string; sessionId: string } | { kind: 'group'; groupId: string; sessionId: string }
export type EditorOwner = { kind: 'editor'; editor: string; objectId: string; instanceId: string }
export type FeatureTaskOwner = FeatureOwner | EditorOwner
export type TextFeature = 'translation' | 'direction' | 'title' | 'compression' | 'memory' | 'editing'
export interface FeatureMessageRef { id: string; fingerprint: string }
export interface FeatureSource {
  messages: FeatureMessageRef[]
  /** whole：标题/方向失效于新一轮；range：记忆或压缩只核对选定范围。 */
  mode: 'whole' | 'range' | 'message'
  range?: { startTs: number; endTs: number }
  session?: Record<string, string | number | boolean | null>
  groupFingerprint?: string
  artifactKey?: string
}
export type FeatureCommit = { taskId: string; source: FeatureSource } & (
  | { feature: 'lorebook_compression'; cacheKey: string; entry: LorebookCompressionCacheEntry }
  | { feature: 'translation'; messageId: string; language: string; text: string }
  | { feature: 'direction'; messageId: string; directions: DialogueDirection[] }
  | { feature: 'title'; expectedTitle: string; text: string }
  | { feature: 'compression'; expectedCompression: string; text: string; range: { startTs: number; endTs: number } }
)

/** 版本比较用的双路 fingerprint；正文不重复存入来源引用，不用于安全签名。 */
export function featureFingerprint(value: unknown): string {
  const text = JSON.stringify(value)
  let a = 2166136261, b = 5381
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    a = Math.imul(a ^ code, 16777619)
    b = Math.imul(b, 33) ^ code
  }
  return `${text.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`
}
export function featureOwnerKey(owner: FeatureTaskOwner): string {
  if (owner.kind === 'editor') return JSON.stringify([owner.kind, owner.editor, owner.objectId, owner.instanceId])
  return JSON.stringify([owner.kind, owner.kind === 'single' ? owner.characterId : owner.groupId, owner.sessionId])
}
export function messageRef(message: Message | GroupMessage): FeatureMessageRef {
  const single = message as Message
  return { id: message.id, fingerprint: featureFingerprint([
    message.characterId, single.sessionId, (message as GroupMessage).groupId, single.role,
    message.content, single.swipeIndex ?? (single.role === 'assistant' ? 0 : null), single.spatialGenerationId ?? null,
    (message as GroupMessage).spatialGroupGenerationId ?? null, message.narrativeMode ?? null,
    resolveMessageSpeakerKind(message), message.timestamp,
  ]) }
}
export function featureSource(messages: Array<Message | GroupMessage>, mode: FeatureSource['mode'] = 'whole', session?: FeatureSource['session']): FeatureSource {
  return { messages: messages.map(messageRef), mode, ...(session ? { session } : {}) }
}
/** 即使输入窗口略过空消息/系统消息，范围引用也保留它们，避免两端校验口径不一致。 */
export function featureRangeSource(all: Array<Message | GroupMessage>, selected: Array<Message | GroupMessage>, session?: FeatureSource['session']): FeatureSource {
  const start = all.findIndex(m => m.id === selected[0]?.id)
  const end = all.findIndex(m => m.id === selected.at(-1)?.id)
  return featureSource(start >= 0 && end >= start ? all.slice(start, end + 1) : [], 'range', session)
}
export function matchesFeatureSource(source: FeatureSource, messages: Array<Message | GroupMessage>, session?: object, group?: unknown): boolean {
  if (!source || !Array.isArray(source.messages) || !source.messages.length) return false
  if (source.session && Object.entries(source.session).some(([key, value]) =>
    ((session as Record<string, unknown> | undefined)?.[key] ?? null) !== value)) return false
  if (source.groupFingerprint && (group === undefined || featureFingerprint(group) !== source.groupFingerprint)) return false
  const refs = messages.map(messageRef)
  const selected = source.range
    ? refs.filter((_, index) => messages[index].timestamp >= source.range!.startTs && messages[index].timestamp <= source.range!.endTs)
    : source.mode === 'whole' ? refs
      : source.mode === 'message' ? refs.filter(ref => source.messages.some(item => item.id === ref.id))
        : refs.slice(refs.findIndex(ref => ref.id === source.messages[0].id), refs.findIndex(ref => ref.id === source.messages.at(-1)!.id) + 1)
  return JSON.stringify(selected) === JSON.stringify(source.messages)
}
export function groupFeatureScope(group: { memberIds: string[]; chatMode: string }): unknown {
  return [group.memberIds, group.chatMode]
}
export function featureSessionRef(session: object | undefined, keys = ['narrativeMode', 'personaId']): FeatureSource['session'] {
  return Object.fromEntries(keys.map(key => [key, (session as Record<string, string | number | boolean> | undefined)?.[key] ?? null]))
}
export function compressionVersion(session: { compressedSummary?: string | null; compressedRange?: unknown }): string {
  return featureFingerprint([session.compressedSummary ?? null, session.compressedRange ?? null])
}
export function assertFeatureCommit(commit: FeatureCommit): void {
  if (!commit || typeof commit.taskId !== 'string' || !commit.taskId || !commit.source) throw new Error('功能来源无效')
  if (commit.feature === 'lorebook_compression') {
    if (!commit.cacheKey || commit.source.artifactKey !== commit.cacheKey || !commit.entry?.summary?.trim()
      || !Array.isArray(commit.entry.entryKeys) || commit.entry.entryKeys.some(key => typeof key !== 'string') || !Number.isFinite(commit.entry.createdAt)) throw new Error('世界书压缩来源无效')
    return
  }
  if (!commit.source.messages?.length) throw new Error('功能来源无效')
  if (!['translation', 'direction', 'title', 'compression'].includes(commit.feature)) throw new Error('功能类型无效')
  if (commit.feature === 'direction') {
    if (!Array.isArray(commit.directions) || commit.directions.length > 10 || commit.directions.some(item => !item || typeof item.id !== 'string' || typeof item.label !== 'string' || typeof item.content !== 'string')) throw new Error('方向结果无效')
  } else if (typeof commit.text !== 'string' || !commit.text.trim()) throw new Error('功能结果为空')
}
export function validCompression(session: { compressedSource?: FeatureSource | null }, messages: Array<Message | GroupMessage>, group?: unknown): boolean {
  return !!session.compressedSource && matchesFeatureSource(session.compressedSource, messages, session, group)
}
