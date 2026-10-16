import { NavLink, useParams } from 'react-router';

export function SettingsTabs() {
  const { projectId = '' } = useParams();
  return (
    <nav className="settings-tabs" aria-label="模型设置">
      <NavLink to={`/projects/${projectId}/settings/models`}>模型中心</NavLink>
      <NavLink to={`/projects/${projectId}/settings/credentials`}>模型凭证</NavLink>
      <NavLink to={`/projects/${projectId}/settings/members`}>Members</NavLink>
    </nav>
  );
}
