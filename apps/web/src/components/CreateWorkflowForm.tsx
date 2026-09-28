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
        <div>Name</div>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Customer Service"
        />
      </label>

      <label>
        <div>Description</div>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="AI customer service workflow"
        />
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={pending}>
          {pending ? 'Creating...' : 'Create'}
        </button>
      </div>
    </form>
  );
}