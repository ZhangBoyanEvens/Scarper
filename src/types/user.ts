export interface UserProfile {
  user_id: string
  email: string | null
  name: string | null
  image_url: string | null
  /** 今日已成功抓取次数 */
  extract_count: number
  /** null 表示不限每日抓取次数 */
  extract_limit: number | null
  plan: string
}
