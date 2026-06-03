from pydantic import BaseModel, Field


class DocumentExtractResponse(BaseModel):
    text: str
    filename: str
    method: str = Field(description="pdf_text | pdf_ocr | pptx | image_ocr | …")
    char_count: int
