'use client';
import { History as HistoryIcon } from 'lucide-react';
import { useState } from 'react';
import { useRpc } from '@/lib/client/rpc';
import { dateTime } from '@/lib/format';
import { Button } from '@/components/ui/primitives';
import { Drawer } from '@/components/ui/overlay';

export function HistoryButton({ entities, label = 'History' }: { entities: string[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="md" variant="ghost" icon={<HistoryIcon className="size-4" />} onClick={() => setOpen(true)}>{label}</Button>
      <HistoryDrawer open={open} onClose={() => setOpen(false)} entities={entities} />
    </>
  );
}

export function HistoryDrawer({ open, onClose, entities }: { open: boolean; onClose: () => void; entities: string[] }) {
  const { data } = useRpc(open ? 'admin.activityFor' : null, [entities, 80], [open, entities.join()]);
  return (
    <Drawer open={open} onClose={onClose} title="Activity history" subtitle="Who changed what, newest first" width="max-w-md">
      {!data ? <p className="text-sm text-muted">Loading…</p> : !data.length ? <p className="py-10 text-center text-sm text-muted">No activity recorded yet.</p> : (
        <ol className="relative space-y-4 border-l border-line pl-5">
          {data.map((a: any) => (
            <li key={a.id}>
              <span className={`absolute -left-[6px] mt-1.5 size-3 rounded-full border-2 border-surface ${a.action === 'delete' ? 'bg-bad' : a.action === 'create' ? 'bg-ok' : 'bg-brand'}`} />
              <p className="text-sm text-ink">{a.summary}</p>
              <p className="text-xs text-muted">{a.user_name ?? 'System'} · {dateTime(a.at)}</p>
            </li>
          ))}
        </ol>
      )}
    </Drawer>
  );
}
