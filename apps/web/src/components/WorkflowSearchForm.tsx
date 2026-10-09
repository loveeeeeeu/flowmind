import { useState, type FormEvent } from 'react';

interface WorkflowSearchFormProps {
  initialKeyword: string;
  onSearch: (keyword: string) => void;
}

export function WorkflowSearchForm({ initialKeyword, onSearch }: WorkflowSearchFormProps) {
  const [value, setValue] = useState(initialKeyword);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(value.trim());
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="搜索应用"
        style={{ flex: 1, padding: 10 }}
      />
      <button type="submit">搜索</button>
      <button
        type="button"
        onClick={() => {
          setValue('');
          onSearch('');
        }}
      >
        清除
      </button>
    </form>
  );
}
