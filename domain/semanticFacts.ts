/**
 * 事实语义检索的跨端领域 DTO。
 *
 * 权威定义在领域层；IPC 契约（`shared/ipc-api.ts`）引用并再导出，
 * 避免在 IPC 层与共享核心中复制同义类型。
 */
export interface FactSearchHit {
  text: string
  index: number
  score: number
}