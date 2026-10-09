import { useState, type FormEvent } from 'react';
import type { CreateWorkflowInput } from '../types/workflow';

interface CreateWorkflowFormProps {
  onSubmit: (input: CreateWorkflowInput) => void;
  onCancel: () => void;
  pending?: boolean;
}

export function CreateWorkflowForm({
  onSubmit,
  onCancel,
  pending = false,
}: CreateWorkflowFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
    });
  }

  return (
    <form
      className="create-workflow-form"
      onSubmit={handleSubmit}
      style={{
        display: 'grid',
        gap: 12,
        marginBottom: 24,
        padding: 20,
        background: '#fff',
        border: '1px solid #e5e5e5',
        borderRadius: 12,
      }}
    >
      <label>
        <div>应用名称</div>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：智能客服助手"
        />
      </label>

      <label>
        <div>应用描述 <span>（可选）</span></div>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="简要说明这个工作流要完成的事情"
        />
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="submit" disabled={pending}>
          {pending ? '创建中…' : '创建'}
        </button>
      </div>
    </form>
  );
}
