import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { login, register } from '../../api/auth';
import { setAccessToken } from '../../auth/token';

export function LoginPage() {
  return <AuthForm mode="login" />;
}

export function RegisterPage() {
  return <AuthForm mode="register" />;
}

function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const isRegister = mode === 'register';
  const mutation = useMutation({
    mutationFn: () => isRegister
      ? register({ email, password, ...(name.trim() ? { name: name.trim() } : {}) })
      : login({ email, password }),
    onSuccess: (result) => {
      setAccessToken(result.accessToken);
      navigate(result.project ? `/projects/${result.project.id}/workflows` : '/', { replace: true });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">FlowMind</div>
        <h1>{isRegister ? '创建账号' : '登录'}</h1>
        <p>{isRegister ? '注册后会自动创建你的 Personal Workspace。' : '登录后继续管理你的工作流。'}</p>
        {isRegister && <label>名称<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></label>}
        <label>Email<input type="email" autoComplete="email" value={email} required onChange={(event) => setEmail(event.target.value)} /></label>
        <label>密码<input type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={8} maxLength={128} value={password} required onChange={(event) => setPassword(event.target.value)} /></label>
        {mutation.isError && <div className="auth-error">{mutation.error.message}</div>}
        <button className="primary-button" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? '请稍候…' : isRegister ? '注册并进入工作区' : '登录'}
        </button>
        <p className="auth-switch">{isRegister ? '已有账号？' : '还没有账号？'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? '登录' : '注册'}</Link></p>
      </form>
    </main>
  );
}
