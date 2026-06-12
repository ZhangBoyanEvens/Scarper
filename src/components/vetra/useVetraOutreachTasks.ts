import { useCallback, useEffect, useState } from 'react'
import { listProjects, peekProjects } from '../../services/projectService'
import {
  listProjectDataRecords,
  peekProjectRecords,
  invalidateRecordsCache,
} from '../../services/projectRecordService'
import type { Project } from '../../types/project'
import {
  outreachTaskKey,
  type VetraOutreachTaskOption,
} from './vetraOutreachTask'

export function useVetraOutreachTasks() {
  const [tasks, setTasks] = useState<VetraOutreachTaskOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTaskKey, setSelectedTaskKey] = useState('')

  const buildTaskOptions = useCallback(
    async (projects: Project[], force = false): Promise<VetraOutreachTaskOption[]> => {
      const options: VetraOutreachTaskOption[] = []

      await Promise.all(
        projects.map(async (project) => {
          if (force) {
            invalidateRecordsCache(project.id)
          }
          const stale = peekProjectRecords(project.id)
          let records = stale
          if (force || records.length === 0) {
            try {
              records = await listProjectDataRecords(project.id)
            } catch {
              records = []
            }
          }

          records.forEach((record, index) => {
            options.push({
              key: outreachTaskKey(project.id, record.id),
              projectId: project.id,
              projectName: project.name,
              record,
              index,
            })
          })
        }),
      )

      options.sort(
        (a, b) =>
          new Date(b.record.uploadedAt).getTime() -
          new Date(a.record.uploadedAt).getTime(),
      )

      return options
    },
    [],
  )

  const refreshTasks = useCallback(async (force = false) => {
    const cachedProjects = peekProjects()
    if (cachedProjects.length === 0) {
      setLoading(true)
    }

    try {
      const projects =
        cachedProjects.length > 0 ? cachedProjects : await listProjects()
      const nextTasks = await buildTaskOptions(projects, force)
      setTasks(nextTasks)
      setSelectedTaskKey((current) => {
        if (current && nextTasks.some((task) => task.key === current)) {
          return current
        }
        return nextTasks[0]?.key ?? ''
      })
    } catch {
      setTasks([])
      setSelectedTaskKey('')
    } finally {
      setLoading(false)
    }
  }, [buildTaskOptions])

  useEffect(() => {
    void refreshTasks()
    const onChanged = () => void refreshTasks()
    window.addEventListener('scarper:projects-changed', onChanged)
    window.addEventListener('scarper:project-records-changed', onChanged)
    return () => {
      window.removeEventListener('scarper:projects-changed', onChanged)
      window.removeEventListener('scarper:project-records-changed', onChanged)
    }
  }, [refreshTasks])

  const selectedTask =
    tasks.find((task) => task.key === selectedTaskKey) ?? null

  return {
    tasks,
    loading,
    selectedTaskKey,
    setSelectedTaskKey,
    selectedTask,
    refreshTasks,
  }
}
