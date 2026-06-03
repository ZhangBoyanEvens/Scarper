/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEEPSEEK_API_BASE?: string
  readonly VITE_DEEPSEEK_MODEL?: string
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
  /** Clerk JWT Template 名称（可选，须与后端 CLERK_JWT_ISSUER 对应实例一致） */
  readonly VITE_CLERK_JWT_TEMPLATE?: string
  readonly VITE_BACKEND_URL?: string
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
