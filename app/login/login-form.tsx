'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { Button, Checkbox, Field, Input } from '@/components/ui/primitives';

export function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Shown only while the first-run administrator still has its default password.
  const [firstRun, setFirstRun] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth').then(r => r.json()).then(d => setFirstRun(d.defaultLogin ? d.email : null)).catch(() => {});
  }, []);

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
    <form onSubmit={submit} className="w-full max-w-[360px]">
      <h1 className="text-[24px] font-semibold tracking-[-0.01em] text-ink">Sign in</h1>
      <p className="mt-1.5 text-[14px] text-muted">Use the email and password your administrator gave you.</p>
      <div className="mt-8 space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" inputSize="lg" />
        </Field>
        <Field label="Password" htmlFor="password">
          <div className="relative">
            <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} inputSize="lg" className="pr-10" />
            <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
          </div>
        </Field>
        <Checkbox label="Keep me signed in for 30 days" checked={remember} onChange={setRemember} />
        {error && <p className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[14px] text-ink" role="alert"><span className="size-2 shrink-0 rounded-full bg-bad" />{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>Sign in</Button>
      </div>
      {firstRun && (
        <p className="mt-8 border-t border-line pt-4 text-[13px] text-muted">
          First time here? Sign in with <span className="text-ink">{firstRun}</span> and <span className="text-ink">admin123</span>, then change the password under Profile.
        </p>
      )}
    </form>
  );
}
