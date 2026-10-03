/**
 * 跨宿主共享的上下文消息 DTO（buildContext 的中间产物，最终经 convertMessages 转为 provider 格式）。
 *
 * 阶段 1（2026-10-03，结构优化）说明：单聊 store 的界面状态与动作接口（原 ChatState /
 * StoreSet / StoreGet / 生图任务类型）已迁至 `src/features/chat/chatStoreTypes.ts`；
 * 本文件只保留主进程与渲染层共用的纯 DTO，shared 不再依赖渲染状态。
 */
export type ContextMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
  /** 图片 data URL 数组（仅用户消息携带，供 vision 模型识别） */
  images?: string[]
  keepSeparate?: boolean
}