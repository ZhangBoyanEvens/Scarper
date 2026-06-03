import { createChatCompletion } from './deepseekClient'

const SYSTEM_PROMPT = `你是 FinDoc 文档模板结构分析器。用户会提供一篇完整的样例文章。

你的任务：提取并输出「结构模板」，删除所有与结构无关的具体内容，只保留可复用的写作结构。

必须保留的结构要素：
1. 句式：典型句型、段落开头/过渡/结尾模式（用占位符或简述表示）
2. 长度：各段落/章节的大致字数或句数范围
3. 语法：时态、语态、人称等语法特征说明
4. 口吻：正式/书面/客观/结论导向等语气风格描述

必须删除：具体公司名、人名、日期、数字、事件、观点内容、行业细节等实质性信息。

输出格式：
- 只输出模板正文，不要解释分析过程，不要加前言或结语
- 使用中文
- 若原文有层级，用 ### 标题、### 摘要、### 要点、### 正文 等分区（与 FinDoc 内置模板一致）
- 具体可变内容用 [占位符] 表示，例如 [报告标题]、[核心结论]
- 在模板末尾单独增加一节「### 结构说明」，用简短列表总结：句式、长度、语法、口吻 四项结构要点
- 不要使用 markdown 代码块包裹输出`

function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?```$/)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

export async function analyzeTemplateStructure(
  article: string,
  signal?: AbortSignal,
): Promise<string> {
  const trimmed = article.trim()
  if (!trimmed) {
    throw new Error('Paste or enter an article first')
  }

  const response = await createChatCompletion(
    {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: trimmed },
      ],
      temperature: 0.2,
    },
    signal,
  )

  const text = response.choices[0]?.message?.content?.trim()
  if (!text) {
    throw new Error('AI returned no usable result')
  }

  return stripCodeFence(text)
}
