import { Space, Typography } from 'antd'
import type { ReactNode } from 'react'

const { Text } = Typography

interface ScarperToolbarFieldProps {
  label: string
  children: ReactNode
}

export function ScarperToolbarField({ label, children }: ScarperToolbarFieldProps) {
  return (
    <Space size={8} align="center">
      <Text type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
        {label}
      </Text>
      {children}
    </Space>
  )
}
