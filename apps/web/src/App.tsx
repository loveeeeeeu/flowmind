import { Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { getProjects } from './api/projects';
import { WorkflowListPage } from './pages/workflows/WorkflowListPage';
import { WorkflowDetailPage } from './pages/workflows/WorkflowDetailPage.tsx';
import { WorkflowEditorPage } from './pages/workflows/WorkflowEditorPage.tsx';
import { CredentialsPage } from './pages/settings/CredentialsPage';
import { ModelCenterPage } from './pages/settings/ModelCenterPage';

function App() {
  return (
    <div className="app-shell">
      <header className="global-nav">
        <NavLink to="/" className="brand" aria-label="FlowMind 工作台">
          <span className="brand-mark"><i /><i /><i /><i /></span>
          <span>FlowMind</span>
        </NavLink>
        <ProjectSwitcher />
        <nav className="global-nav-links" aria-label="主导航">
          <ProjectNav />
          <a href="#knowledge" onClick={(event) => event.preventDefault()}>▤ 知识库</a>
          <a href="#tools" onClick={(event) => event.preventDefault()}>⌘ 工具</a>
          <SettingsNav />
        </nav>
        <div className="global-nav-actions"><button className="nav-search" type="button">⌕ 搜索</button><span className="avatar">FM</span></div>
      </header>
      <Routes>
        <Route path="/" element={<ProjectEntry />} />
        <Route path="/projects/:projectId/workflows" element={<WorkflowListPage />} />
        <Route path="/projects/:projectId/workflows/:id" element={<WorkflowDetailPage />} />
        <Route path="/projects/:projectId/workflows/:id/editor" element={<WorkflowEditorPage />} />
        <Route path="/projects/:projectId/settings" element={<ProjectSettingsEntry />} />
        <Route path="/projects/:projectId/settings/models" element={<ModelCenterPage />} />
        <Route path="/projects/:projectId/settings/credentials" element={<CredentialsPage />} />
        <Route path="*" element={<ProjectEntry />} />
      </Routes>
    </div>
  );
}

function useProjects() {
  return useQuery({ queryKey: ['projects'] as const, queryFn: getProjects });
}

function ProjectEntry() {
  const projects = useProjects();
  if (projects.isPending) return <main className="workspace-page">Loading projects...</main>;
  if (projects.isError || !projects.data?.[0]) return <main className="workspace-page">No project is available.</main>;
  return <Navigate to={`/projects/${projects.data[0].id}/workflows`} replace />;
}

function ProjectSettingsEntry() {
  const { projectId = '' } = useParams();
  return <Navigate to={`/projects/${projectId}/settings/models`} replace />;
}

function ProjectSwitcher() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const projects = useProjects();
  return (
    <select
      className="workspace-switcher"
      value={projectId}
      aria-label="项目切换"
      disabled={!projects.data?.length}
      onChange={(event) => navigate(`/projects/${event.target.value}/workflows`)}
    >
      {!projectId && <option value="">我的工作区</option>}
      {projects.data?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select>
  );
}

function ProjectNav() {
  const { projectId = '' } = useParams();
  return <NavLink to={projectId ? `/projects/${projectId}/workflows` : '/'}>▦ 工作室</NavLink>;
}

function SettingsNav() {
  const { projectId = '' } = useParams();
  return <NavLink to={projectId ? `/projects/${projectId}/settings/models` : '/'}>⚿ 模型设置</NavLink>;
}

export default App;
