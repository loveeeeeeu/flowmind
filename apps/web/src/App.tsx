import { Navigate, Route, Routes } from 'react-router';
import { WorkflowListPage } from './pages/workflows/WorkflowListPage';
import { WorkflowDetailPage } from './pages/workflows/WorkflowDetailPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/workflows" replace />} />
      <Route path="/workflows" element={<WorkflowListPage />} />
      <Route path="/workflows/:id" element={<WorkflowDetailPage />} />
    </Routes>
  );
}

export default App;