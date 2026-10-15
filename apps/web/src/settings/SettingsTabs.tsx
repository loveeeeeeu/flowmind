import { NavLink } from 'react-router';

export function SettingsTabs() {
  return (
    <nav className="settings-tabs" aria-label="模型设置">
      <NavLink to="/settings/models">模型中心</NavLink>
      <NavLink to="/settings/credentials">模型凭证</NavLink>
    </nav>
  );
}
