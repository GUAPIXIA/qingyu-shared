/**
 * 用户人设注入块：单聊/群聊同源性回归。
 *
 * 锁定事实（此前只有群聊漏掉【用户身份使用规则】段，单聊有）：
 * - 注入块只由 `chat-core/userPersonaBlock.ts` 产出，单聊与群聊不得各拼各的；
 * - 群聊正文带尾随换行、单聊不带，包成块后必须**逐字一致**；
 * - 关闭注入或正文为空时不产出块，调用方据此跳过注入。
 */
import { describe, it, expect } from 'vitest'
import { buildUserPersonaBlock, USER_PERSONA_INJECTION_RULE, USER_PERSONA_TITLE } from '../chat-core/userPersonaBlock'
import { buildGroupUserPersona } from '../chat-core/groupContextBlocks'

/** 单聊口径：正文无尾随换行（`contextBuilder.ts` 逐行 `+= '\n描述：…'`）。 */
const singleChatBody = '用户名：旅人\n描述：资深冒险者\n性格：果敢'

/** 群聊口径：`buildGroupUserPersona` 每行都带尾随换行。 */
function groupChatBody(): string {
  return buildGroupUserPersona({
    userName: '旅人',
    userDescription: '资深冒险者',
    userPersona: '果敢',
    charNameForVars: '苏晚',
  })
}

describe('用户人设注入块', () => {
  it('块含标题、身份正文与使用规则，分隔口径与单聊一致', () => {
    expect(buildUserPersonaBlock(singleChatBody)).toBe(
      `${USER_PERSONA_TITLE}\n${singleChatBody}\n\n${USER_PERSONA_INJECTION_RULE}`,
    )
  })

  it('群聊正文（带尾随换行）与单聊正文产出的块逐字一致', () => {
    expect(groupChatBody()).toBe(`${singleChatBody}\n`)
    expect(buildUserPersonaBlock(groupChatBody())).toBe(buildUserPersonaBlock(singleChatBody))
  })

  it('使用规则含"不替用户说话"与"不得改写/擅自补全"两类约束', () => {
    expect(USER_PERSONA_INJECTION_RULE).toContain('不得忽略、改写、擅自补全或生成冲突信息')
    expect(USER_PERSONA_INJECTION_RULE).toContain('也不得替用户说话、行动、思考、感受或决定')
  })

  it('关闭注入或正文为空时不产出块', () => {
    expect(buildUserPersonaBlock('')).toBe('')
    expect(buildUserPersonaBlock('\n\n')).toBe('')
    expect(
      buildGroupUserPersona({
        userName: '旅人',
        charNameForVars: '苏晚',
        injection: { enabled: false },
      }),
    ).toBe('')
  })
})
