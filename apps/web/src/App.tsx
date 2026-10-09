import { Navigate, NavLink, Route, Routes } from 'react-router';
import { WorkflowListPage } from './pages/workflows/WorkflowListPage';
import { WorkflowDetailPage } from './pages/workflows/WorkflowDetailPage.tsx';
import { WorkflowEditorPage } from './pages/workflows/WorkflowEditorPage.tsx';

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
        </nav>
        <div className="global-nav-actions"><button className="nav-search" type="button">⌕ 搜索</button><span className="avatar">FM</span></div>
      </header>
      <Routes>
        <Route path="/" element={<Navigate to="/workflows" replace />} />
        <Route path="/workflows" element={<WorkflowListPage />} />
        <Route path="/workflows/:id" element={<WorkflowDetailPage />} />
        <Route path="/workflows/:id/editor" element={<WorkflowEditorPage />} />
      </Routes>
    </div>
  );
}

export default App;
