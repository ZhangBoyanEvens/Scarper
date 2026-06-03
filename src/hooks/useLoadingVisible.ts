import { useEffect, useState } from 'react'

/** 加载提示最多显示 maxMs，避免长时间卡在「加载中」 */
export function useLoadingVisible(
  loading: boolean,
  maxMs = 5000,
): boolean {
  const [visible, setVisible] = useState(loading)

  useEffect(() => {
    if (!loading) {
      setVisible(false)
      return
    }
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), maxMs)
    return () => window.clearTimeout(timer)
  }, [loading, maxMs])

  return visible
}
