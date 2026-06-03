class NeonError(Exception):
    """Neon 数据层基础异常。"""


class NeonNotConfiguredError(NeonError):
    """未配置 NEON_DATABASE_URL 或 neon_enabled=false。"""


class NeonConnectionError(NeonError):
    """无法连接 Neon Postgres。"""


class NeonStorageQuotaError(NeonError):
    """用户 Neon 存储已超过配额。"""

    def __init__(
        self,
        *,
        used_bytes: int,
        quota_bytes: int,
        requested_bytes: int = 0,
    ) -> None:
        self.used_bytes = max(0, used_bytes)
        self.quota_bytes = max(1, quota_bytes)
        self.requested_bytes = max(0, requested_bytes)
        quota_mb = self.quota_bytes // (1024 * 1024)
        super().__init__(
            f"Neon 存储已满：已用 {self.used_bytes} 字节，配额 {quota_mb}MB"
        )
