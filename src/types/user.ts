export interface UserProfile {
  user_id: string
  email: string | null
  name: string | null
  image_url: string | null
  /** 今日已成功抓取次数 */
  extract_count: number
  /** free 为 20；付费计划为 null 表示不限 */
  extract_limit: number | null
  plan: string
}
