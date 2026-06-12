import { useId, useRef, useState } from 'react'
import './DashboardFileUpload.css'

interface DashboardFileUploadProps {
  recordName?: string
  disabled?: boolean
  uploading?: boolean
  onFileSelect?: (file: File | null) => void
  onUpload?: (file: File) => void | Promise<void>
}

export function DashboardFileUpload({
  recordName,
  disabled = false,
  uploading = false,
  onFileSelect,
  onUpload,
}: DashboardFileUploadProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)

  const pickFile = () => {
    if (!disabled && !uploading) inputRef.current?.click()
  }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null
    setFile(next)
    onFileSelect?.(next)
  }

  const clearFile = () => {
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
    onFileSelect?.(null)
  }

  const handleUpload = () => {
    if (!file || disabled || uploading) return
    void onUpload?.(file)
  }

  const busy = disabled || uploading

  return (
    <section className="dashboard-file-upload" aria-label="File upload">
      <div className="dashboard-file-upload__head">
        <h3 className="dashboard-file-upload__title">Upload file</h3>
        {recordName ? (
          <p className="dashboard-file-upload__subtitle">Record: {recordName}</p>
        ) : null}
      </div>
      <p className="dashboard-file-upload__hint">
        Supports PDF, PNG/JPG images (OCR), PPT/PPTX, Word, and plain text. Select a file and click Upload
        to extract text into the editor below.
      </p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="dashboard-file-upload__input"
        disabled={busy}
        accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.ppt,.pptx,.docx,.txt,.md,.markdown,.csv,.json"
        onChange={handleChange}
      />
      <div className="dashboard-file-upload__actions">
        <button
          type="button"
          className="project-btn project-btn--ghost"
          disabled={busy}
          onClick={pickFile}
        >
          Choose file
        </button>
        <button
          type="button"
          className="project-btn project-btn--primary dashboard-file-upload__upload"
          disabled={busy || !file}
          onClick={handleUpload}
        >
          {uploading ? 'Parsing…' : 'Upload'}
        </button>
        {file ? (
          <button
            type="button"
            className="project-btn project-btn--ghost"
            disabled={busy}
            onClick={clearFile}
          >
            Clear
          </button>
        ) : null}
      </div>
      {file ? (
        <p className="dashboard-file-upload__file" role="status">
          Selected: <span>{file.name}</span>
          <span className="dashboard-file-upload__size">
            ({Math.max(1, Math.round(file.size / 1024))} KB)
          </span>
        </p>
      ) : (
        <p className="dashboard-file-upload__empty">No file selected</p>
      )}
    </section>
  )
}
