import type { SpatialSnapshot, SpatialVersion } from './spatial'

export interface SpatialDialogueGeneration {
  id: string
  sequence: number
  kind: 'normal' | 'regenerate' | 'continue'
  state: 'awaiting_body' | 'registered' | 'ignored'
  snapshot: SpatialSnapshot
  personaId: string | null
  narrativeMode: 'immersive' | 'omniscient'
  /** 发送时冻结策略；旧记录和需确认模式下的回复不会事后自动批准。 */
  syncPolicy?: 'suggest' | 'auto'
  syncEpoch?: string
  userMessageId: string | null
  userText: string
  priorMessageId?: string
  priorText?: string
  messageId?: string
  bodyHash?: string
  body?: string
  taskId?: string
  createdAt: number
}

export interface SpatialSource {
  id: string
  label: string
  kind: 'instruction' | 'message' | 'character' | 'persona' | 'lorebook' | 'group'
  text: string
  cropped?: boolean
  /** 说话者身份，用于将“我的/你的房间”等对话指代转换为稳定地点名称。 */
  speaker?: { role: 'user' | 'character' | 'narrator'; characterId?: string }
  subject?: { kind: 'character' | 'persona'; id: string }
}
export interface SpatialEvidence { sourceId: string; quote: string }
export interface SpatialAiMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  mode: 'initialize' | 'instruction' | 'positions' | 'dialogue_sync' | 'result'
  createdAt: number
  proposalId?: string
}
export interface SpatialAiProposal {
  taskId?: string
  id: string
  commitId: string
  mode: 'initialize' | 'instruction' | 'positions' | 'dialogue_sync'
  status: 'pending' | 'applied' | 'discarded' | 'stale' | 'undone'
  dialogueCandidates?: SpatialDialogueCandidate[]
  automatic?: { status: 'applying' | 'applied' | 'confirmation' | 'skipped'; reason?: string }
  reviewedFromId?: string
  /** 群聊手动地点创建关联的原剧情提案；创建地点不应用人物移动。 */
  placeForId?: string
  replacedById?: string
  canReview?: boolean
  comparisons?: Array<{ actorName: string; currentPath: string; targetPath: string }>
  appliedVersion?: SpatialVersion
  undoCommitId?: string
  discardReason?: string
  dialogueId?: string
  sourceChanged?: boolean
  staleReason?: string
  explanation: string
  summary: string[]
  unresolved: string[]
  evidence: SpatialEvidence[]
  baseVersion: SpatialVersion | null
  sourceFingerprint: string
  personaId: string | null
  sources: SpatialSource[]
  sourceOptions: { text: string; loreEntryIds: string[]; memberIds?: string[] }
  commands: unknown[]
  preview?: SpatialSnapshot
  draftCommits?: Record<string, { requestHash: string; receipt: import('./spatial').SpatialCommitReceipt }>
  createdAt: number
}

/** 主进程保留的原始动作依据。不能由渲染层补充或把非完成动作变成移动。 */
export interface SpatialDialogueCandidate {
  id: string
  actorId: string
  targetText: string
  targetNodeId?: string
  completed: boolean
  eligible: boolean
  confidence?: number
  evidence: string
  evidenceSource: 'user' | 'assistant'
  note: string
  reason?: string
}

export interface SpatialTarget {
  id: string
  boardId: string
  path: string
  canContain: boolean
}

export interface SpatialProposalReviewInput {
  /** 只传用户选择的地点 ID，正文与人物依据由主进程重新读取。 */
  targets: Record<string, string>
}
export interface SpatialAiTask {
  id: string
  requestHash: string
  mode: 'initialize' | 'instruction' | 'positions' | 'dialogue_sync'
  state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted' | 'superseded'
  dialogueId?: string
  startedAt: number
  completedAt?: number
  error?: string
  profileId?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  elapsedMs?: number
  croppedSources?: string[]
}
export interface SpatialAiSession<Scope = { characterId: string; sessionId: string; worldId: string | null; runtimeId: string | null; bindingEpoch: string | null }> {
  schemaVersion: 1
  id: string
  scope: Scope
  messages: SpatialAiMessage[]
  proposals: SpatialAiProposal[]
  tasks: SpatialAiTask[]
  dialogueGenerations?: SpatialDialogueGeneration[]
  dialogueSequence?: number
  dialogueHandled?: Record<string, string>
  groupDialogueBatches?: SpatialGroupDialogueBatch[]
  historyTrimmed?: boolean
  createdAt: number
  updatedAt: number
}
export interface SpatialAiRequest {
  requestId: string
  mode: 'initialize' | 'instruction' | 'positions'
  text: string
  loreEntryIds?: string[]
  memberIds?: string[]
}
export interface SpatialInitializationSources {
  sources: SpatialSource[]
  loreEntries: Array<{ id: string; label: string }>
  canInitialize: boolean
  sharedSessions: number
  members?: Array<{ id: string; name: string }>
}

export type SpatialGroupAiSession = SpatialAiSession<{ kind: 'group'; groupId: string; sessionId: string; worldId: string | null; runtimeId: string | null; bindingEpoch: string | null }>

export interface SpatialGroupDialogueCapture {
  generationId: string
  burstId: string
  kind: 'normal' | 'regenerate'
  expectedVersion: SpatialVersion
  targetCharacterId?: string
}
export interface SpatialGroupDialogueBatch {
  id: string
  sequence: number
  kind: 'normal' | 'regenerate'
  closed: boolean
  mode: 'mention' | 'polling' | 'free'
  narrativeMode: 'immersive' | 'omniscient'
  memberIds: string[]
  personaId: string | null
  contextFingerprint: string
  snapshot: SpatialSnapshot
  userMessageId: string | null
  userText: string
  generations: Array<{ id: string; targetCharacterId?: string; messageIds: string[]; bodyHashes: string[]; state: 'awaiting_body' | 'registered' | 'ignored' }>
  sourceFingerprint?: string
  createdAt: number
}

