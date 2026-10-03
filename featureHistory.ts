import type { SpatialAiSession, SpatialGroupAiSession } from './spatial-ai'

/** 裁剪展示历史时保留未解决任务及提案的提交、核对和撤销引用。 */
export function trimFeatureHistory(state: SpatialAiSession | SpatialGroupAiSession): void {
  const proposals = new Set(state.proposals.slice(-20).map(item => item.id))
  for (const item of state.proposals) if (item.status === 'pending' || (item.status === 'stale' && item.canReview && !item.replacedById)) proposals.add(item.id)
  let changed = true
  while (changed) {
    changed = false
    for (const item of state.proposals.filter(item => proposals.has(item.id))) {
      for (const id of [item.reviewedFromId, item.placeForId, item.replacedById]) if (id && !proposals.has(id)) { proposals.add(id); changed = true }
    }
  }
  state.proposals = state.proposals.filter(item => proposals.has(item.id))
  const tasks = new Set([...state.tasks.slice(-100).map(item => item.id), ...state.proposals.map(item => item.taskId)])
  for (const task of state.tasks) if (['queued', 'running', 'failed', 'interrupted'].includes(task.state)) tasks.add(task.id)
  const generations = new Set([
    ...(state.dialogueGenerations?.slice(-20).map(item => item.id) ?? []),
    ...state.proposals.map(item => item.dialogueId),
    ...state.tasks.filter(item => tasks.has(item.id)).map(item => item.dialogueId),
  ])
  state.dialogueGenerations = state.dialogueGenerations?.filter(item => generations.has(item.id))
  for (const generation of state.dialogueGenerations ?? []) if (generation.taskId) tasks.add(generation.taskId)
  if ('groupDialogueBatches' in state) {
    for (const batch of state.groupDialogueBatches?.slice(-20) ?? []) generations.add(batch.id)
    state.groupDialogueBatches = state.groupDialogueBatches?.filter(item => generations.has(item.id))
  }
  state.tasks = state.tasks.filter(item => tasks.has(item.id))
  const messages = state.messages.filter((item, index) => index >= state.messages.length - 200 || (item.proposalId && proposals.has(item.proposalId)))
  if (messages.length !== state.messages.length) state.historyTrimmed = true
  state.messages = messages
}
