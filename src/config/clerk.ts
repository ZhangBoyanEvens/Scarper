export const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

/** 若在 Clerk 控制台创建了 JWT Template，填其名称（如 integration） */
export const clerkJwtTemplate =
  import.meta.env.VITE_CLERK_JWT_TEMPLATE?.trim() || undefined

export const isClerkConfigured = Boolean(
  clerkPublishableKey && clerkPublishableKey.length > 0,
)
