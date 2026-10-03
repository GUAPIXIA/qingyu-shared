import type { ConnectionProfile, Settings } from './types'

/** 本次文本请求的内存配置；不得持久化到任务或功能历史。 */
export interface ActiveChatProfile {
  name: string
  provider: ConnectionProfile['provider']
  apiKey: string
  baseUrl: string
  model: string
  maxContext: number
  useInstructTemplate?: boolean
  capabilityOverride?: ConnectionProfile['capabilityOverride']
}

/** 请求执行范围内保留，配置切换后下一次请求重新创建。 */
export interface ChatConfigurationSnapshot {
  settings: Settings
  profile: ActiveChatProfile | null
}

export function snapshotChatConfiguration(settings: Settings): ChatConfigurationSnapshot {
  return { settings: { ...settings }, profile: resolveChatProfile(settings) }
}

/**
 * 主对话和文本功能的唯一有效连接解析规则。
 * 在实际请求开始时调用；内部重试传递此返回值，手动重试重新解析。
 * 不回退到其他档案，也不修改保存的档案默认模型。
 */
export function resolveChatProfile(settings: Pick<Settings, 'activeProfileId' | 'activeModel' | 'connectionProfiles'>): ActiveChatProfile | null {
  if (!settings.activeProfileId) return null
  const profile = settings.connectionProfiles.find(item => item.id === settings.activeProfileId)
  if (!profile) return null
  return {
    name: profile.name,
    provider: profile.provider,
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl,
    model: settings.activeModel || profile.model,
    maxContext: profile.maxContext || 0,
    useInstructTemplate: profile.useInstructTemplate,
    capabilityOverride: profile.capabilityOverride ? { ...profile.capabilityOverride } : undefined,
  }
}
