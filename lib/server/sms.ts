import 'server-only';
import { get, insert, run, setting } from './db';

/** Sends an SMS through the configured gateway (URL or API style). Logs every attempt. */
export async function sendSms(mobile: string, body: string): Promise<{ ok: boolean; response: string }> {
  const url = setting('sms_gateway_url');
  const logId = insert('sms_log', { mobile, body, status: 'pending' });
  if (!url || setting('sms_status', '0') !== '1') {
    run(`UPDATE sms_log SET status = 'skipped', response = 'SMS gateway disabled or not configured' WHERE id = ?`, [logId]);
    return { ok: false, response: 'SMS gateway disabled or not configured' };
  }
  const params: Record<string, string> = {};
  const put = (k: string, v: string) => { if (k) params[k] = v; };
  put(setting('sms_api_var', 'apikey'), setting('sms_api_key'));
  put(setting('sms_user_var'), setting('sms_user'));
  put(setting('sms_pass_var'), setting('sms_password'));
  put(setting('sms_sender_var'), setting('sms_sender'));
  put(setting('sms_from_var'), setting('sms_sender'));
  put(setting('sms_to_var', 'to'), mobile);
  put(setting('sms_msg_var', 'message'), body);
  put(setting('sms_other_var'), setting('sms_other_val'));
  for (const k of Object.keys(params)) if (!params[k]) delete params[k];
  try {
    const res = setting('sms_type', 'url') === 'api'
      ? await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) })
      : await fetch(`${url}${url.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`);
    const text = (await res.text()).slice(0, 500);
    run(`UPDATE sms_log SET status = ?, response = ? WHERE id = ?`, [res.ok ? 'sent' : 'failed', text, logId]);
    return { ok: res.ok, response: text };
  } catch (e: any) {
    run(`UPDATE sms_log SET status = 'failed', response = ? WHERE id = ?`, [String(e?.message ?? e), logId]);
    return { ok: false, response: String(e?.message ?? e) };
  }
}

export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  const company = get(`SELECT name, mobile, web FROM company WHERE id = 1`);
  const all: Record<string, string> = { COMPANY_NAME: company?.name ?? '', COMPANY_MOBILE: company?.mobile ?? '', SITE_URL: company?.web ?? '', ...vars };
  return tpl.replace(/\[([A-Z_]+)\]/g, (m, k) => (k in all ? all[k] : m));
}

/** Fire-and-forget template SMS (invoice / receive / payment / greeting) when that template is active. */
export function sendTemplateSms(kind: 'invoice' | 'receive' | 'payment' | 'greeting', mobile: string, vars: Record<string, string>) {
  if (setting(`sms_tpl_${kind}_status`) !== 'active') return;
  const body = fillTemplate(setting(`sms_tpl_${kind}`), vars);
  void sendSms(mobile, body);
}
