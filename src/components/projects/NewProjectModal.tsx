import { Form, Input, Modal } from 'antd'
import { useEffect } from 'react'
import { useI18n } from '../../contexts/I18nContext'

interface NewProjectModalProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string, description: string) => void
}

export function NewProjectModal({
  open,
  onClose,
  onCreate,
}: NewProjectModalProps) {
  const { t } = useI18n()
  const [form] = Form.useForm<{ name: string; description: string }>()

  useEffect(() => {
    if (open) {
      form.resetFields()
    }
  }, [open, form])

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      onCreate(values.name.trim(), (values.description ?? '').trim())
      onClose()
    } catch {
      /* validation failed */
    }
  }

  return (
    <Modal
      title={t('project.modal.title')}
      open={open}
      onCancel={onClose}
      onOk={() => void handleOk()}
      okText={t('project.modal.create')}
      cancelText={t('common.cancel')}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="name"
          label={t('project.modal.nameLabel')}
          rules={[
            { required: true, message: t('project.modal.nameRequired') },
            { max: 80, message: t('project.modal.nameMax') },
          ]}
        >
          <Input
            placeholder={t('project.modal.namePlaceholder')}
            maxLength={80}
            autoFocus
          />
        </Form.Item>
        <Form.Item name="description" label={t('project.modal.notesLabel')}>
          <Input.TextArea
            placeholder={t('project.modal.notesPlaceholder')}
            rows={3}
            maxLength={300}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
