import { Button, Select } from 'antd'
import type { ProjectDataRecord } from '../../types/projectRecord'
import { useI18n } from '../../contexts/I18nContext'
import {
  SCARPER_SELECT_WIDE,
  scarperSelectPopup,
} from '../common/scarperForm'
import './DashboardTaskSelect.css'

interface DashboardTaskSelectProps {
  records: ProjectDataRecord[]
  selectedIds: string[]
  disabled?: boolean
  formatLabel: (record: ProjectDataRecord, index: number) => string
  onChange: (ids: string[]) => void
}

export function DashboardTaskSelect({
  records,
  selectedIds,
  disabled = false,
  formatLabel,
  onChange,
}: DashboardTaskSelectProps) {
  const { t } = useI18n()

  const summarizeSelection = (): string => {
    if (records.length === 0) return t('taskSelect.noRecords')
    if (selectedIds.length === 0) return t('taskSelect.selectTask')
    if (selectedIds.length === 1) {
      const idx = records.findIndex((r) => r.id === selectedIds[0])
      if (idx >= 0) return formatLabel(records[idx], idx)
    }
    return t('taskSelect.tasksSelected', { count: selectedIds.length })
  }

  const options = records.map((record, index) => ({
    value: record.id,
    label: formatLabel(record, index),
  }))

  return (
    <Select
      mode="multiple"
      size="middle"
      className="dashboard-task-select"
      style={SCARPER_SELECT_WIDE}
      getPopupContainer={scarperSelectPopup}
      popupMatchSelectWidth={false}
      listHeight={280}
      placeholder={
        records.length === 0
          ? t('taskSelect.noRecords')
          : t('taskSelect.selectTask')
      }
      disabled={disabled || records.length === 0}
      value={selectedIds}
      options={options}
      maxTagCount={0}
      maxTagPlaceholder={summarizeSelection}
      onChange={(ids) => {
        if (ids.length === 0) return
        onChange(ids)
      }}
      dropdownRender={(menu) => (
        <div className="dashboard-task-select__dropdown">
          <div className="dashboard-task-select__dropdown-head">
            <span>{t('taskSelect.multiSelect')}</span>
            <Button
              type="link"
              size="small"
              disabled={records.length === 0}
              onClick={() => onChange(records.map((r) => r.id))}
            >
              {t('taskSelect.selectAll')}
            </Button>
          </div>
          {menu}
        </div>
      )}
    />
  )
}
