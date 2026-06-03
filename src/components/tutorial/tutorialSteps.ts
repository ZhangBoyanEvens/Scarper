import type { AppView } from '../../types/appView'

export interface TutorialStep {
  id: string
  phase: string
  title: string
  summary: string
  checklist: readonly string[]
  tip?: string
  /** 顶栏可导航到的页面（Tools 族会落到 tools 或子页） */
  navigate?: AppView
  navigateLabel?: string
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'overview',
    phase: '总览',
    title: 'Scarper 做什么',
    summary:
      'Scarper 把「网页 → 结构化知识 → 项目库 → 编辑与 AI 协作」串成一条线。按下面顺序走一遍，就能完成从抓取到归档的完整闭环。',
    checklist: [
      '开局：Homepage 登录（应用默认首页）',
      '抓取：输入 URL，得到标题、摘要、要点与正文',
      '入库：将结果上传到 Neon 云项目（按账户配额）',
      '加工：在 Dashboard / FinDoc 中编辑、排版与 AI 改稿',
    ],
  },
  {
    id: 'sign-in',
    phase: '准备',
    title: '在 Homepage 登录（开局页）',
    summary:
      '打开应用后默认进入 Homepage，这是唯一的登录入口。未登录时顶栏仅保留 Homepage；完成 Clerk 登录后才会解锁 Project、Dashboard、Tools、Setting。',
    checklist: [
      '启动应用即显示 Homepage（左侧品牌动画，右侧登录区）',
      '右侧完成 Sign in / Sign up',
      '登录后出现 Start、/Tutorial，顶栏展开全部导航',
    ],
    tip: '若登录按钮不可用，请检查 .env 中的 VITE_CLERK_PUBLISHABLE_KEY。',
    navigate: 'homepage',
    navigateLabel: '打开 Homepage',
  },
  {
    id: 'tools',
    phase: '抓取',
    title: '从 Tools 选工具',
    summary:
      '登录后从顶栏 Tools 进入工具台，再选择 Scrape、FinDoc、Template 或 RAG Chat。也可在 Homepage 点击 Start 直接进入 Scrape。',
    checklist: [
      '登录后点击顶栏 Tools（或 Homepage 的 Start 进 Scrape）',
      '在 Tools 选择 Scrape 开始网页抓取',
      'FinDoc / Template / RAG 在后续步骤中使用',
    ],
    navigate: 'tools',
    navigateLabel: '打开 Tools',
  },
  {
    id: 'scrape',
    phase: '抓取',
    title: 'Scrape：提交 URL',
    summary:
      '在 Scrape 页输入一个或多个 URL（换行或逗号分隔），选择输出语言与详细程度，点击抓取。系统会智能选择 HTTP 或 Playwright，并由 AI 生成摘要。',
    checklist: [
      '在搜索栏粘贴目标链接并提交',
      '观察任务进度条与各 URL 的抓取状态',
      '在 设置 → 语言 中配置全局输出语言与详细程度（Scrape 工具栏会同步）',
    ],
    tip: '抓取进行中顶栏 Tools 旁会出现圆点提示，请勿重复提交相同任务。',
    navigate: 'scrape',
    navigateLabel: '打开 Scrape',
  },
  {
    id: 'scrape-upload',
    phase: '抓取',
    title: '整合结果并上传',
    summary:
      '单条结果可编辑、复制或导出；多条成功结果可使用 Merge 整合为一条。页面底部 Project 区域选择目标项目并上传，写入 Neon。',
    checklist: [
      '确认结果卡片状态为成功后再上传',
      '底部选择 Project，勾选是否包含完整正文',
      '上传成功后到 Project 页刷新记录列表',
    ],
    navigate: 'scrape',
    navigateLabel: '打开 Scrape',
  },
  {
    id: 'project',
    phase: '管理',
    title: 'Project：项目与记录',
    summary:
      'Project 页管理云端项目分组。左侧查看存储用量（约 200MB/账户），中间列表项目，右侧查看某项目下的抓取记录，可进入 Dashboard 或 FinDoc。',
    checklist: [
      '点击「新建项目」创建分组',
      '选中项目查看记录列表与来源 URL',
      '从记录进入 Dashboard 编辑，或打开 FinDoc 任务',
    ],
    navigate: 'project',
    navigateLabel: '打开 Project',
  },
  {
    id: 'dashboard',
    phase: '管理',
    title: 'Dashboard：编辑与 AI',
    summary:
      'Dashboard 提供富文本编辑、查找替换与 AI 改稿抽屉。保存会将内容写回 Neon；也可导出 Word。适合对单条抓取结果做深度整理。',
    checklist: [
      '从 Project 记录进入 Dashboard，或点击「+ 新建记录」插入空白 Task',
      '编辑正文，使用右侧 AI 助手提出修改建议',
      '保存后写入 Neon / 本地项目库',
    ],
    navigate: 'dashboard',
    navigateLabel: '打开 Dashboard',
  },
  {
    id: 'findoc',
    phase: '文档',
    title: 'FinDoc：模板与成稿',
    summary:
      'FinDoc 按所选 Template 的结构，将多条 Task 素材整合为正式文档。上方选模板与任务，左侧 Prompt 可写额外改写要求；Proceed 后 AI 按模板排版并落实 Prompt。',
    checklist: [
      'Tools → Template 管理：创建/分析模板结构',
      'Tools → FinDoc：选择项目、模板与 Task',
      'Proceed 生成排版文稿并保存到项目',
    ],
    navigate: 'findoc',
    navigateLabel: '打开 FinDoc',
  },
  {
    id: 'rag',
    phase: '文档',
    title: 'RAG Chat：基于库内问答',
    summary:
      'RAG Chat 从项目 Task 正文中划选片段，向 AI 提问。回答严格依据已入库内容，适合核对事实、对比段落，而不是重新抓取网页。',
    checklist: [
      'Tools → RAG Chat',
      '选择项目与 Task，划选需要引用的正文',
      '在输入框提问并查看带上下文的回答',
    ],
    navigate: 'rag-chat',
    navigateLabel: '打开 RAG Chat',
  },
  {
    id: 'settings',
    phase: '收尾',
    title: 'Setting：偏好与诊断',
    summary:
      '设置 集中管理全局语言预设、工作流、API 地址、界面与存储。语言页可一次设定 Scrape / FinDoc 的默认输出；部署或联调时建议先在「测试」页检测后端 health。',
    checklist: [
      '确认 API Base 指向本地或生产后端',
      '点击检测连接，状态应为 ok',
      'Diagnostics 可查看近期抓取与路由信息（若已开启）',
    ],
    tip: 'Neon 与 DeepSeek 密钥仅配置在后端 .env，不会出现在前端。',
    navigate: 'settings',
    navigateLabel: '打开 Setting',
  },
  {
    id: 'done',
    phase: '完成',
    title: '流程走完',
    summary:
      '推荐路径：Homepage 登录 → Tools（或 Start）→ Scrape 抓取 → 上传 Project → Dashboard 编辑 →（可选）FinDoc 成稿 / RAG 问答。遇到失败可在 Setting 查 API 与 Diagnostics。',
    checklist: [
      '已完成本教程全部步骤',
      '下次打开应用仍默认 Homepage，可从 /Tutorial 重看引导',
      '需要全站抓取基准报告时见 backend/reports',
    ],
  },
] as const

export const TUTORIAL_PHASES = [
  ...new Set(TUTORIAL_STEPS.map((s) => s.phase)),
]
