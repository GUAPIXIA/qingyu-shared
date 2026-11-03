import { describe, expect, it } from 'vitest'
import {
  createVendorThinkingStreamFilter,
  looksLikeModelPlanning,
  stripAllThinking,
  stripOrphanThoughtCloseTags,
  stripProviderControlMarkup,
  stripVendorThinking,
} from '../thoughtMarkup'

describe('thoughtMarkup', () => {
  it('只删除供应商推理，保留角色 thought', () => {
    expect(stripVendorThinking(
      '<thinking>模型计划</thinking><thought>我得小心一点。</thought>正文',
    )).toBe('<thought>我得小心一点。</thought>正文')
  })

  it('流式标签跨 chunk 时也不泄漏推理内容', () => {
    const filter = createVendorThinkingStreamFilter()
    const visible = [
      filter.push('开场<thi'),
      filter.push('nking>内部推'),
      filter.push('理</think'),
      filter.push('ing>正文'),
      filter.flush(),
    ].join('')

    expect(visible).toBe('开场正文')
  })

  it('流结束时丢弃未闭合的供应商推理块', () => {
    const filter = createVendorThinkingStreamFilter()
    expect(filter.push('正文<think>未完成推理')).toBe('正文')
    expect(filter.flush()).toBe('')
  })

  it('普通的小于号文本不会被当作推理标签延迟', () => {
    const filter = createVendorThinkingStreamFilter()
    expect(filter.push('温度 < 3 度')).toBe('温度 < 3 度')
    expect(filter.flush()).toBe('')
  })

  describe('stripAllThinking（辅助链路统一入口）', () => {
    it('同时删除供应商推理与产品级 thought 并 trim', () => {
      expect(stripAllThinking(
        '前 <thinking>内部推理</thinking> 中 <thought>角色内心</thought> 后 ',
      )).toBe('前  中  后')
    })

    it('未闭合的 thought 尾部整体删除（翻译/摘要不回显思考草稿）', () => {
      expect(stripAllThinking('正文完成。<thought>写到一半的内心独白')).toBe('正文完成。')
      expect(stripAllThinking('<think>推理没输出闭合标签')).toBe('')
    })

    it('孤儿闭合标签只删标签不伤正文', () => {
      expect(stripAllThinking('意外泄漏的思考</thought>正文')).toBe('意外泄漏的思考正文')
    })

    it('带属性的 thought 标签同样剥离', () => {
      expect(stripAllThinking('<thought role="苏晚">台词</thought>正文')).toBe('正文')
    })

    it('空串原样返回', () => {
      expect(stripAllThinking('')).toBe('')
    })
  })

  describe('stripProviderControlMarkup（供应商控制/安全标记）', () => {
    it('删除整条未闭合 <ds_safety> 安全分类块', () => {
      expect(stripProviderControlMarkup(
        '<ds_safety>[用户未成年]否\n[分类]其他\n[判定]内容为虚构日常闲聊，安全。',
      ).trim()).toBe('')
    })

    it('保留安全块之前的角色正文', () => {
      expect(stripProviderControlMarkup(
        '她把杯子推过来，轻声说：“先喝口热的。”<ds_safety>[分类]其他\n[判定]安全。',
      ).trim()).toBe('她把杯子推过来，轻声说：“先喝口热的。”')
    })

    it('删除闭合的 ds 安全块与 budget 预算块', () => {
      expect(stripProviderControlMarkup(
        '正文。<ds_safety><x></ds_safety><budget:token_budget>200000</budget:token_budget>',
      ).trim()).toBe('正文。')
    })

    it('删除 @@末尾@@ 占位标记与 <｜ 特殊 token', () => {
      expect(stripProviderControlMarkup('@@末尾@@')).toBe('')
      expect(stripProviderControlMarkup('正文<｜Aiko｜>')).toBe('正文')
    })

    it('删除 [[白纸符]] 类双方括号占位', () => {
      expect(stripProviderControlMarkup('Tofu[[白纸符]]正文')).toBe('Tofu正文')
    })

    it('保留产品级 <thought> 与普通文本', () => {
      expect(stripProviderControlMarkup('<thought>她有点紧张。</thought>她把茶放下。')).toBe('<thought>她有点紧张。</thought>她把茶放下。')
    })
  })

  describe('stripOrphanThoughtCloseTags / looksLikeModelPlanning', () => {
    it('无开启标签时删除孤儿 </thought>，成对 thought 不受影响', () => {
      expect(stripOrphanThoughtCloseTags('Tofu[[白纸符]]</thought>她看得见我就好了。')).toBe('Tofu[[白纸符]]她看得见我就好了。')
      expect(stripOrphanThoughtCloseTags('<thought>内心</thought>正文')).toBe('<thought>内心</thought>正文')
    })

    it('识别模型规划/自检式正文', () => {
      expect(looksLikeModelPlanning('todo 当前发言角色是 Aiko，不是 Tofu！')).toBe(true)
      expect(looksLikeModelPlanning("Let me just write Aiko's response.")).toBe(true)
      expect(looksLikeModelPlanning('Safe')).toBe(true)
      expect(looksLikeModelPlanning('她把杯子推过来。')).toBe(false)
    })
  })
})
