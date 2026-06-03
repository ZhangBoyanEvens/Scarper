import type { ExtractResponse, ExtractSuccess } from '../types/extraction'
import { isExtractSuccess } from '../types/extraction'

/** 默认不上传正文；勾选后连同 content 一并写入项目库 */
export function prepareUploadResults(
  results: ExtractResponse[],
  includeBody: boolean,
): ExtractResponse[] {
  return results.map((item) => {
    if (!isExtractSuccess(item)) return item
    if (includeBody) return item
    const trimmed: ExtractSuccess = {
      ...item,
      content: '',
    }
    return trimmed
  })
}
