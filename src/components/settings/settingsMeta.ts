import type { SettingsSectionId } from './settingsTypes'

export const SECTION_META: Record<
  SettingsSectionId,
  { title: string; description: string }
> = {
  account: {
    title: '账号',
    description: '登录信息与抓取额度，由 Clerk 与后端同步',
  },
  language: {
    title: '语言',
    description: '全局 AI 输出语言与详细程度，应用于 Scrape、FinDoc 与整合摘要',
  },
  workflow: {
    title: '工作流',
    description: 'Scrape 抓取行为、处理指令与 Project 上传默认项',
  },
  interface: {
    title: '界面',
    description: '布局密度与过程视觉反馈',
  },
  data: {
    title: '数据与存储',
    description: 'Project 数据存放位置与本地缓存说明',
  },
  api: {
    title: 'API',
    description: '后端连接与 DeepSeek 服务配置',
  },
  diagnostics: {
    title: '连接测试',
    description: '检测 Python 后端、Clerk、Neon、爬虫与 AI 等服务状态',
  },
}
