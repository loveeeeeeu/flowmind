import { Navigate, Route, Routes } from 'react-router';
import { WorkflowListPage } from './pages/workflows/WorkflowListPage';
import { WorkflowDetailPage } from './pages/workflows/WorkflowDetailPage.tsx';
import { WorkflowEditorPage } from './pages/workflows/WorkflowEditorPage.tsx';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/workflows" replace />} />
      <Route path="/workflows" element={<WorkflowListPage />} />
      <Route path="/workflows/:id" element={<WorkflowDetailPage />} />
      <Route path="/workflows/:id/editor" element={<WorkflowEditorPage />} />
    </Routes>
  );
}

export default App;