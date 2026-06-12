import { App as AntApp, ConfigProvider } from 'antd'
import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'
import type { ReactNode } from 'react'
import { useAppSettings } from '../contexts/AppSettingsContext'
import { scarperSelectPopup } from '../components/common/scarperForm'
import { scarperAntdTheme } from '../theme/antdTheme'

export function AntdProvider({ children }: { children: ReactNode }) {
  const { settings } = useAppSettings()
  const antdLocale = settings.ui.locale === 'zh' ? zhCN : enUS

  return (
    <ConfigProvider
      theme={scarperAntdTheme}
      locale={antdLocale}
      getPopupContainer={scarperSelectPopup}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  )
}
