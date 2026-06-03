import type { NeonStorageMode } from './neon'

export interface ProjectApiItem {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

export interface ProjectListApiResponse {
  items: ProjectApiItem[]
  storage: NeonStorageMode
  /** 当前登录账户，对应 Neon schema u_<user_id> */
  user_id?: string
}

export interface ProjectCreateApiBody {
  id?: string
  name: string
  description?: string
}
