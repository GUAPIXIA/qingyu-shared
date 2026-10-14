/**
 * 用户人设注入文本的唯一来源（标题 + 身份正文 + 使用规则）。
 *
 * 为什么必须收敛：单聊与群聊曾经各自拼过一次同样的注入块，结果群聊只注入
 * 「用户名 / 描述 / 性格」而漏掉【用户身份使用规则】段——PC 与 Android 群聊同时漏、
 * 单聊两侧都有。真机评测确认该差异存在（见
 * `docs/报告/用户人设注入真机效果评测报告-2026-10-06.md` §5.1）。
 *
 * 因此：标题、规则文本与分隔口径只在本文件定义，单聊（`contextBuilder.ts`）、
 * 群聊（`groupContextBuilder.ts`）与渲染层群聊（`src/store/groupChatContext.ts`）
 * 一律调用 `buildUserPersonaBlock`，任何调用点都不得再自行拼接该段。
 * Kotlin 侧对应实现为 `chatcore/ChatUserPersonaBlock.kt`，文本必须与此处逐字一致
 * （由 `group-context.json` 跨端夹具钉住）。
 */

/** 注入块标题。 */
export const USER_PERSONA_TITLE = '【用户人设】'

/** 身份使用规则段：把注入的身份定义为既定事实，并禁止改写与替用户决策。 */
export const USER_PERSONA_INJECTION_RULE = [
  '【用户身份使用规则】',
  '将上述身份视为既定事实：在角色可知且与当前情境相关时，以称呼、判断、态度和反应自然体现；不得忽略、改写、擅自补全或生成冲突信息，也不得替用户说话、行动、思考、感受或决定。',
].join('\n')

/**
 * 把已渲染的身份正文（`用户名：…` 等行）包成完整注入块。
 *
 * 正文允许带尾随换行（群聊既有口径 `'用户名：X\n'`），此处统一去掉尾随换行后按
 * 单聊口径重排，因此**单聊与群聊产出的块逐字一致**；正文为空时返回空串，
 * 调用方据此跳过注入。
 */
export function buildUserPersonaBlock(body: string): string {
  const trimmed = body.replace(/\n+$/, '')
  if (!trimmed) return ''
  return `${USER_PERSONA_TITLE}\n${trimmed}\n\n${USER_PERSONA_INJECTION_RULE}`
}
