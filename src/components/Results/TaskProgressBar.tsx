import './TaskProgressBar.css'

interface TaskProgressBarProps {
  progress: number
  stepLabel: string
  stepHint?: string
  taskIndex: number
  taskTotal: number
  currentUrl?: string
  usingPrompt?: boolean
}

export function TaskProgressBar({
  progress,
  stepLabel,
  stepHint,
  taskIndex,
  taskTotal,
  currentUrl,
  usingPrompt,
}: TaskProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress))

  return (
    <div className="task-progress" aria-busy="true" aria-live="polite">
      <div className="task-progress-header">
        <span className="task-progress-count">
          Task {taskIndex}/{taskTotal}
        </span>
        {usingPrompt && (
          <span className="task-progress-prompt">Processing prompt applied</span>
        )}
      </div>
      <div
        className="task-progress-track"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="task-progress-fill"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="task-progress-step">{stepLabel}</p>
      {stepHint && <p className="task-progress-hint">{stepHint}</p>}
      {currentUrl && (
        <p className="task-progress-url" title={currentUrl}>
          {currentUrl}
        </p>
      )}
    </div>
  )
}
