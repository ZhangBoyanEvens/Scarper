/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEEPSEEK_API_BASE?: string
  readonly VITE_DEEPSEEK_MODEL?: string
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
