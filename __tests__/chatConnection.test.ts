import { describe, expect, it } from 'vitest'
import { resolveChatProfile, snapshotChatConfiguration } from '../chatConnection'
import { getDefaultSettings } from '../defaults'
import type { ConnectionProfile } from '../types'

const profile: ConnectionProfile = {
  id: 'p1', name: '测试连接', provider: 'openai', apiKey: 'test-placeholder',
  baseUrl: 'http://localhost:11434/v1', model: 'profile-default', maxContext: 0,
  capabilityOverride: { enabled: true, outputLimit: 2048 },
}

describe('聊天有效连接解析', () => {
  it('活动模型优先；未选模型时回退所属档案，且不修改保存的默认模型', () => {
    const settings = { ...getDefaultSettings(), activeProfileId: 'p1', activeModel: 'selected', connectionProfiles: [profile] }
    expect(resolveChatProfile(settings)?.model).toBe('selected')
    expect(resolveChatProfile({ ...settings, activeModel: '' })?.model).toBe('profile-default')
    expect(profile.model).toBe('profile-default')
  })

  it('连接缺失时返回空，不自动选择第一个档案或其他连接', () => {
    const settings = { ...getDefaultSettings(), connectionProfiles: [profile] }
    expect(resolveChatProfile({ ...settings, activeProfileId: null })).toBeNull()
    expect(resolveChatProfile({ ...settings, activeProfileId: 'deleted' })).toBeNull()
  })

  it('保留供应商、连接、预算能力和模板设置', () => {
    const resolved = resolveChatProfile({ ...getDefaultSettings(), activeProfileId: 'p1', activeModel: 'selected', connectionProfiles: [{ ...profile, useInstructTemplate: true }] })!
    expect(resolved).toMatchObject({ provider: 'openai', model: 'selected', baseUrl: profile.baseUrl, apiKey: profile.apiKey, maxContext: 0, useInstructTemplate: true })
    expect(resolved.capabilityOverride).toEqual(profile.capabilityOverride)
    expect(resolved.capabilityOverride).not.toBe(profile.capabilityOverride)
  })

  it('运行请求保留旧快照，新请求读取更新后的配置', () => {
    const settings = { ...getDefaultSettings(), activeProfileId: 'p1', activeModel: 'old-model', connectionProfiles: [profile] }
    const running = snapshotChatConfiguration(settings)
    settings.activeModel = 'new-model'
    settings.activeProfileId = 'p2'
    settings.connectionProfiles = [{ ...profile, id: 'p2', provider: 'claude', baseUrl: 'http://localhost:1234', apiKey: 'new-placeholder' }]
    expect(running.profile).toMatchObject({ provider: 'openai', model: 'old-model', baseUrl: profile.baseUrl })
    expect(running.settings.activeProfileId).toBe('p1')
    const next = snapshotChatConfiguration(settings)
    expect(next.profile).toMatchObject({ provider: 'claude', model: 'new-model', baseUrl: 'http://localhost:1234' })
  })
})
