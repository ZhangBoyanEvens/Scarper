import type { ThemeConfig } from 'antd'
import { theme } from 'antd'

/** MD3 + Apple HIG hybrid — synced with src/styles/tokens.css */
export const SCARPER_DESIGN = {
  colorPrimary: '#1a73e8',
  colorSuccess: '#188038',
  colorWarning: '#f9ab00',
  colorError: '#d93025',
  colorText: '#202124',
  colorTextSecondary: '#5f6368',
  colorTextTertiary: '#80868b',
  colorBorder: '#e8eaed',
  colorBgLayout: '#f8f9fa',
  colorBgContainer: '#ffffff',
  borderRadius: 8,
  borderRadiusSM: 4,
  fontSize: 14,
  fontSizeLG: 16,
  controlHeight: 40,
  lineHeight: 1.5,
} as const

export const scarperAntdTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: SCARPER_DESIGN.colorPrimary,
    colorSuccess: SCARPER_DESIGN.colorSuccess,
    colorWarning: SCARPER_DESIGN.colorWarning,
    colorError: SCARPER_DESIGN.colorError,
    colorInfo: SCARPER_DESIGN.colorPrimary,
    colorLink: SCARPER_DESIGN.colorPrimary,
    colorText: SCARPER_DESIGN.colorText,
    colorTextSecondary: SCARPER_DESIGN.colorTextSecondary,
    colorTextTertiary: SCARPER_DESIGN.colorTextTertiary,
    colorBorder: SCARPER_DESIGN.colorBorder,
    colorBgLayout: SCARPER_DESIGN.colorBgLayout,
    colorBgContainer: SCARPER_DESIGN.colorBgContainer,
    borderRadius: SCARPER_DESIGN.borderRadius,
    borderRadiusSM: SCARPER_DESIGN.borderRadiusSM,
    fontSize: SCARPER_DESIGN.fontSize,
    fontSizeLG: SCARPER_DESIGN.fontSizeLG,
    controlHeight: SCARPER_DESIGN.controlHeight,
    lineHeight: SCARPER_DESIGN.lineHeight,
    fontWeightStrong: 500,
    fontFamily: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif`,
    fontFamilyCode: `Consolas, Menlo, 'SFMono-Regular', 'Liberation Mono', monospace`,
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      bodyBg: '#f8f9fa',
      siderBg: '#ffffff',
      headerHeight: 64,
    },
    Menu: {
      itemSelectedBg: 'rgba(26, 115, 232, 0.08)',
      itemSelectedColor: SCARPER_DESIGN.colorPrimary,
      activeBarBorderWidth: 0,
      horizontalItemSelectedColor: SCARPER_DESIGN.colorPrimary,
    },
    Card: {
      borderRadiusLG: 8,
    },
    Select: {
      optionSelectedBg: 'rgba(26, 115, 232, 0.08)',
      optionActiveBg: '#f1f3f4',
    },
    Button: {
      fontWeight: 500,
      controlHeight: 40,
    },
  },
}

