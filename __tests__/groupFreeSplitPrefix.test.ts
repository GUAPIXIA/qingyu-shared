import { describe, expect, it } from 'vitest'
import { extractSpeakerSegments, splitFreeReply, stripLeadingSpeakerPrefix } from '../chat-core/groupFreeSplit'

const MEMBERS = [
  { id: 'aiko', name: 'Aiko' },
  { id: 'tofu', name: 'Tofu' },
]

describe('stripLeadingSpeakerPrefix（单发言者群聊前缀清理）', () => {
  it('剥离行首 【Aiko】 前缀并返回名字', () => {
    const r = stripLeadingSpeakerPrefix('【Aiko】她推开门。', MEMBERS.map((m) => m.name))
    expect(r.text).toBe('她推开门。')
    expect(r.prefixName).toBe('Aiko')
    expect(r.stripped).toBe(true)
  })

  it('剥离行首 <Aiko> / </Aiko> 角标前缀', () => {
    expect(stripLeadingSpeakerPrefix('<Aiko>她推开门。', MEMBERS.map((m) => m.name))).toMatchObject({ text: '她推开门。', prefixName: 'Aiko' })
    expect(stripLeadingSpeakerPrefix('</Aiko>她推开门。', MEMBERS.map((m) => m.name))).toMatchObject({ text: '她推开门。' })
  })

  it('剥离无分隔符的纯角色名前缀（Tofu[[白纸符]]… / Aiko：…）', () => {
    expect(stripLeadingSpeakerPrefix('Tofu[[白纸符]]她看得见我就好了。', MEMBERS.map((m) => m.name))).toMatchObject({ text: '[[白纸符]]她看得见我就好了。', prefixName: 'Tofu' })
    expect(stripLeadingSpeakerPrefix('Aiko：“你来了。”', MEMBERS.map((m) => m.name))).toMatchObject({ text: '“你来了。”', prefixName: 'Aiko' })
  })

  it('前缀角色与计划发言者不一致时也剥离并返回实际前缀名（用于告警）', () => {
    const r = stripLeadingSpeakerPrefix('【Aiko】她把杯子放下。', MEMBERS.map((m) => m.name))
    expect(r.text).toBe('她把杯子放下。')
    expect(r.prefixName).toBe('Aiko')
  })

  it('不误伤正文中间的角色名与普通括号', () => {
    const text = '她看向 Aiko，低声说：“你先。”'
    const r = stripLeadingSpeakerPrefix(text, MEMBERS.map((m) => m.name))
    expect(r.text).toBe(text)
    expect(r.prefixName).toBeNull()
    expect(r.stripped).toBe(false)
  })

  it('无前缀时原样返回（含 trimStart 变化标记）', () => {
    const r = stripLeadingSpeakerPrefix('她推开门。', MEMBERS.map((m) => m.name))
    expect(r.text).toBe('她推开门。')
    expect(r.stripped).toBe(false)
  })
})

describe('extractSpeakerSegments（单发言者只保留自己的段落）', () => {
  it('Tofu 的回复里混入 【Aiko】 段 → 只保留 Tofu 开场旁白并丢弃 Aiko 段', () => {
    const content = '（Tofu 轻轻点头，把唱片放好）那就这么定了。 【Aiko】（Aiko 抱着膝盖）我也同意。'
    const r = extractSpeakerSegments(content, 'Tofu', MEMBERS.map((m) => m.name))
    expect(r.text).toBe('（Tofu 轻轻点头，把唱片放好）那就这么定了。')
    expect(r.droppedCharacters).toEqual(['Aiko'])
    expect(r.hadForeignSegments).toBe(true)
  })

  it('整条都是其他成员段 → 文本为空并报告丢弃', () => {
    const r = extractSpeakerSegments('【Aiko】她把杯子放下。', 'Tofu', MEMBERS.map((m) => m.name))
    expect(r.text).toBe('')
    expect(r.droppedCharacters).toEqual(['Aiko'])
  })

  it('只有计划发言者标记 → 去标记保留正文', () => {
    const r = extractSpeakerSegments('【Tofu】她轻轻笑了。', 'Tofu', MEMBERS.map((m) => m.name))
    expect(r.text).toBe('她轻轻笑了。')
    expect(r.hadForeignSegments).toBe(false)
  })

  it('无分段标记时清理 <角色名> 角标标签', () => {
    const r = extractSpeakerSegments('<Tofu>她轻轻笑了。</Tofu>', 'Tofu', MEMBERS.map((m) => m.name))
    expect(r.text).toBe('她轻轻笑了。')
  })
})

describe('splitFreeReply 与单发言者前缀清理互不影响', () => {
  it('free 模式仍按 【角色名】 拆分并去掉标记', () => {
    const result = splitFreeReply({
      content: '【Aiko】她推开门。\n\n【Tofu】她抬起头。',
      members: MEMBERS,
    })
    expect(result.kind).toBe('segments')
    expect(result.messages.map((m) => m.characterId)).toEqual(['aiko', 'tofu'])
    expect(result.messages[0].content).toBe('她推开门。')
    expect(result.messages[1].content).toBe('她抬起头。')
  })
})
