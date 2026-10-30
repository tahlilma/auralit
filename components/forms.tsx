'use client';
import { useRef } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { Field as FieldDef } from '@/lib/entities';
import { cx, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { RefSelect } from '@/components/ui/combobox';

/** Shrinks an uploaded image to a data URL (keeps the database small). */
export function fileToDataUrl(file: File, max = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ImageInput({ value, onChange }: { value?: string | null; onChange: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => ref.current?.click()} className="flex size-20 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-surface-2 text-muted hover:border-brand hover:text-brand">
        {value ? <img src={value} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6" />}
      </button>
      <div className="text-xs text-muted">
        <button type="button" className="font-medium text-brand hover:underline" onClick={() => ref.current?.click()}>{value ? 'Change image' : 'Upload image'}</button>
        {value && <button type="button" className="ml-3 inline-flex items-center gap-1 text-bad hover:underline" onClick={() => onChange(null)}><Trash2 className="size-3" /> Remove</button>}
        <p className="mt-0.5">JPG or PNG. Resized automatically.</p>
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) onChange(await fileToDataUrl(f)); e.target.value = ''; }} />
    </div>
  );
}

export function FieldInput({ f, value, onChange, values, autoFocus }: { f: FieldDef; value: any; onChange: (v: any) => void; values: Record<string, any>; autoFocus?: boolean }) {
  const t = f.type ?? 'text';
  if (t === 'textarea') return <Textarea value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={f.placeholder} />;
  if (t === 'select') return (
    <Select value={value ?? ''} onChange={e => onChange(e.target.value)} style={value ? undefined : { color: 'var(--muted)' }}>
      {!f.required && f.default === undefined && <option value="">{f.placeholder ?? '— Select —'}</option>}
      {f.options?.map(o => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
    </Select>
  );
  if (t === 'ref') return <RefSelect refKey={f.ref!} parent={f.dependsOn ? values[f.dependsOn] ?? null : undefined} value={value} onChange={v => onChange(v)} placeholder={f.placeholder ?? `Select ${f.label.toLowerCase()}`} />;
  if (t === 'image') return <ImageInput value={value} onChange={onChange} />;
  if (t === 'color') return (
    <div className="flex items-center gap-2">
      <input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)} className="h-9 w-14 cursor-pointer rounded-lg border border-line-strong bg-surface p-1" />
      <Input value={value ?? ''} onChange={e => onChange(e.target.value)} className="font-mono" />
    </div>
  );
  if (t === 'checkbox') return <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={!!Number(value)} onChange={e => onChange(e.target.checked ? 1 : 0)} />;
  return (
    <Input autoFocus={autoFocus} type={t === 'money' || t === 'number' ? 'number' : t === 'date' ? 'date' : t === 'email' ? 'email' : t === 'tel' ? 'tel' : t === 'password' ? 'password' : 'text'}
      step={t === 'money' ? '0.01' : 'any'} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={f.placeholder} className={cx((t === 'money' || t === 'number') && 'num')} />
  );
}

export function FormGrid({ fields, values, onChange, creating, errors }: { fields: FieldDef[]; values: Record<string, any>; onChange: (name: string, v: any) => void; creating: boolean; errors?: Record<string, string> }) {
  const visible = fields.filter(f => !f.hidden && (!f.createOnly || creating) && !(f.auto && creating));
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-3">
      {visible.map((f, i) => (
        <Field key={f.name} label={f.label} required={f.required} hint={f.auto ? 'Generated automatically' : f.help} error={errors?.[f.name]}
          className={cx(f.span === 3 || f.type === 'textarea' || f.type === 'image' ? 'sm:col-span-3' : f.span === 2 ? 'sm:col-span-2' : '')}>
          {f.auto ? <Input value={values[f.name] ?? ''} readOnly /> : (
            <FieldInput f={f} value={values[f.name]} values={values} autoFocus={i === 0} onChange={v => {
              onChange(f.name, v);
              for (const dep of fields.filter(x => x.dependsOn === f.name)) onChange(dep.name, null);
            }} />
          )}
        </Field>
      ))}
    </div>
  );
}
