import { describe, expect, it } from 'vitest'
import {
  GROUP_NARRATOR_CHARACTER_ID,
  mapGroupHistoryMessages,
  type GroupContextMember,
} from '../chat-core/groupContextBlocks'

const members: GroupContextMember[] = [
  { id: 'c1', name: 'Aiko' },
  { id: 'c2', name: 'Eve' },
]

describe('mapGroupHistoryMessages：系统开场旁白归属', () => {
  it('旁白消息使用【旁白】前缀，{{user}}/{{char}} 展开为用户名与成员名拼接', () => {
    const entries = mapGroupHistoryMessages({
      messages: [{ characterId: GROUP_NARRATOR_CHARACTER_ID, content: '{{user}} 看到 {{char}} 在门口。' }],
      members,
      userName: '大本',
      charNameForVars: 'Aiko、Eve',
    })
    expect(entries).toEqual([{ role: 'assistant', content: '【旁白】大本 看到 Aiko、Eve 在门口。' }])
  })

  it('成员名集合为空时旁白 {{char}} 回退到 charNameForVars', () => {
    const entries = mapGroupHistoryMessages({
      messages: [{ characterId: GROUP_NARRATOR_CHARACTER_ID, content: '{{char}} 退场。' }],
      members: [],
      userName: '大本',
      charNameForVars: '当前角色',
    })
    expect(entries[0].content).toBe('【旁白】当前角色 退场。')
  })

  it('用户与成员消息行为不变，未知角色仍标注未知角色', () => {
    const entries = mapGroupHistoryMessages({
      messages: [
        { characterId: '__user__', content: '{{user}} 说：{{char}} 你好。' },
        { characterId: 'c1', content: '{{char}} 向 {{user}} 问好。' },
        { characterId: 'ghost', content: '{{user}} 是谁？' },
      ],
      members,
      userName: '大本',
      charNameForVars: 'Aiko、Eve',
    })
    expect(entries[0]).toEqual({ role: 'user', content: '大本 说：Aiko、Eve 你好。' })
    expect(entries[1].content).toBe('【Aiko】Aiko 向 大本 问好。')
    expect(entries[2].content).toBe('【未知角色】大本 是谁？')
  })
})
