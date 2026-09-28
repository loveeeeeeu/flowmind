import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { getWorkflow } from '../../api/workflow';
import { queryKeys } from '../../api/queryKeys';
import { WorkflowCanvasEditor } from '../../workflow/WorkflowCanvasEditor';

export function WorkflowEditorPage() {
  const { id = '' } = useParams();

  const workflowQuery = useQuery({
    queryKey: queryKeys.workflows.detail(id),
    queryFn: () => getWorkflow(id),
    enabled: Boolean(id),
  });

  if (!id) {
    return <div style={{ padding: 32 }}>Invalid workflow id.</div>;
  }

  if (workflowQuery.isPending) {
    return <div style={{ padding: 32 }}>Loading editor...</div>;
  }

  if (workflowQuery.isError) {
    return (
      <div style={{ padding: 32 }}>
        <Link to="/workflows">← Back to Workflows</Link>
        <div style={{ color: '#d32f2f', marginTop: 16 }}>
          Failed to load: {workflowQuery.error.message}
        </div>
      </div>
    );
  }

  return <WorkflowCanvasEditor key={workflowQuery.data.id} workflow={workflowQuery.data} />;
}