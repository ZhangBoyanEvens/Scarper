import { renderFindocRichTextToWordHtml } from './findocRichText'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*]+/g, '_').trim()
  return (cleaned || 'document').slice(0, 80)
}

function hasFindocMarkup(text: string): boolean {
  return (
    /^#{1,4}\s/m.test(text) ||
    /\*\*.+?\*\*/.test(text) ||
    /^[•\-*]\s/m.test(text)
  )
}

function buildPlainWordHtml(text: string): string {
  const paragraphs = text.split(/\r?\n/).map((line) => {
    const content = escapeHtml(line) || '&nbsp;'
    return `<p style="margin:0 0 8pt 0;font-family:Calibri,sans-serif;font-size:11pt;line-height:1.5;">${content}</p>`
  })
  return paragraphs.join('')
}

function buildWordHtml(text: string): string {
  const body = hasFindocMarkup(text)
    ? renderFindocRichTextToWordHtml(text)
    : buildPlainWordHtml(text)

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:w="urn:schemas-microsoft-com:office:word"
  xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>Export</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { margin: 2cm; }
  body { font-family: Calibri, sans-serif; color: #000; }
</style>
</head>
<body>${body}</body>
</html>`
}

export type ExportWordResult =
  | { ok: true; filename: string }
  | { ok: false; reason: 'empty' }

/** 将纯文本导出为 .doc 并触发浏览器下载（Word 可打开） */
export function exportTextAsWordDocument(
  text: string,
  filename: string,
): ExportWordResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return { ok: false, reason: 'empty' }
  }

  const base = sanitizeFilename(filename)
  const downloadName = base.toLowerCase().endsWith('.doc')
    ? base
    : `${base}.doc`

  const blob = new Blob(['\ufeff', buildWordHtml(trimmed)], {
    type: 'application/msword;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = downloadName
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)

  return { ok: true, filename: downloadName }
}
