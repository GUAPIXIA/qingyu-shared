/**
 * 阶段 6 S6-01：free（AI 自选）模式多角色回复的拆分与归属——**跨端共享的纯逻辑**。
 *
 * 为什么必须共享：free 模式一次生成返回多角色发言，按「【角色名】」标记拆分成
 * 多条消息。拆分规则（旁白并入首段、未识别角色旁注归属、空段丢弃、无标记回落
 * 首成员）直接决定**消息条数与角色归属**；两端不一致会让同一段群聊在两端拥有
 * 不同的消息序列，影响导出、记忆摘要、上下文与同步。
 *
 * oracle 消费方：PC `src/store/groupStreamController.ts` 的 `splitAndSaveMessages`。
 *
 * 语义钉子（历史行为，禁止"顺手修复"）：
 * - omniscient（全知叙事）**不拆分**：整条作为单一成员回应，避免【判定】/【可选行动】
 *   被分段器误识别；
 * - 首个标记之前的旁白并入首段（`\n\n` 连接，空部��丢弃）；
 * - 未识别角色名的内容旁注为「⚠️ 未识别角色「名」: 内容」：若上一条归属**首成员**则并入，
 *   否则新建一条首成员消息；识别到但正文为空的段直接丢弃（无旁注）。
 */

export interface FreeSplitMember {
  id: string
  name: string
}

export interface FreeSplitMessage {
  characterId: string
  content: string
}

export interface FreeSplitResult {
  /** narrator=全知叙事单条；segments=按【角色名】拆分；fallback=无任何标记回落首成员 */
  kind: 'narrator' | 'segments' | 'fallback'
  messages: FreeSplitMessage[]
}

/** 拆分后无正文时的占位文本（与 PC 一致）。 */
export const FREE_SPLIT_EMPTY_CONTENT = '(无回复)'

const UNRECOGNIZED_PREFIX = '⚠️ 未识别角色「'

export function splitFreeReply(input: {
  content: string
  members: readonly FreeSplitMember[]
  narrativeMode?: string | null
}): FreeSplitResult {
  const { content, members } = input

  // 全知叙事：保留为单条实际成员回应（无成员时归属 __narrator__）
  if (input.narrativeMode === 'omniscient') {
    return {
      kind: 'narrator',
      messages: [{
        characterId: members[0]?.id ?? '__narrator__',
        content: content || FREE_SPLIT_EMPTY_CONTENT,
      }],
    }
  }

  // 按 【角色名】 拆段（非贪婪；段内容=本标记与下一标记之间的文本）
  const pattern = /【(.+?)】/g
  const segments: { name: string; content: string }[] = []
  let lastIdx = 0
  let preamble = ''
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) {
    const textBefore = content.slice(lastIdx, match.index).trim()
    if (segments.length === 0) {
      // 首个标记前的旁白先暂存，段数组收尾时并入首段（避免被后续迭代覆盖）
      preamble = textBefore
      segments.push({ name: match[1], content: '' })
    } else {
      segments[segments.length - 1].content = textBefore
      segments.push({ name: match[1], content: '' })
    }
    lastIdx = match.index + match[0].length
  }
  if (segments.length > 0) {
    segments[segments.length - 1].content = content.slice(lastIdx).trim()
    if (preamble) {
      segments[0].content = [preamble, segments[0].content].filter(Boolean).join('\n\n')
    }
  }

  if (segments.length === 0) {
    // 没有任何角色标记 → 回落首成员，避免渲染为不可见消息
    return {
      kind: 'fallback',
      messages: [{
        characterId: members[0]?.id ?? '__free__',
        content: content || FREE_SPLIT_EMPTY_CONTENT,
      }],
    }
  }

  const messages: FreeSplitMessage[] = []
  for (const seg of segments) {
    // 大小写不敏感 + 去除空格 进行角色名匹配
    const segName = seg.name.toLowerCase().trim()
    const char = members.find((c) => c.name.toLowerCase().trim() === segName)
    if (!char || !seg.content) {
      // 未识别角色：旁注归属首成员（上一条已是首成员则并入，否则新建）
      if (seg.content && members.length > 0) {
        const note = UNRECOGNIZED_PREFIX + seg.name + '」: ' + seg.content
        const fallbackSeg = messages.length > 0 ? messages[messages.length - 1] : null
        if (fallbackSeg && fallbackSeg.characterId === members[0].id) {
          fallbackSeg.content += '\n\n' + note
        } else {
          messages.push({ characterId: members[0].id, content: note })
        }
      }
      continue
    }
    messages.push({ characterId: char.id, content: seg.content })
  }
  return { kind: 'segments', messages }
}

/**
 * 单发言者（polling/mention）模式的角色名前缀剥离。
 *
 * 群聊历史消息按 `【角色名】内容` 渲染（见 groupContextBlocks.mapGroupHistoryMessages），
 * 模型会模仿该格式；单发言者模式下这些前缀不属于正文，且前缀角色可能与计划发言者不一致
 * （实测 Tofu 的消息行首写成 `【Aiko】`）。free 模式由 splitFreeReply 负责拆分，不使用本函数。
 */
export interface SpeakerPrefixStripResult {
  text: string
  /** 被剥离的前缀角色名（未剥离时为 null）。 */
  prefixName: string | null
  stripped: boolean
}

export interface SpeakerSegmentExtractResult {
  text: string
  /** 被丢弃的其他成员发言段名字（去重）。 */
  droppedCharacters: string[]
  hadForeignSegments: boolean
}

/**
 * 单发言者模式：从模型回复中只保留“计划发言者”的段落。
 *
 * 实测单发言者请求（polling/mention/立即接话）偶发返回多角色分段（例如 Tofu 的回复里又写了
 * `【Aiko】…`），若整条落盘会变成“Tofu 消息里包含 Aiko 的发言”，属于归属错误。
 * 规则：按 `【角色名】` 分段；保留计划发言者的段与属于其的开场旁白；其他成员段丢弃并告警。
 * 没有分段标记时仅清理残留的 `<角色名>` 标签。
 */
export function extractSpeakerSegments(
  content: string,
  speakerName: string,
  memberNames: readonly string[] = [],
): SpeakerSegmentExtractResult {
  if (!content) return { text: content, droppedCharacters: [], hadForeignSegments: false }
  const stripAngleTags = (value: string): string => {
    let next = value
    for (const name of memberNames) {
      if (!name.trim()) continue
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      next = next.replace(new RegExp(`<\\s*/?\\s*${escaped}\\s*>`, 'gi'), '')
    }
    return next.trim()
  }
  const matches = [...content.matchAll(/【([^】\n]{1,30})】/g)]
  if (matches.length === 0) {
    return { text: stripAngleTags(content), droppedCharacters: [], hadForeignSegments: false }
  }
  const known = memberNames.map((name) => name.trim()).filter(Boolean)
  const knownKeys = new Set(known.map((name) => name.toLowerCase()))
  const speakerKey = speakerName.trim().toLowerCase()
  const preamble = content.slice(0, matches[0].index).trim()
  const segments: Array<{ name: string; body: string }> = []
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length
    segments.push({ name: matches[i][1].trim(), body: content.slice(start, end).trim() })
  }
  const kept: string[] = []
  const dropped: string[] = []
  for (const segment of segments) {
    const key = segment.name.toLowerCase()
    if (key === speakerKey) kept.push(segment.body)
    else if (knownKeys.size === 0 || knownKeys.has(key)) dropped.push(segment.name)
  }
  // 开场旁白：单发言者请求中，第一个分段标记之前的叙述视为计划发言者自己的开场白，保留。
  const text = stripAngleTags([preamble, ...kept].filter(Boolean).join('\n\n'))
  return { text, droppedCharacters: [...new Set(dropped)], hadForeignSegments: dropped.length > 0 }
}

export function stripLeadingSpeakerPrefix(
  content: string,
  memberNames: readonly string[] = [],
): SpeakerPrefixStripResult {
  if (!content) return { text: content, prefixName: null, stripped: false }
  let text = content.trimStart()
  let prefixName: string | null = null
  const known = memberNames.map((name) => name.trim()).filter(Boolean)
  const isKnown = (name: string) => known.length === 0 || known.some((item) => item.toLowerCase() === name.toLowerCase())
  for (let round = 0; round < 3; round += 1) {
    const bracket = text.match(/^【([^】\n]{1,30})】\s*/)
    if (bracket) {
      prefixName = prefixName ?? bracket[1].trim()
      text = text.slice(bracket[0].length)
      continue
    }
    const angle = text.match(/^<\s*([A-Za-z][\w-]{0,30})\s*>\s*/)
    if (angle && isKnown(angle[1])) {
      prefixName = prefixName ?? angle[1]
      text = text.slice(angle[0].length)
      continue
    }
    const closing = text.match(/^<\/\s*([A-Za-z][\w-]{0,30})\s*>\s*/)
    if (closing && isKnown(closing[1])) {
      text = text.slice(closing[0].length)
      continue
    }
    // 无分隔符的纯角色名前缀：`Aiko：…`（连同冒号一起剥离）
    const plainColon = known.length > 0
      ? text.match(new RegExp(`^(${known.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*[:：]\\s*`, 'i'))
      : null
    if (plainColon) {
      prefixName = prefixName ?? plainColon[1]
      text = text.slice(plainColon[0].length)
      continue
    }
    // `Tofu[[白纸符]]…` / `Aiko（…`：只剥离名字，保留后续标记交给正文清洗
    const plain = known.length > 0
      ? text.match(new RegExp(`^(${known.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=\\[\\[|（|\\()`, 'i'))
      : null
    if (plain) {
      prefixName = prefixName ?? plain[1]
      text = text.slice(plain[0].length)
      continue
    }
    break
  }
  return { text, prefixName, stripped: text !== content.trimStart() }
}

