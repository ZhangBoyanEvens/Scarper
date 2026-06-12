/** 整合结果 url 字段可能为 "url1 | url2" */
export function splitResultUrls(url: string): string[] {
  return url
    .split(/\s*\|\s*/)
    .map((u) => u.trim())
    .filter(Boolean)
}
