'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button, Checkbox, Field, Input } from '@/components/ui/primitives';

export function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, remember }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? 'Sign in failed.'); setBusy(false); return; }
    const next = params.get('next');
    window.location.href = next && next.startsWith('/') ? next : '/';
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm">
      <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
      <p className="mt-1 text-sm text-muted">Sign in to your workspace.</p>
      <div className="mt-8 space-y-4">
        <Field label="Email">
          <Input type="email" autoComplete="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" inputSize="lg" />
        </Field>
        <Field label="Password">
          <div className="relative">
            <Input type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" inputSize="lg" className="pr-10" />
            <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
          </div>
        </Field>
        <Checkbox label="Keep me signed in for 30 days" checked={remember} onChange={setRemember} />
        {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon={<LogIn className="size-4" />}>Sign in</Button>
      </div>
      <p className="mt-8 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-xs text-muted">
        First run? Sign in with <b className="text-ink-2">admin@example.com</b> / <b className="text-ink-2">admin123</b>, then change the password under Profile.
      </p>
    </form>
  );
}
