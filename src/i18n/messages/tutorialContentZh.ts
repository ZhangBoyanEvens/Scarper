import type { MessageTree } from '../types'

export const tutorialContentZh: MessageTree = {
  phases: {
    overview: '概览',
    setup: '准备',
    scrape: '抓取',
    manage: '管理',
    documents: '文档',
    wrapUp: '收尾',
    done: '完成',
  },
  steps: {
    overview: {
      title: 'Scarper 能做什么',
      summary:
        'Scarper 将网页 → 结构化知识 → 项目库 → 编辑与 AI 协作串联起来。按下列步骤完成从抓取到归档的完整工作流。',
      checklist: {
        '0': '开始：在首页登录（应用默认落地页）',
        '1': '抓取：输入 URL，获取标题、摘要、要点与正文',
        '2': '存储：将结果上传至 Neon 云 Project（按账号配额）',
        '3': '精修：在 FinDoc / RAG 对话中生成文档',
      },
    },
    signIn: {
      title: '在首页登录',
      summary:
        '应用默认打开首页 — 唯一的登录入口。登录前顶栏仅显示首页；完成 Clerk 登录后解锁 Project、Tools 与 Setting。',
      checklist: {
        '0': '启动应用，看到首页（左侧品牌动画，右侧登录）',
        '1': '在右侧完成 Sign in / Sign up',
        '2': '登录后出现 Start 与 /Tutorial；完整导航解锁',
      },
      tip: '若无法登录，请检查 .env 中的 VITE_CLERK_PUBLISHABLE_KEY。',
      navigate: '打开首页',
    },
    tools: {
      title: '从 Tools 选择工具',
      summary:
        '登录后，从顶栏打开 Tools，选择 Scrape、FinDoc、Template 或 RAG Chat。也可在首页点击 Start 直接进入 Scrape。',
      checklist: {
        '0': '点击顶栏 Tools（或首页 Start 进入 Scrape）',
        '1': '在 Tools 中选择 Scrape 开始网页抓取',
        '2': 'FinDoc / Template / RAG 在后续步骤中使用',
      },
      navigate: '打开 Tools',
    },
    scrape: {
      title: 'Scrape：提交 URL',
      summary:
        '在 Scrape 页输入一个或多个 URL（换行或逗号分隔），选择输出语言与详细程度后运行。系统自动选择 HTTP 或 Playwright，并由 AI 生成摘要。',
      checklist: {
        '0': '在搜索栏粘贴目标链接并提交',
        '1': '观察任务进度条与各 URL 抓取状态',
        '2': '在 Setting → Language 设置全局输出语言与详细程度（Scrape 工具栏会同步）',
      },
      tip: '抓取进行中时，Tools 旁会出现圆点 — 请勿重复提交相同任务。',
      navigate: '打开 Scrape',
    },
    scrapeUpload: {
      title: '合并结果并上传',
      summary:
        '可编辑、复制或导出单条结果；多条成功结果可用 Merge 合并。在底部 Project 区域选择目标项目并上传至 Neon。',
      checklist: {
        '0': '确认结果卡片显示成功后再上传',
        '1': '在底部选择 Project；决定是否包含完整正文',
        '2': '上传后在 Project 页刷新记录列表',
      },
      navigate: '打开 Scrape',
    },
    project: {
      title: 'Project：项目与记录',
      summary:
        'Project 页管理云项目分组。左侧查看存储用量（约 200MB/账号），中间浏览项目，右侧查看抓取记录 — 可从记录启动 FinDoc。',
      checklist: {
        '0': '点击 New Project 创建分组',
        '1': '选择项目查看记录列表与来源 URL',
        '2': '就绪后从记录启动 FinDoc 任务',
      },
      navigate: '打开 Project',
    },
    findoc: {
      title: 'FinDoc：模板与成稿',
      summary:
        'FinDoc 将多个 Task 来源按所选 Template 结构合并为正式文档。上方选择模板与 Tasks；左侧 Prompt 补充改写指令；Proceed 按模板与 Prompt 运行 AI 排版。',
      checklist: {
        '0': 'Tools → Template：创建或分析模板结构',
        '1': 'Tools → FinDoc：选择项目、模板与 Tasks',
        '2': 'Proceed 生成格式化输出并保存至项目',
      },
      navigate: '打开 FinDoc',
    },
    rag: {
      title: 'RAG Chat：基于库的问答',
      summary:
        'RAG Chat 可划选 Task 正文并向 AI 提问。回答严格基于已存内容 — 适合事实核查与段落对比，而非重新抓取网页。',
      checklist: {
        '0': 'Tools → RAG Chat',
        '1': '选择项目与 Task；划选要引用的文本',
        '2': '在输入框提问并查看基于上下文的回答',
      },
      navigate: '打开 RAG Chat',
    },
    settings: {
      title: 'Setting：偏好与诊断',
      summary:
        'Setting 集中管理全局语言预设、工作流、API 基址、界面与存储。在 Language 设置 Scrape / FinDoc 默认值；部署或调试时先在 Test 运行后端健康检查。',
      checklist: {
        '0': '确认 API Base 指向本地或生产后端',
        '1': '运行连接测试；状态应为 ok',
        '2': 'Diagnostics 显示近期抓取与路由（若已启用）',
      },
      tip: 'Neon 与 DeepSeek 密钥仅存在于后端 .env — 切勿写入前端。',
      navigate: '打开 Setting',
    },
    done: {
      title: '一切就绪',
      summary:
        '推荐路径：首页登录 → Tools（或 Start）→ Scrape → 上传至 Project →（可选）FinDoc / RAG。失败时在 Setting 检查 API 与 Diagnostics。',
      checklist: {
        '0': '已完成全部教程步骤',
        '1': '下次启动仍默认首页；可随时重新打开 /Tutorial',
        '2': '全站抓取基准见 backend/reports',
      },
    },
  },
  stepProgress: '步骤 {{current}} / {{total}}',
  progressAria: '教程进度 {{pct}}%',
  stepsAria: '教程步骤',
  workflowOverview: '工作流概览',
  tryHint: '就绪后，点击底部「{{label}}」进入实际页面操作，再返回此处进行下一步。',
}
