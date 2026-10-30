// Fills an empty Auralit database with ~45 days of believable trading for a coffee-equipment dealer,
// for demos and design reviews. It goes through the same RPC API as the app, so every figure is posted
// to the ledger exactly as real work would be.
//
// Usage: start the app on a fresh database (delete data/), then
//   node scripts/demo-data.mjs [baseUrl]          (default http://localhost:3000)
const BASE = process.argv[2] || 'http://localhost:3000';

const login = await fetch(BASE + '/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@auralit.local', password: 'admin123' }) });
if (!login.ok) throw new Error('Sign-in failed — is this a fresh database with the default admin?');
const cookie = login.headers.getSetCookie()[0].split(';')[0];
async function R(fn, ...args) {
  const r = await fetch(BASE + '/api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ fn, args }) });
  const j = await r.json();
  if (j.error) throw new Error(`${fn}: ${j.error}`);
  return j.result;
}

// deterministic randomness so every run produces the same books
let seed = 20261030;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

const existing = await R('crud.list', 'product', { size: 1 });
if (existing.total > 0) throw new Error('This database already has products. Run the demo on a fresh database.');

console.log('Company and settings…');
await R('admin.saveCompany', { name: 'Barista Garage', bname: 'বারিস্তা গ্যারেজ', slogan: 'Everything for the coffee bar', mobile: '01828-097777', email: 'hello@baristagarage.com.bd', web: 'https://baristagarage.com.bd', address: 'House 12, Road 7, Block C, Banani, Dhaka 1213', saddress: 'Banani, Dhaka · 01828-097777', tin: '1234-5678-9012', vat: '002797536-0103' });
await R('admin.saveSettings', { reward_enabled: 'yes', reward_spend: '1000', reward_point_value: '1' });

console.log('Masters…');
const id = async (key, row) => (await R('crud.create', key, row)).id;
const cats = {};
for (const c of ['Coffee Machines', 'Grinders', 'Coffee Beans', 'Syrups', 'Bar Accessories', 'Cups & Packaging', 'Machine Service']) cats[c] = await id('category', { name: c });
const brands = {};
for (const b of ['La Cimbali', 'Nuova Simonelli', 'Wega', 'Barico', 'Giffard', 'Long Beach', 'House Roast', 'Barware']) brands[b] = await id('brand', { name: b });
const units = Object.fromEntries((await R('crud.lookup', 'unit')).map(u => [u.label, u.value]));
const italy = (await R('crud.lookup', 'country')).find(c => c.label === 'Italy')?.value;

const P = [
  ['La Cimbali M26 BE 2-Group', 'Coffee Machines', 'La Cimbali', 'M26 BE DT/2', 'serial', 420000, 525000, 'Pcs', 365, 1, 'LCM'],
  ['Nuova Simonelli Appia Life 2-Group', 'Coffee Machines', 'Nuova Simonelli', 'Appia Life V2', 'serial', 295000, 368000, 'Pcs', 365, 1, 'NSA'],
  ['Wega Pegaso 1-Group', 'Coffee Machines', 'Wega', 'Pegaso EVD/1', 'serial', 168000, 214000, 'Pcs', 365, 1, 'WGP'],
  ['La Cimbali Magnum On Demand', 'Grinders', 'La Cimbali', 'Magnum OD', 'serial', 98000, 126000, 'Pcs', 365, 2, 'LMG'],
  ['Nuova Simonelli MDXS On Demand', 'Grinders', 'Nuova Simonelli', 'MDXS OD', 'serial', 72000, 92500, 'Pcs', 365, 2, 'MDX'],
  ['Barico BG-60 Grinder', 'Grinders', 'Barico', 'BG-60', 'serial', 31500, 42000, 'Pcs', 180, 2, 'BG6'],
  ['House Espresso Blend 1 kg', 'Coffee Beans', 'House Roast', 'HEB-1000', 'nonserial', 1350, 1850, 'Kg', 0, 25],
  ['Ethiopia Yirgacheffe 1 kg', 'Coffee Beans', 'House Roast', 'ETH-1000', 'nonserial', 2100, 2850, 'Kg', 0, 10],
  ['Colombia Supremo 1 kg', 'Coffee Beans', 'House Roast', 'COL-1000', 'nonserial', 1650, 2250, 'Kg', 0, 10],
  ['Giffard Vanilla Syrup 1 L', 'Syrups', 'Giffard', 'GF-VAN-1L', 'nonserial', 980, 1350, 'Pcs', 0, 12],
  ['Giffard Caramel Syrup 1 L', 'Syrups', 'Giffard', 'GF-CAR-1L', 'nonserial', 980, 1350, 'Pcs', 0, 12],
  ['Long Beach Hazelnut Syrup 750 ml', 'Syrups', 'Long Beach', 'LB-HAZ-750', 'nonserial', 690, 950, 'Pcs', 0, 12],
  ['Milk Pitcher 600 ml', 'Bar Accessories', 'Barware', 'MP-600', 'nonserial', 650, 1050, 'Pcs', 0, 8],
  ['Tamper 58 mm', 'Bar Accessories', 'Barware', 'TMP-58', 'nonserial', 1200, 1950, 'Pcs', 0, 6],
  ['Knock Box', 'Bar Accessories', 'Barware', 'KB-01', 'nonserial', 1450, 2300, 'Pcs', 0, 4],
  ['Cleaning Tablets (100)', 'Bar Accessories', 'Barware', 'CT-100', 'nonserial', 1100, 1650, 'Box', 0, 10],
  ['8 oz Paper Cup with Lid (50)', 'Cups & Packaging', 'Barware', 'PC-8-50', 'nonserial', 520, 780, 'Box', 0, 40],
  ['12 oz Ripple Cup with Lid (50)', 'Cups & Packaging', 'Barware', 'RC-12-50', 'nonserial', 760, 1120, 'Box', 0, 40],
];
const products = [];
for (const [name, cat, brand, model, mode, cost, price, unit, warranty, min, sp] of P) {
  const pid = await id('product', { name, category_id: cats[cat], brand_id: brands[brand], model, mode, cost, price, unit_id: units[unit] ?? units.Pcs, warranty_days: warranty, min_stock: min, country_id: cat.includes('Machine') || cat === 'Grinders' ? italy : undefined, status: 'active' });
  products.push({ id: pid, name, cat, mode, cost, price, sp, stock: 0, serials: [] });
}
const byName = n => products.find(p => p.name === n);
const services = [];
for (const [name, cost, price] of [['Espresso Machine Service', 800, 3500], ['Grinder Burr Replacement', 900, 2500], ['Installation & Setup', 1500, 5000], ['Barista Training (half day)', 2000, 8000]]) services.push({ id: await id('service', { name, cost, price, category_id: cats['Machine Service'] }), name, price, cost });

console.log('People and accounts…');
const desig = Object.fromEntries((await R('crud.lookup', 'designation')).map(d => [d.label, d.value]));
const dept = Object.fromEntries((await R('crud.lookup', 'department')).map(d => [d.label, d.value]));
const staff = [];
for (const [name, d, g, salary, comm] of [['Rahim Uddin', 'Sales & Marketing Department', 'Sales & Marketing Executive', 32000, 1], ['Nusrat Jahan', 'Sales & Marketing Department', 'Sales & Marketing Executive', 28000, 1], ['Tanvir Hasan', 'Training Department', 'Barista Trainer', 30000, 0], ['Farhana Akter', 'Administrative Department', 'Office Executive', 24000, 0], ['Arif Hossain', 'Logistics Department', 'Delivery Man', 16000, 0]]) {
  staff.push({ id: await id('employee', { name, department_id: dept[d], designation_id: desig[g], salary, commission_pct: comm, mobile: `017${int(10000000, 99999999)}`, joining: iso(day(-int(200, 900))), branch_id: 1 }), name });
}
const sellers = staff.slice(0, 2);

const ebl = await id('bank', { name: 'Eastern Bank PLC', sort: 'EBL' });
const cbl = await id('bank', { name: 'The City Bank PLC', sort: 'City' });
await id('bank_account', { bank_id: ebl, acno: '1101-2233-45', title: 'Barista Garage', branch: 'Banani', opening_balance: 850000 });
await id('bank_account', { bank_id: cbl, acno: '2209-4512-88', title: 'Barista Garage', branch: 'Gulshan', opening_balance: 420000 });
await id('mobile_account', { name: 'bKash Merchant', number: '01712-345678', opening_balance: 0 });
await id('mobile_account', { name: 'Nagad Merchant', number: '01815-334455', opening_balance: 0 });

const setup = await R('docs.docSetup', 'sale');
const CASH = setup.money.find(m => m.kind === 'cash' && m.label === 'Cash').id;
const PETTY = setup.money.find(m => m.label === 'Petty Cash').id;
const EBL = setup.money.find(m => m.label.startsWith('EBL')).id;
const CITY = setup.money.find(m => m.label.startsWith('City')).id;
const BKASH = setup.money.find(m => m.label.startsWith('bKash')).id;
const NAGAD = setup.money.find(m => m.label.startsWith('Nagad')).id;

const groups = Object.fromEntries((await R('crud.lookup', 'client_group')).map(g => [g.label, g.value]));
const corporate = await id('client_group', { name: 'Café chains' });
const districts = Object.fromEntries((await R('crud.lookup', 'district')).map(d => [d.label, d.value]));
const zoneIds = {};
for (const [z, d] of [['Banani', 'Dhaka'], ['Gulshan', 'Dhaka'], ['Dhanmondi', 'Dhaka'], ['Uttara', 'Dhaka'], ['Mirpur', 'Dhaka'], ['Motijheel', 'Dhaka'], ['Agrabad', 'Chattogram'], ['Zindabazar', 'Sylhet']]) zoneIds[z] = await id('zone', { name: z, district_id: districts[d] });

const customers = [];
for (const [name, zone, chain, limit] of [
  ['Banani Brew House', 'Banani', true, 300000], ['Dhanmondi Bean Bar', 'Dhanmondi', false, 150000], ['Uttara Espresso Co.', 'Uttara', true, 400000],
  ['Gulshan Roast Lab', 'Gulshan', true, 500000], ['Bailey Road Café', 'Motijheel', false, 80000], ['Mirpur Coffee Corner', 'Mirpur', false, 60000],
  ['Agrabad Harbour Café', 'Agrabad', false, 120000], ['Zindabazar Tea & Coffee', 'Zindabazar', false, 90000], ['Lalmatia Little Café', 'Dhanmondi', false, 50000],
  ['Motijheel Morning Brew', 'Motijheel', false, 70000], ['Gulshan Avenue Kitchen', 'Gulshan', false, 150000], ['Uttara Sector 7 Bakery', 'Uttara', false, 60000],
]) {
  const d = zone === 'Agrabad' ? 'Chattogram' : zone === 'Zindabazar' ? 'Sylhet' : 'Dhaka';
  const cid = await id('customer', { name, mobile: `01${pick(['7', '8', '9', '6', '5'])}${int(10000000, 99999999)}`, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/\.$/, '')}@gmail.com`, district_id: districts[d], zone_id: zoneIds[zone], group_id: chain ? corporate : groups.General, address: `${zone}, ${d}`, credit_limit: limit, get_reward: chain ? 0 : 1, status: 'active' });
  customers.push({ id: cid, name, chain });
}
const cusInfo = async c => R('docs.partyInfo', 'customer', c.id);

const suppliers = {};
for (const [name, mobile] of [['Gemini Coffee Imports', '01711-200300'], ['Bengal Roasters Ltd', '01819-445566'], ['Syrup House Dhaka', '01755-778899'], ['Prime Packaging BD', '01913-112233'], ['Metro Barware Supply', '01670-998877']]) suppliers[name] = await id('supplier', { name, mobile, address: 'Dhaka', status: 'active' });
const openingSupplier = (await R('crud.lookup', 'supplier')).find(s => String(s.label).includes('Opening Stock')).value;
const supplierFor = p => (p.cat === 'Coffee Machines' || p.cat === 'Grinders' ? suppliers['Gemini Coffee Imports'] : p.cat === 'Coffee Beans' ? suppliers['Bengal Roasters Ltd'] : p.cat === 'Syrups' ? suppliers['Syrup House Dhaka'] : p.cat === 'Cups & Packaging' ? suppliers['Prime Packaging BD'] : suppliers['Metro Barware Supply']);

const capital = (await R('crud.lookup', 'ledger')).find(l => /Capital$/.test(l.label)).value;
await R('vouchers.saveVoucher', 'journal', { date: iso(day(-46)), note: 'Owner capital introduced as cash', lines: [{ dr: CASH, cr: capital, amount: 150000 }] });

// ───────── stock ─────────
let serialNo = 1;
const buyLines = (list, date) => list.map(([p, qty]) => {
  const line = { product_id: p.id, qty, rate: p.cost, sale_price: p.price };
  if (p.mode === 'serial') { line.serials = Array.from({ length: qty }, () => `${p.sp}${String(date).slice(2, 4)}${String(serialNo++).padStart(5, '0')}`); p.serials.push(...line.serials); }
  p.stock += qty;
  return line;
});
console.log('Opening stock…');
await R('docs.saveDoc', 'purchase', {
  date: iso(day(-45)), supplier_id: openingSupplier, note: 'Opening stock count',
  lines: buyLines(products.map(p => [p, p.cat === 'Coffee Machines' ? 3 : p.cat === 'Grinders' ? 5 : p.cat === 'Coffee Beans' ? 60 : p.cat === 'Cups & Packaging' ? 150 : p.cat === 'Syrups' ? 36 : 15]), '2026'),
});

const expenseHeads = Object.fromEntries((await R('crud.lookup', 'expense_head')).map(h => [String(h.label).replace(/^[\d-]+ - /, ''), h.value]));
const head = n => expenseHeads[n] ?? Object.entries(expenseHeads).find(([k]) => k.includes(n))?.[1];

// ───────── daily trading ─────────
const consumables = products.filter(p => !['Coffee Machines', 'Grinders'].includes(p.cat));
const due = new Map(); // customer id → open invoices [{no, due}]
let invoices = 0, receipts = 0;
for (let n = -44; n <= 0; n++) {
  const d = day(n), date = iso(d), dow = d.getDay(); // 5 = Friday (weekend)
  if (dow === 5 && n !== 0) continue; // Friday is the weekend, but keep today so the demo has a live day
  const count = dow === 6 ? int(1, 3) : int(3, 6);

  // restock consumables from suppliers when they run low
  const low = consumables.filter(p => p.stock < (p.cat === 'Cups & Packaging' ? 60 : p.cat === 'Coffee Beans' ? 25 : 10));
  const bySup = new Map();
  for (const p of low) { const s = supplierFor(p); bySup.set(s, [...(bySup.get(s) ?? []), p]); }
  for (const [sid, list] of bySup) {
    const lines = buyLines(list.map(p => [p, p.cat === 'Cups & Packaging' ? 120 : p.cat === 'Coffee Beans' ? 50 : 24]), date);
    const total = lines.reduce((a, l) => a + l.qty * l.rate, 0);
    await R('docs.saveDoc', 'purchase', { date, supplier_id: sid, lines, payments: rnd() < 0.5 ? [{ ledger_id: EBL, amount: Math.round(total * 0.5) }] : [] });
  }
  for (const p of products.filter(p => p.mode === 'serial' && p.stock < 1)) {
    await R('docs.saveDoc', 'purchase', { date, supplier_id: suppliers['Gemini Coffee Imports'], lines: buyLines([[p, p.cat === 'Grinders' ? 4 : 2]], date) });
  }

  for (let k = 0; k < count; k++) {
    const walkin = rnd() < 0.35;
    const cus = walkin ? null : pick(customers);
    const lines = [];
    const nLines = int(1, 4);
    for (let i = 0; i < nLines; i++) {
      const p = pick(consumables);
      if (lines.some(l => l.product_id === p.id)) continue;
      const qty = Math.min(p.stock, p.cat === 'Cups & Packaging' ? int(2, 10) : p.cat === 'Coffee Beans' ? int(2, 8) : int(1, 4));
      if (qty <= 0) continue;
      p.stock -= qty;
      lines.push({ product_id: p.id, qty, rate: p.price, disc_pct: !walkin && rnd() < 0.25 ? 5 : 0 });
    }
    // equipment: a grinder every few days, a machine about weekly, to café customers only
    if (cus && rnd() < (k === 0 ? 0.32 : 0.06)) {
      const eq = pick(products.filter(p => p.mode === 'serial' && p.stock > 0 && (rnd() < 0.35 ? p.cat === 'Coffee Machines' : p.cat === 'Grinders')));
      if (eq) { const s = eq.serials.shift(); eq.stock -= 1; lines.push({ product_id: eq.id, qty: 1, rate: eq.price, serials: [s], disc_pct: rnd() < 0.5 ? 3 : 0 }); }
    }
    if (!lines.length) continue;
    const gross = lines.reduce((a, l) => a + l.qty * l.rate * (1 - (l.disc_pct ?? 0) / 100), 0);
    const total = Math.round(gross);
    let payments;
    if (walkin) payments = [{ ledger_id: pick([CASH, CASH, BKASH, NAGAD]), amount: total }];
    else {
      const r = rnd();
      if (r < 0.45) payments = [{ ledger_id: total > 60000 ? pick([EBL, CITY]) : pick([CASH, BKASH]), amount: total }];
      else if (r < 0.8) payments = [{ ledger_id: total > 60000 ? EBL : CASH, amount: Math.round(total * pick([0.3, 0.5, 0.6]) / 100) * 100, ...(total > 60000 && rnd() < 0.4 ? { cheque_no: `CHQ${int(100000, 999999)}`, cheque_date: iso(day(n + int(2, 10))) } : {}) }];
      else payments = [];
    }
    const res = await R('docs.saveDoc', 'sale', {
      date, customer_id: cus?.id, walkin: walkin ? { name: pick(['Walk-in Customer', 'Mr. Kamal', 'Ms. Sadia', 'Mr. Hasan']), mobile: `01${int(700000000, 999999999)}` } : undefined,
      sales_person_id: pick(sellers).id, lines, payments,
    });
    invoices++;
    const paid = payments.reduce((a, p) => a + p.amount, 0);
    if (cus && res.total - paid > 0) due.set(cus.id, [...(due.get(cus.id) ?? []), { no: res.no, due: res.total - paid }]);
  }

  // service work most days
  if (rnd() < 0.45) {
    const cus = pick(customers);
    const s = pick(services);
    await R('docs.saveDoc', 'service', { date, customer_id: cus.id, sales_person_id: staff[2].id, lines: [{ service_id: s.id, qty: 1, rate: s.price, cost: s.cost }], payments: [{ ledger_id: pick([CASH, BKASH]), amount: s.price }] });
  }

  // collections against open invoices
  if (rnd() < 0.55 && due.size) {
    const [cid, list] = pick([...due.entries()]);
    const inv = list[0];
    const info = await cusInfo({ id: cid });
    const amount = Math.min(inv.due, Math.round(inv.due * pick([0.5, 1, 1]) / 100) * 100 || inv.due);
    await R('vouchers.saveVoucher', 'receipt', { date, lines: [{ dr: amount > 50000 ? EBL : pick([CASH, BKASH]), cr: info.ledger_id, amount, ref_doc_no: inv.no }] });
    receipts++;
    inv.due -= amount;
    if (inv.due <= 0) list.shift();
    if (!list.length) due.delete(cid);
  }

  // running costs
  if (rnd() < 0.7) await R('vouchers.saveVoucher', 'expense', { date, source: PETTY, lines: [{ dr: head('Conveyances'), amount: int(3, 9) * 100, ref: pick(['Delivery to Gulshan', 'CNG to Uttara', 'Rickshaw, bank run']) }] });
  if (rnd() < 0.5) await R('vouchers.saveVoucher', 'expense', { date, source: PETTY, lines: [{ dr: head('Food, Lunch & Entertainments'), amount: int(6, 14) * 100, ref: 'Staff lunch' }] });
  if (dow === 0) await R('vouchers.saveVoucher', 'contra', { date, note: 'Petty cash top-up', lines: [{ dr: PETTY, cr: CASH, amount: 10000 }] });
  if (d.getDate() === 1) {
    await R('vouchers.saveVoucher', 'expense', { date, source: EBL, note: 'Monthly fixed costs', lines: [{ dr: head('Office Rent'), amount: 65000, ref: 'Showroom rent' }, { dr: head('Internet & IT Expenses'), amount: 3000, ref: 'Fibre line' }] });
  }
  if (d.getDate() === 10) await R('vouchers.saveVoucher', 'expense', { date, source: CASH, lines: [{ dr: head('Electricity Bills'), amount: int(78, 96) * 100, ref: 'DESCO bill' }] });
  if (dow === 2 && n < -3) await R('vouchers.saveVoucher', 'payment', { date, lines: [{ dr: (await R('docs.partyInfo', 'supplier', pick(Object.values(suppliers)))).ledger_id, cr: EBL, amount: int(20, 60) * 1000 }] });
}

console.log('Open estimates, a purchase order and enquiries…');
await R('docs.saveDoc', 'estimate', { date: iso(day(-2)), customer_id: customers[3].id, sales_person_id: sellers[0].id, lines: [{ product_id: byName('La Cimbali M26 BE 2-Group').id, qty: 1, rate: 525000, disc_pct: 4 }, { product_id: byName('La Cimbali Magnum On Demand').id, qty: 2, rate: 126000 }], note: 'New outlet at Gulshan 2 — quote valid 15 days' });
await R('docs.saveDoc', 'estimate', { date: iso(day(-1)), customer_id: customers[6].id, sales_person_id: sellers[1].id, lines: [{ product_id: byName('Wega Pegaso 1-Group').id, qty: 1, rate: 214000 }, { product_id: byName('Barico BG-60 Grinder').id, qty: 1, rate: 42000 }] });
await R('docs.saveDoc', 'porder', { date: iso(day(-1)), supplier_id: suppliers['Gemini Coffee Imports'], lines: [{ product_id: byName('La Cimbali M26 BE 2-Group').id, qty: 2, rate: 420000, expected_qty: 2 }, { product_id: byName('La Cimbali Magnum On Demand').id, qty: 4, rate: 98000, expected_qty: 4 }], note: 'For the Gulshan Roast Lab quote' });
const sources = Object.fromEntries((await R('crud.lookup', 'enquiry_source')).map(s => [s.label, s.value]));
const types = Object.fromEntries((await R('crud.lookup', 'enquiry_type')).map(s => [s.label, s.value]));
const actions = Object.fromEntries((await R('crud.lookup', 'enquiry_action')).map(s => [s.label, s.value]));
for (const [name, product, src, when] of [['Sadia Rahman', 'Nuova Simonelli Appia Life 2-Group', 'Face Book', 0], ['Imran Chowdhury', 'Barico BG-60 Grinder', 'Walking Customer', -1], ['Rafiq Ahmed', 'Wega Pegaso 1-Group', 'Phone Call', 2]]) {
  await R('ops.saveEnquiry', { customer_name: name, mobile: `017${int(10000000, 99999999)}`, product_name: product, location: 'Gulshan', type_id: types['Cash Purchase'], source_id: sources[src], action_id: actions['Under Follow-up'], next_followup: iso(day(when)), ppdate: iso(day(when + 7)), date: iso(day(-5)), remarks: 'Opening a new café; wants a demo' });
}

const summary = await R('admin.dashboard', {});
console.log(`Done: ${invoices} sales invoices, ${receipts} receipts. Today's sales ৳${summary.today.sales}, receivable ৳${summary.receivable}.`);
