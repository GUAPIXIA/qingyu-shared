/**
 * 文本度量工具：可见字符计数与完整句判定。
 *
 * 续写长度校验与方向选项校验共用同一口径，避免出现
 * “界面显示 80 字、模型按 90 字理解”这类跨模块不一致。
 */

/** 句末标点：以这些字符收尾视为一个完整句（方案 §6.5）。 */
export const SENTENCE_END_CHARS: ReadonlySet<string> = new Set([
  '。', '！', '？', '…', '!', '?',
])

/** 收尾后可以忽略的成对符号（引号、括号、书名号）。 */
const CLOSING_MARKS = /[\s"'”’」』）)】\]》]+$/

/**
 * 可见字符统计：忽略空白，按码点计数（emoji 与代理对按 1 个字符计）。
 * 与 `String.length` 的区别在于不把换行、缩进算进篇幅。
 */
export function countVisibleCharacters(text: string): number {
  return Array.from(text.replace(/\s/g, '')).length
}

/**
 * 是否以完整句收尾。
 * 先剥离末尾成对符号（`她说：“走吧。”` 视为完整），再看最后一个字符是否句末标点。
 * 悬空动作、逗号、顿号、连接词结尾一律判为不完整，用于识别被 maxTokens 截断的输出。
 */
export function isCompleteSentence(text: string): boolean {
  const stripped = text.trim().replace(CLOSING_MARKS, '')
  if (!stripped) return false
  const chars = Array.from(stripped)
  return SENTENCE_END_CHARS.has(chars[chars.length - 1])
}

/**
 * 在可见字符上限内寻找最后一个句末标点，把超长文本安全收束到句边界。
 * 收束结果必须仍落在 [minChars, maxChars] 内，否则返回 undefined（交由压缩修复处理）。
 */
export function trimToSentenceBoundary(
  text: string,
  bounds: { minChars: number; maxChars: number },
): string | undefined {
  const chars = Array.from(text)
  let visible = 0
  let lastBoundary: number | undefined

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]
    // 先判上限再记边界，避免把超出 ceiling 的那一句也算进来
    if (!/\s/.test(char)) {
      visible += 1
      if (visible > bounds.maxChars) break
    }
    if (SENTENCE_END_CHARS.has(char)) lastBoundary = i + 1
  }

  if (lastBoundary === undefined) return undefined
  const candidate = chars.slice(0, lastBoundary).join('').trimEnd()
  const candidateChars = countVisibleCharacters(candidate)
  if (candidateChars < bounds.minChars || candidateChars > bounds.maxChars) return undefined
  return candidate
}

// ===================== 格式闭合诊断（阶段0基线观测） =====================

/** 成对中文引号/括号：开符号与闭符号数量必须相等 */
const PAIRED_MARKS: Array<[string, string]> = [
  ['“', '”'],
  ['‘', '’'],
  ['「', '」'],
  ['『', '』'],
  ['（', '）'],
  ['《', '》'],
]

function countOccurrences(text: string, token: string): number {
  return token ? text.split(token).length - 1 : 0
}

/**
 * 确定性闭合兜底：补齐悬空的开符号（引号/括号/书名号）与奇数星号。
 *
 * 输入续写把结果直接写进输入框，模型常在台词中途停笔（如 `…清了清嗓子说：“那就来吧。`），
 * `isCompleteSentence` 只看句末标点，会把这类未闭合文本当作完整句放行。
 * 这里不调用模型，直接按缺口补闭合符；末尾只剩开符号时删掉悬空开符号，避免补出空标记对。
 * 幂等：已闭合文本原样返回。
 */
export function closeDanglingMarks(text: string): string {
  if (!text) return text
  let out = text
  for (const [open, close] of PAIRED_MARKS) {
    let openCount = countOccurrences(out, open)
    const closeCount = countOccurrences(out, close)
    // 悬空开符号后没有内容：删掉它，不补空对
    while (openCount > closeCount && out.trimEnd().endsWith(open)) {
      const trimmed = out.trimEnd()
      out = trimmed.slice(0, -open.length).trimEnd()
      openCount--
    }
    if (openCount > closeCount) out += close.repeat(openCount - closeCount)
  }
  if (countOccurrences(out, '*') % 2 === 1) out += '*'
  return out
}

/** 正文尾部采样长度（观测记录用，避免落盘完整正文） */
export const TAIL_SAMPLE_MAX_CHARS = 80

/** 取正文尾部采样（按码点截断），用于本地诊断记录 */
export function tailSample(text: string, maxChars: number = TAIL_SAMPLE_MAX_CHARS): string {
  if (!text) return ''
  const chars = Array.from(text.replace(/\s+/g, ' ').trim())
  return chars.length <= maxChars ? chars.join('') : chars.slice(chars.length - maxChars).join('')
}

/**
 * 正文格式闭合性诊断（阶段0：未闭合格式率统计口径）。
 * - balancedQuotes：中文引号/括号成对；
 * - balancedAsterisks：星号数量为偶数（旧动作段样式）；
 * - closedThought：不存在未闭合的 <thought> 标签；
 * - unclosed：以上任一不满足。
 */
export interface TextClosureDiagnostics {
  balancedQuotes: boolean
  balancedAsterisks: boolean
  closedThought: boolean
  unclosed: boolean
}

export function analyzeTextClosure(text: string): TextClosureDiagnostics {
  if (!text) {
    return { balancedQuotes: true, balancedAsterisks: true, closedThought: true, unclosed: false }
  }
  let balancedQuotes = true
  for (const [open, close] of PAIRED_MARKS) {
    const openCount = text.split(open).length - 1
    const closeCount = text.split(close).length - 1
    if (openCount !== closeCount) {
      balancedQuotes = false
      break
    }
  }
  const asterisks = text.split('*').length - 1
  const balancedAsterisks = asterisks % 2 === 0
  // 剥掉完整 <thought>...</thought> 块后不应残留起始标签
  const closedThought = !/<thought[\s>]/i.test(
    text.replace(/<thought[\s\S]*?<\/thought>/gi, ''),
  )
  return {
    balancedQuotes,
    balancedAsterisks,
    closedThought,
    unclosed: !balancedQuotes || !balancedAsterisks || !closedThought,
  }
}
