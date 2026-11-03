/**
 * `<thought>` 是产品协议：只表示故事角色的内心独白。
 * `<think>` / `<thinking>` 是常见的供应商或模型推理标记，不能进入角色消息。
 */
const VENDOR_THINKING_BLOCK = /<\s*(?:think|thinking)\b[^>]*>[\s\S]*?(?:<\s*\/\s*(?:think|thinking)\s*>|$)/gi
const ORPHAN_VENDOR_THINKING_TAG = /<\s*\/\s*(?:think|thinking)\s*>/gi

/** 删除供应商推理标记及其内容，同时原样保留产品级 `<thought>` 块。 */
export function stripVendorThinking(text: string): string {
  if (!text) return text
  return text
    .replace(VENDOR_THINKING_BLOCK, '')
    .replace(ORPHAN_VENDOR_THINKING_TAG, '')
}

const PRODUCT_THOUGHT_BLOCK = /<\s*thought\b[^>]*>[\s\S]*?(?:<\s*\/\s*thought\s*>|$)/gi
const ORPHAN_PRODUCT_THOUGHT_TAG = /<\s*\/\s*thought\s*>/gi

/**
 * 辅助链路（翻译/摘要/标题/角色卡生成/生图提示词/TTS 等）的唯一思考清洗入口：
 * 删除供应商推理标记与产品级 `<thought>` 块（含未闭合尾部与孤儿闭合标签）并 trim。
 * 主对话气泡需要保留/提取 thought 内容，不走这里（用 messagePostProcess.extractThought）。
 */
export function stripAllThinking(text: string): string {
  if (!text) return text
  return text
    .replace(VENDOR_THINKING_BLOCK, '')
    .replace(ORPHAN_VENDOR_THINKING_TAG, '')
    .replace(PRODUCT_THOUGHT_BLOCK, '')
    .replace(ORPHAN_PRODUCT_THOUGHT_TAG, '')
    .trim()
}

/**
 * 流式删除器：跨 chunk 识别 `<think>` / `<thinking>`，只向 UI 放行可见正文。
 * 未闭合的供应商推理块在流结束时整体丢弃。
 */
export function createVendorThinkingStreamFilter(): {
  push: (chunk: string) => string
  flush: () => string
} {
  let pending = ''
  let insideVendorThinking = false
  const openTag = /<\s*(?:think|thinking)\b[^>]*>/i
  const closeTag = /<\s*\/\s*(?:think|thinking)\s*>/i

  const potentialOpenStart = (value: string): number => {
    const start = value.lastIndexOf('<')
    if (start < 0) return -1
    const candidate = value.slice(start).toLowerCase()
    if (candidate.includes('>')) return -1
    const match = candidate.match(/^<\s*([a-z]*)/)
    if (!match) return -1
    const letters = match[1]
    const remainder = candidate.slice(match[0].length)
    if (!letters) return remainder ? -1 : start
    if (letters === 'think' || letters === 'thinking') {
      return !remainder || /^\s/.test(remainder) ? start : -1
    }
    if (!remainder && ('think'.startsWith(letters) || 'thinking'.startsWith(letters))) return start
    return -1
  }

  return {
    push(chunk: string): string {
      if (!chunk) return ''
      pending += chunk
      let visible = ''

      while (pending) {
        if (insideVendorThinking) {
          const close = closeTag.exec(pending)
          if (!close) return visible
          pending = pending.slice(close.index + close[0].length)
          insideVendorThinking = false
          continue
        }

        const open = openTag.exec(pending)
        if (open) {
          visible += pending.slice(0, open.index)
          pending = pending.slice(open.index + open[0].length)
          insideVendorThinking = true
          continue
        }

        const partialStart = potentialOpenStart(pending)
        if (partialStart >= 0) {
          visible += pending.slice(0, partialStart)
          pending = pending.slice(partialStart)
        } else {
          visible += pending
          pending = ''
        }
        return visible
      }
      return visible
    },
    flush(): string {
      if (insideVendorThinking) {
        pending = ''
        return ''
      }
      const visible = pending
      pending = ''
      return visible
    },
  }
}

/**
 * 供应商控制/安全标记清洗（2026-11-01 群聊实机问题修复）。
 *
 * 实测 opencode.ai / deepseek-v4.1-flash 端点偶发把内部标记写进正文：
 * - 未闭合的安全分类块：`<ds_safety>[用户未成年]否 [分类]其他 [判定]…安全。`；
 * - 预算/控制块：`<budget:token_budget>200000</budget:token_budget>`；
 * - 占位/结束标记：`@@末尾@@`、`[[白纸符]]` 等双方括号占位；
 * - `<｜…` 特殊 token 残留。
 *
 * 这些属于供应商元信息，不能进入角色正文、落盘或上下文。产品级 `<thought>` 原样保留。
 */
const PROVIDER_SAFETY_BLOCK = /<ds_[a-z0-9_]+(?:\s[^>]*)?>[\s\S]*?(?:<\/ds_[a-z0-9_]+>|$)/gi
const PROVIDER_BUDGET_BLOCK = /<budget:[^>]*>[\s\S]*?(?:<\/budget:[^>]*>|$)/gi
const PROVIDER_PLACEHOLDER_MARKER = /@@[^@\n]{0,40}@@/g
const PROVIDER_BRACKET_MARKER = /\[\[[^[\]\n]{0,30}\]\]/g
const PROVIDER_SPECIAL_TOKEN = /<\uff5c[\s\S]*?(?:\uff5c>|$)/g

/** 删除已知的供应商安全/预算/占位/特殊 token；未闭合时按“从标记到结尾”处理。 */
export function stripProviderControlMarkup(text: string): string {
  if (!text) return text
  return text
    .replace(PROVIDER_SAFETY_BLOCK, '')
    .replace(PROVIDER_BUDGET_BLOCK, '')
    .replace(PROVIDER_SPECIAL_TOKEN, '')
    .replace(PROVIDER_PLACEHOLDER_MARKER, '')
    .replace(PROVIDER_BRACKET_MARKER, '')
}

/** 孤儿 `</thought>`（无任何 `<thought>` 开启标签）从正文中删除；成对 thought 不受影响。 */
export function stripOrphanThoughtCloseTags(text: string): string {
  if (!text) return text
  if (/<thought\b/i.test(text)) return text
  return text.replace(/<\s*\/\s*thought\s*>/gi, '')
}

/**
 * 模型把“规划/自检”写成正文（而非 thought）的识别：这类内容不是角色内容，不能落盘。
 * 例：`todo 当前发言角色是 Aiko，不是 Tofu！…`；`Let me just write Aiko's response.`
 */
const MODEL_PLANNING_PATTERNS: readonly RegExp[] = [
  /^(?:todo|TODO)\b/,
  /(当前发言角色|本轮只由|规则要求|需要输出|改为\s*\S+\s*回应)/,
  /^(?:Let me|I need to|I should|The current speaker|As the assistant)\b/i,
  /^(?:safe|ok|done|pass)$/i,
]

export function looksLikeModelPlanning(text: string): boolean {
  const value = text.trim()
  if (!value) return false
  if (value.length <= 12 && /^(?:safe|ok|done|pass)$/i.test(value)) return true
  return MODEL_PLANNING_PATTERNS.some((pattern) => pattern.test(value))
}


