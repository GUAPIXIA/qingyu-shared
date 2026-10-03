/** PC 提交协议；领域文档与命令在主进程和独立画板中分别校验。 */
export interface SpatialVersion {
  worldId: string
  runtimeId: string
  bindingEpoch: string
  runtimeRevision: number
  worldFingerprint: string
}

export interface SpatialSnapshot {
  world: unknown
  runtime: unknown
  version: SpatialVersion
  /** 群聊视图仅展示当前成员和用户身份，不改变历史位置。 */
  activeActorIds?: string[]
}

export interface SpatialEditorCommit {
  commitId: string
  worldId: string
  runtimeId: string
  bindingEpoch: string
  expectedRuntimeRevision: number
  expectedWorldFingerprint: string
  commands: unknown[]
}

export interface SpatialCommitReceipt {
  commitId: string
  revisionBefore: number
  revisionAfter: number
  worldFingerprintAfter: string
}

export type SpatialCommitResult =
  | { ok: true; snapshot: SpatialSnapshot; receipt: SpatialCommitReceipt; duplicate: boolean }
  | { ok: false; code: string; message: string; snapshot?: SpatialSnapshot }

export interface SpatialUpdatedEvent {
  kind?: 'single' | 'group'
  characterId?: string
  groupId?: string
  sessionId: string
  worldId: string
  commitId: string
}

/** 对话上下文只携带位置投影和诊断，不携带编辑指令或助手历史。 */
export interface SpatialContext {
  text: string
  minimalText: string
  tokens: number
  minimalTokens: number
  cropped: string[]
  snapshotId: string
  version: SpatialVersion
  characterOffstage: boolean
}

export interface SpatialGroupContext extends SpatialContext {
  groupId: string
  sessionId: string
  memberIds: string[]
  narrativeMode: 'immersive' | 'omniscient'
  targetCharacterId?: string
  offstageCharacterIds: string[]
}
