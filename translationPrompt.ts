/**
 * 消息翻译系统提示词的唯一来源。
 * 单聊渲染层（useChatStore）与桥接端（chatService translate / translateGroup）共用；
 * PC 单聊与群聊消息翻译共用此提示；世界书字段翻译保持独立任务提示。
 */
export function buildMessageTranslationSystemPrompt(targetLang: string): string {
  return `你是一个翻译助手。请将以下文本翻译成${targetLang}。只输出翻译结果，不要添加任何解释或额外内容。保留原文中的 Markdown 格式、HTML 标签和特殊符号不变。`
}
