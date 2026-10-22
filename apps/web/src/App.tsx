import { Navigate, NavLink, Route, Routes, useMatch, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe } from './api/auth';
import { getProjects } from './api/projects';
import { clearAccessToken, getAccessToken } from './auth/token';
import { LoginPage, RegisterPage } from './pages/auth/AuthPage';
import { WorkflowListPage } from './pages/workflows/WorkflowListPage';
import { WorkflowDetailPage } from './pages/workflows/WorkflowDetailPage.tsx';
import { WorkflowEditorPage } from './pages/workflows/WorkflowEditorPage.tsx';
import { CredentialsPage } from './pages/settings/CredentialsPage';
import { ModelCenterPage } from './pages/settings/ModelCenterPage';
import { ProjectMembersPage } from './pages/settings/ProjectMembersPage';
import { KnowledgeBasePage } from './pages/knowledge/KnowledgeBasePage';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="*" element={<AuthenticatedApp />} />
    </Routes>
  );
}

function AuthenticatedApp() {
  const hasToken = Boolean(getAccessToken());
  const me = useQuery({ queryKey: ['auth', 'me'] as const, queryFn: getMe, enabled: hasToken, retry: false });

  if (!hasToken || me.isError) {
    return <Navigate to="/login" replace />;
  }
  if (me.isPending) {
    return <main className="auth-page">正在验证登录状态…</main>;
  }
  return <AppShell userName={me.data.name ?? me.data.email} />;
}

function AppShell({ userName }: { userName: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  function logout() {
    clearAccessToken();
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="global-nav">
        <NavLink to="/" className="brand" aria-label="FlowMind 工作台">
          <span className="brand-mark"><i /><i /><i /><i /></span><span>FlowMind</span>
        </NavLink>
        <ProjectSwitcher />
        <nav className="global-nav-links" aria-label="主导航">
          <ProjectNav />
          <KnowledgeNav />
          <a href="#tools" onClick={(event) => event.preventDefault()}>⌘ 工具</a>
          <SettingsNav />
        </nav>
        <div className="global-nav-actions"><span className="avatar" title={userName}>{userName.slice(0, 2).toUpperCase()}</span><button className="nav-search" type="button" onClick={logout}>退出</button></div>
      </header>
      <Routes>
        <Route path="/" element={<ProjectEntry />} />
        <Route path="/projects/:projectId/workflows" element={<WorkflowListPage />} />
        <Route path="/projects/:projectId/workflows/:id" element={<WorkflowDetailPage />} />
        <Route path="/projects/:projectId/workflows/:id/editor" element={<WorkflowEditorPage />} />
        <Route path="/projects/:projectId/knowledge" element={<KnowledgeBasePage />} />
        <Route path="/projects/:projectId/settings" element={<ProjectSettingsEntry />} />
        <Route path="/projects/:projectId/settings/models" element={<ModelCenterPage />} />
        <Route path="/projects/:projectId/settings/credentials" element={<CredentialsPage />} />
        <Route path="/projects/:projectId/settings/members" element={<ProjectMembersPage />} />
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
  const projectId = useCurrentProjectId();
  const navigate = useNavigate();
  const projects = useProjects();
  return <select className="workspace-switcher" value={projectId} aria-label="项目切换" disabled={!projects.data?.length} onChange={(event) => navigate(`/projects/${event.target.value}/workflows`)}>
    {!projectId && <option value="">我的工作区</option>}
    {projects.data?.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.role}</option>)}
  </select>;
}

function ProjectNav() {
  const projectId = useCurrentProjectId();
  return <NavLink to={projectId ? `/projects/${projectId}/workflows` : '/'}>▦ 工作室</NavLink>;
}

function KnowledgeNav() {
  const projectId = useCurrentProjectId();
  return <NavLink to={projectId ? `/projects/${projectId}/knowledge` : '/'}>▤ 知识库</NavLink>;
}

function SettingsNav() {
  const projectId = useCurrentProjectId();
  return <NavLink to={projectId ? `/projects/${projectId}/settings/models` : '/'}>⚿ 模型设置</NavLink>;
}

/** Global navigation is outside the nested project routes, so useParams() cannot see :projectId. */
function useCurrentProjectId() {
  return useMatch('/projects/:projectId/*')?.params.projectId ?? '';
}

export default App;
