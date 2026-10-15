import { Navigate, NavLink, Route, Routes } from 'react-router';
import { WorkflowListPage } from './pages/workflows/WorkflowListPage';
import { WorkflowDetailPage } from './pages/workflows/WorkflowDetailPage.tsx';
import { WorkflowEditorPage } from './pages/workflows/WorkflowEditorPage.tsx';
import { CredentialsPage } from './pages/settings/CredentialsPage';
import { ModelCenterPage } from './pages/settings/ModelCenterPage';

function App() {
  return (
    <div className="app-shell">
      <header className="global-nav">
        <NavLink to="/workflows" className="brand" aria-label="FlowMind 工作台">
          <span className="brand-mark"><i /><i /><i /><i /></span>
          <span>FlowMind</span>
        </NavLink>
        <button className="workspace-switcher" type="button">我的工作区 <span>⌄</span></button>
        <nav className="global-nav-links" aria-label="主导航">
          <NavLink to="/workflows">▦ 工作室</NavLink>
          <a href="#knowledge" onClick={(event) => event.preventDefault()}>▤ 知识库</a>
          <a href="#tools" onClick={(event) => event.preventDefault()}>⌘ 工具</a>
          <NavLink to="/settings">⚿ 模型设置</NavLink>
        </nav>
        <div className="global-nav-actions"><button className="nav-search" type="button">⌕ 搜索</button><span className="avatar">FM</span></div>
      </header>
      <Routes>
        <Route path="/" element={<Navigate to="/workflows" replace />} />
        <Route path="/workflows" element={<WorkflowListPage />} />
        <Route path="/workflows/:id" element={<WorkflowDetailPage />} />
        <Route path="/workflows/:id/editor" element={<WorkflowEditorPage />} />
        <Route path="/settings" element={<Navigate to="/settings/models" replace />} />
        <Route path="/settings/models" element={<ModelCenterPage />} />
        <Route path="/settings/credentials" element={<CredentialsPage />} />
      </Routes>
    </div>
  );
}

export default App;
