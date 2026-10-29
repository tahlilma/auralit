import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { all, get, run, nowStamp } from './db';
import { can, type Action, type Perms } from '../permissions';

export const SESSION_COOKIE = 'auralit_session';

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  image: string | null;
  role_id: number;
  role_name: string;
  branch_id: number;
  is_admin: boolean;
  perms: Perms;
  report_perms: string[];
};

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

export function createSession(userId: number, remember: boolean): { token: string; expires: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + (remember ? 30 : 1) * 24 * 3600 * 1000);
  run(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`, [token, userId, expires.toISOString()]);
  run(`UPDATE users SET last_active = ? WHERE id = ?`, [nowStamp(), userId]);
  return { token, expires };
}

export function destroySession(token: string) {
  run(`DELETE FROM sessions WHERE token = ?`, [token]);
}

export function userByToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const r = get(
    `SELECT u.id, u.name, u.email, u.image, u.role_id, u.branch_id, u.status, r.name role_name, r.perms, r.report_perms, r.is_admin, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN roles r ON r.id = u.role_id WHERE s.token = ?`,
    [token],
  );
  if (!r || r.status !== 'active' || new Date(r.expires_at) < new Date()) return null;
  return {
    id: r.id, name: r.name, email: r.email, image: r.image, role_id: r.role_id, role_name: r.role_name ?? '',
    branch_id: r.branch_id ?? 1, is_admin: !!r.is_admin,
    perms: JSON.parse(r.perms || '{}'), report_perms: JSON.parse(r.report_perms || '[]'),
  };
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return userByToken(jar.get(SESSION_COOKIE)?.value);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function assertCan(user: SessionUser, mod: string, action: Action = 'read') {
  if (!can(user.perms, user.is_admin, mod, action)) {
    throw new HttpError(403, `You don't have ${action} permission for this module.`);
  }
}

export function log(user: SessionUser | null, entity: string, entityId: number | null, action: string, summary: string) {
  run(`INSERT INTO activity (user_id, entity, entity_id, action, summary) VALUES (?, ?, ?, ?, ?)`, [user?.id ?? null, entity, entityId, action, summary]);
}

export function history(entity: string | string[], limit = 40) {
  const list = Array.isArray(entity) ? entity : [entity];
  return all(
    `SELECT a.*, u.name user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.entity IN (${list.map(() => '?').join(',')}) ORDER BY a.id DESC LIMIT ?`,
    [...list, limit],
  );
}
