class SummarizationError(Exception):
    def __init__(self, message: str, code: str = "ai_failed"):
        super().__init__(message)
        self.code = code
