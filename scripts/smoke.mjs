// End-to-end smoke test: creates test data through the RPC API and checks that the books balance.
// Run it against a throwaway database — it writes real records.
// Usage: start the app (npm run dev), then: node scripts/smoke.mjs [baseUrl]
const BASE = process.argv[2] || 'http://localhost:3000';
let cookie = '';
const login = await fetch(BASE + '/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' }) });
cookie = login.headers.getSetCookie()[0].split(';')[0];
async function R(fn, ...args) {
  const r = await fetch(BASE + '/api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ fn, args }) });
  const j = await r.json();
  if (j.error) throw new Error(`${fn}: ${j.error}`);
  return j.result;
}
const ok = (c, m) => { if (!c) throw new Error('ASSERT ' + m); console.log('✓', m); };
const t = Date.now();

const brand = await R('crud.create', 'brand', { name: 'TestBrand ' + t });
const cat = await R('crud.create', 'category', { name: 'TestCat ' + t });
const prod = await R('crud.create', 'product', { name: 'Grinder ' + t, category_id: cat.id, brand_id: brand.id, price: 1500, cost: 1000, warranty_days: 365 });
const sprod = await R('crud.create', 'product', { name: 'Espresso Machine ' + t, mode: 'serial', price: 90000, cost: 60000 });
const sup = await R('crud.create', 'supplier', { name: 'Supp ' + t, mobile: '017' });
const cus = await R('crud.create', 'customer', { name: 'Cust ' + t, mobile: '018' + String(t).slice(-8), opening_balance: 500 });
const bankId = await R('crud.create', 'bank', { name: 'Eastern Bank', sort: 'EBL' });
const acc = await R('crud.create', 'bank_account', { bank_id: bankId.id, acno: '1111' + String(t).slice(-4), title: 'Main', opening_balance: 100000 });
ok(prod.id && sup.id && cus.id && acc.id, 'masters created');

const setup = await R('docs.docSetup', 'sale');
const cash = setup.money.find(m => m.kind === 'cash').id;
const bank = setup.money.find(m => m.kind === 'bank').id;

const pur = await R('docs.saveDoc', 'purchase', {
  supplier_id: sup.id,
  lines: [{ product_id: prod.id, qty: 10, rate: 1000, sale_price: 1600 }, { product_id: sprod.id, qty: 2, rate: 60000, serials: ['SN-A' + t, 'SN-B' + t] }],
  discount: 1000, vat_pct: 5, freight: 200, payments: [{ ledger_id: bank, amount: 50000 }],
});
console.log('purchase', pur);
const sale = await R('docs.saveDoc', 'sale', {
  customer_id: cus.id,
  lines: [{ product_id: prod.id, qty: 3, rate: 1600, disc_pct: 10 }, { product_id: sprod.id, qty: 1, rate: 90000, serials: ['SN-A' + t] }],
  discount: 500, vat_pct: 0, other: 100, other_name: 'Delivery', less: 20,
  payments: [{ ledger_id: cash, amount: 40000 }, { ledger_id: bank, amount: 10000, cheque_no: 'CHQ1', cheque_date: '2026-11-05' }],
});
console.log('sale', sale);
const d = await R('docs.getDoc', sale.id);
ok(d.lines.length === 2 && d.payments.length === 2, 'sale has lines and payments');
const src = await R('docs.returnSource', 'sreturn', sale.no);
const ret = await R('docs.saveDoc', 'sreturn', { ref_doc_id: sale.id, lines: [{ ref_line_id: src.lines[0].id, qty: 1 }], payments: [{ ledger_id: cash, amount: 500 }] });
console.log('return', ret);
const rec = await R('vouchers.saveVoucher', 'receipt', { lines: [{ dr: cash, cr: d.party.ledger_id, amount: 1000, less: 10, ref_doc_no: sale.no }] });
const pay = await R('vouchers.saveVoucher', 'payment', { lines: [{ dr: (await R('docs.partyInfo', 'supplier', sup.id)).ledger_id, cr: cash, amount: 2000 }] });
const exp = await R('vouchers.saveVoucher', 'expense', { source: cash, lines: [{ dr: (await R('crud.lookup', 'expense_head'))[0].value, amount: 300 }] });
const tr = await R('vouchers.saveVoucher', 'contra', { lines: [{ dr: cash, cr: bank, amount: 5000, charge: 10 }] });
const ed = await R('vouchers.voucherForEdit', rec.id);
ok(ed.lines[0].amount === 1000 && ed.lines[0].less === 10, 'receipt round-trips for edit');
await R('vouchers.saveVoucher', 'receipt', ed, rec.id);
const wh = await R('crud.create', 'warehouse', { name: 'WH ' + t });
await R('stock.saveStockDoc', 'transfer_b', { from: 'B:1', to: 'W:' + wh.id, lines: [{ product_id: prod.id, qty: 2 }] });
await R('stock.saveStockDoc', 'disposal', { from: 'B:1', recover: 100, lines: [{ product_id: prod.id, qty: 1 }] });
await R('stock.saveStockDoc', 'delivery', { doc_id: sale.id, lines: [{ doc_line_id: d.lines[0].id, qty: 1 }] });
const st = await R('stock.stockStatus', { scope: 'combined', q: 'Grinder ' + t });
console.log('stock', st.map(r => ({ bal: r.balance, sold: r.sold, sret: r.sreturn, del: r.delivered, undeli: r.undelivered })));
ok(st[0].balance === 10 - 3 + 1 - 1, 'grinder combined stock = 7');
const tb = await R('finance.trialBalance', undefined, undefined, 'ledger');
ok(Math.abs(tb.totals.debit - tb.totals.credit) < 0.01, `trial balance balanced (${tb.totals.debit} / ${tb.totals.credit})`);
const bs = await R('finance.balanceSheet');
ok(Math.abs(bs.totals.assets - bs.totals.liabilitiesEquity) < 0.01, `balance sheet balances (${bs.totals.assets} = ${bs.totals.liabilitiesEquity})`);
const list = await R('docs.listDocs', 'sale', {});
console.log('sale due', list.rows.find(r => r.id === sale.id).due);
// edit + delete
await R('docs.saveDoc', 'sale', { customer_id: cus.id, lines: [{ product_id: prod.id, qty: 4, rate: 1600 }], payments: [{ ledger_id: cash, amount: 6400 }] }, sale.id).catch(e => console.log('edit blocked (expected if returns exist):', e.message));
const cat_ = await R('reports.reportCatalog');
let failed = 0;
for (const r of cat_) {
  const params = { customer_id: cus.id, supplier_id: sup.id, product_id: prod.id, ledger_id: cash, service_id: undefined };
  try { await R('reports.runReport', r.key, r.key.includes('service_item') ? {} : params); }
  catch (e) { if (!/Select/.test(e.message)) { failed++; console.log('✗ report', r.key, e.message); } }
}
ok(failed === 0, `${cat_.length} reports ran`);
const dash = await R('admin.dashboard', {});
ok(dash.overview.sales > 0, 'dashboard has sales');
console.log('done in', Date.now() - t, 'ms');
