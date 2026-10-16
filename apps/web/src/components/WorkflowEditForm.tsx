import { useState, type FormEvent } from 'react';
import type { UpdateWorkflowInput, Workflow } from '../types/workflow';

interface WorkflowEditFormProps {
  workflow: Workflow;
  onSubmit: (input: UpdateWorkflowInput) => void;
  pending?: boolean;
  readOnly?: boolean;
}

export function WorkflowEditForm({
  workflow,
  onSubmit,
  pending = false,
  readOnly = false,
}: WorkflowEditFormProps) {
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description ?? '');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    if (readOnly) {
      return;
    }

    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'grid',
        gap: 20,
        padding: 24,
        background: '#fff',
        border: '1px solid #e5e5e5',
        borderRadius: 12,
      }}
    >
      <label>
        <div style={{ marginBottom: 8 }}>Name</div>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={readOnly}
          style={{ width: '100%', padding: 10 }}
        />
      </label>

      <label>
        <div style={{ marginBottom: 8 }}>Description</div>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={readOnly}
          rows={5}
          style={{ width: '100%', padding: 10 }}
        />
      </label>

      <div>
        <button type="submit" disabled={pending || readOnly}>
          {pending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
