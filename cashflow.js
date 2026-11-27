// ==================== CASH FLOW + EXPENSE RECEIPTS ====================
// Plain JavaScript (no JSX build step needed). Loaded after data.js and before app.js.
// Everything here is only *called* at render time, so it can freely use helpers that
// app.js defines (pad2, monthLabel, fmtMoney, sumBy, MonthPicker, ...).
//
// 2026 data model (mirrors "PV-Awkaf Cash Flow Dashboard 2026.xlsx" → Transactions):
//   readings      → "Tenant Invoice (Solar Energy)" rows (one per subscriber per month)
//   otherIncome   → "Arrears / Prior Period Collection" and "Other Income" rows
//   expenses      → every Expense row except transfers to LASeR
//   transfers     → "Transfer to LASeR Association" rows
//   advances      → "Advance" rows (cash advances / custody, negative = returned)

const CF_h = React.createElement;

const CF_EXPENSE_CATEGORIES = [
  "Diesel/Fuel", "Maintenance", "Electricity/Energy", "Salaries", "Internet", "Purchases",
  "Transportation", "Office Expenses", "Debt Repayment", "Other/Settlements",
];
const CF_ENTRY_TYPES = [
  { id: "expense", label: "Expense", list: "expenses" },
  { id: "transfer", label: "Transfer to LASeR Association", list: "transfers" },
  { id: "advance", label: "Advance", list: "advances" },
];
const CF_PAY_METHODS = ["Cash", "Bank Transfer", "Check", "Other"];
const CF_MAX_RECEIPT_BYTES = 15 * 1024 * 1024;

// ---------- period helpers ----------
function cfPeriodPrefix(year, month) {
  if (year === "all") return "";
  if (month === "all" || month === undefined) return String(year);
  return year + "-" + pad2(month);
}
function cfInPeriod(list, year, month) {
  const p = cfPeriodPrefix(year, month);
  return (list || []).filter(x => x.date && x.date.startsWith(p));
}
function cfIsArrears(item) {
  return (item.category || "").indexOf("Arrears") === 0;
}
function cfIsDiesel(e) {
  return e.label === "Diesel $" || e.label === "Diesel/Fuel";
}

// Single source of truth for every money figure on the dashboard.
// For a single month, "unpaid" is that month's outstanding invoices (Monthly Summary sheet);
// for a year / all years it is net of arrears collected later (Dashboard sheet KPI).
function periodFinance(data, year, month) {
  const aggregate = year === "all" || month === "all" || month === undefined;
  const readings = cfInPeriod(data.readings, year, month);
  const adj = (data.incomeAdjustments || []).filter(a =>
    year === "all" || (a.year === year && (month === "all" || month === undefined || a.month === month)));
  const other = cfInPeriod(data.otherIncome, year, month);
  const paidInvoices = sumBy(readings.filter(r => r.paid === "Paid"), r => r.total);
  const invoiced = sumBy(readings, r => r.total);
  const grossUnpaid = sumBy(readings.filter(r => r.paid !== "Paid"), r => r.total) + sumBy(adj, a => a.unpaid);
  const otherIncome = sumBy(other, x => x.amount);
  const arrearsCollected = sumBy(other.filter(cfIsArrears), x => x.amount);
  const collected = paidInvoices + sumBy(adj, a => a.paid) + otherIncome;
  const expenses = sumBy(cfInPeriod(data.expenses, year, month), e => e.amount);
  const transfers = sumBy(cfInPeriod(data.transfers, year, month), e => e.amount);
  const advances = sumBy(cfInPeriod(data.advances, year, month), e => e.amount);
  return {
    invoiceCount: readings.length,
    invoiced,
    paidInvoices,
    otherIncome,
    arrearsCollected,
    collected,
    unpaid: grossUnpaid - (aggregate ? arrearsCollected : 0),
    expenses,
    transfers,
    advances,
    net: collected - expenses,
    cash: collected - expenses - transfers - advances,
  };
}

// Rows of the dashboard's "Totals by Year" table (keys are periodFinance() fields).
const YEARLY_METRICS = [
  { key: "paidInvoices", label: "Paid Amount (Invoices)" },
  { key: "otherIncome", label: "Arrears & Other Income" },
  { key: "collected", label: "Total Collected" },
  { key: "unpaid", label: "Unpaid (net of arrears)" },
  { key: "expenses", label: "Expenses" },
  { key: "net", label: "Net (Collected − Expenses)" },
  { key: "transfers", label: "Handed Over to LASeR" },
  { key: "advances", label: "Advance" },
  { key: "cash", label: "Cash Movement" },
];

// Latest {year, month} that has rows in the given lists (used for sensible default months).
function cfLatestMonth(data, lists) {
  let best = "";
  (lists || ["readings"]).forEach(k => (data[k] || []).forEach(x => { if (x.date && x.date > best) best = x.date; }));
  if (!best) { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1 }; }
  return { year: Number(best.slice(0, 4)), month: Number(best.slice(5, 7)) };
}
function cfNextMonth(ym) {
  return ym.month === 12 ? { year: ym.year + 1, month: 1 } : { year: ym.year, month: ym.month + 1 };
}

// ---------- receipt storage (IndexedDB, persists in this browser) ----------
// FIREBASE: swap these four functions for Firebase Storage uploads + a Firestore
// "receipts" collection ({ entryId, name, type, size, uploadedAt, url }).
const CF_DB_NAME = "meter224-receipts";
let cfDbPromise = null;
function cfOpenDb() {
  if (cfDbPromise) return cfDbPromise;
  cfDbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("This browser does not support file storage (IndexedDB).")); return; }
    const req = indexedDB.open(CF_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("receipts")) {
        const st = db.createObjectStore("receipts", { keyPath: "id" });
        st.createIndex("entryId", "entryId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  cfDbPromise.catch(() => { cfDbPromise = null; });
  return cfDbPromise;
}
function cfTx(mode, fn) {
  return cfOpenDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction("receipts", mode);
    const st = tx.objectStore("receipts");
    let result;
    const r = fn(st);
    if (r) r.onsuccess = () => { result = r.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
  }));
}

// Shared in-memory cache so every component sees the same receipts.
const cfReceipts = { loaded: false, loading: null, items: [], error: "", listeners: new Set() };
function cfNotify() { cfReceipts.listeners.forEach(fn => fn()); }
function cfToItem(rec) {
  return { ...rec, url: URL.createObjectURL(new Blob([rec.data], { type: rec.type || "application/octet-stream" })) };
}
function cfLoadReceipts() {
  if (cfReceipts.loaded) return Promise.resolve();
  if (cfReceipts.loading) return cfReceipts.loading;
  cfReceipts.loading = cfTx("readonly", st => st.getAll())
    .then(rows => {
      cfReceipts.items = (rows || []).map(cfToItem);
      cfReceipts.loaded = true;
      cfNotify();
    })
    .catch(err => { cfReceipts.error = String(err && err.message || err); cfReceipts.loaded = true; cfNotify(); });
  return cfReceipts.loading;
}
function cfReadFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsArrayBuffer(file);
  });
}
async function uploadReceipts(entryId, fileList) {
  const files = Array.from(fileList || []);
  const rejected = [];
  for (const file of files) {
    const okType = /^image\//.test(file.type) || file.type === "application/pdf";
    if (!okType) { rejected.push(file.name + " (only images or PDF)"); continue; }
    if (file.size > CF_MAX_RECEIPT_BYTES) { rejected.push(file.name + " (larger than 15 MB)"); continue; }
    const rec = {
      id: entryId + "::" + Date.now() + "::" + Math.random().toString(36).slice(2, 8),
      entryId,
      name: file.name,
      type: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      data: await cfReadFile(file),
    };
    await cfTx("readwrite", st => st.put(rec));
    cfReceipts.items = [...cfReceipts.items, cfToItem(rec)];
    cfNotify();
  }
  return rejected;
}
async function deleteReceipt(id) {
  await cfTx("readwrite", st => st.delete(id));
  const gone = cfReceipts.items.find(r => r.id === id);
  if (gone) URL.revokeObjectURL(gone.url);
  cfReceipts.items = cfReceipts.items.filter(r => r.id !== id);
  cfNotify();
}

function useReceipts() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    cfReceipts.listeners.add(fn);
    cfLoadReceipts();
    return () => { cfReceipts.listeners.delete(fn); };
  }, []);
  const byEntry = {};
  cfReceipts.items.forEach(r => { (byEntry[r.entryId] = byEntry[r.entryId] || []).push(r); });
  return { loaded: cfReceipts.loaded, error: cfReceipts.error, byEntry, all: cfReceipts.items };
}

function cfFmtSize(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}
function cfSafeName(s) {
  return String(s || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 60);
}

async function downloadReceiptsZip(entries, receiptsByEntry, zipName) {
  const zip = new JSZip();
  let count = 0;
  entries.forEach(e => {
    (receiptsByEntry[e.id] || []).forEach((r, i) => {
      const base = [e.date, cfSafeName(e.label || e.category || "Entry"), "$" + e.amount].join("_");
      zip.file(base + (i ? "_" + (i + 1) : "") + "_" + cfSafeName(r.name), r.data);
      count++;
    });
  });
  if (!count) return 0;
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipName);
  return count;
}

// ---------- receipt UI ----------
function ReceiptCell({ entryId, receipts }) {
  const inputRef = React.useRef(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const list = receipts || [];

  async function onPick(e) {
    const files = e.target.files;
    if (!files || !files.length) return;
    setBusy(true); setMsg("");
    try {
      const rejected = await uploadReceipts(entryId, files);
      if (rejected.length) setMsg("Skipped: " + rejected.join(", "));
    } catch (err) {
      setMsg("Upload failed: " + (err && err.message || err));
    }
    setBusy(false);
    e.target.value = "";
  }
  async function onRemove(r) {
    if (!window.confirm('Remove receipt "' + r.name + '"?')) return;
    try { await deleteReceipt(r.id); } catch (err) { setMsg("Delete failed: " + (err && err.message || err)); }
  }

  return CF_h("div", { className: "receipt-cell" },
    list.map(r => CF_h("span", { key: r.id, className: "receipt-chip", title: r.name + " · " + cfFmtSize(r.size) + " · uploaded " + r.uploadedAt.slice(0, 10) },
      CF_h("a", { href: r.url, target: "_blank", rel: "noopener" }, (r.type === "application/pdf" ? "PDF · " : "IMG · ") + r.name),
      CF_h("button", { type: "button", className: "receipt-x", onClick: () => onRemove(r), "aria-label": "Remove receipt " + r.name }, "×")
    )),
    CF_h("button", { type: "button", className: "btn btn-sm receipt-add", disabled: busy, onClick: () => inputRef.current && inputRef.current.click() },
      busy ? "Uploading…" : (list.length ? "+ Add" : "Upload receipt")),
    CF_h("input", { ref: inputRef, type: "file", accept: "image/*,application/pdf", multiple: true, style: { display: "none" }, onChange: onPick }),
    msg && CF_h("div", { className: "receipt-msg" }, msg)
  );
}

// ---------- dashboard add-ons ----------
function CashflowKpis({ data, year, month }) {
  const f = periodFinance(data, year, month);
  const aggregate = year === "all" || month === "all";
  const card = (accent, label, value, hint) => CF_h("div", { className: "kpi-card " + accent, key: label },
    CF_h("div", { className: "kpi-label" }, label),
    CF_h("div", { className: "kpi-value" }, fmtMoney(value)),
    hint && CF_h("div", { className: "kpi-hint" }, hint),
    CF_h("div", { className: "kpi-bar" }));
  return CF_h("div", { className: "kpi-grid cf-kpis" },
    card("accent-teal", "Paid Amount (Invoices)", f.paidInvoices),
    card("accent-teal", "Arrears & Other Income", f.otherIncome),
    card("accent-rust", "Unpaid / Outstanding", f.unpaid, aggregate ? "net of arrears collected" : "this month's invoices"),
    card("accent-ink", "Handed Over to LASeR", f.transfers),
    card("accent-ink", "Advance", f.advances),
    card("accent-filament", "Cash Movement", f.cash, "collected − expenses − LASeR − advance")
  );
}

function OtherIncomePanel({ data, year, month }) {
  const rows = cfInPeriod(data.otherIncome, year, month).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  if (!rows.length) return null;
  return CF_h("div", { className: "panel-card", style: { marginBottom: 24 } },
    CF_h("h3", null, CF_h("span", { className: "eyebrow-dot" }), "Arrears & Other Income"),
    CF_h("div", { className: "table-wrap" },
      CF_h("table", { className: "data-table" },
        CF_h("thead", null, CF_h("tr", null,
          CF_h("th", null, "Date"), CF_h("th", null, "Category"), CF_h("th", null, "Description"),
          CF_h("th", { className: "num" }, "Amount"), CF_h("th", null, "Notes"))),
        CF_h("tbody", null, rows.map(r => CF_h("tr", { key: r.id },
          CF_h("td", { className: "mono" }, r.date),
          CF_h("td", null, r.category),
          CF_h("td", { style: { whiteSpace: "normal" } }, r.description),
          CF_h("td", { className: "num" }, fmtMoney2(r.amount)),
          CF_h("td", { style: { whiteSpace: "normal", fontSize: 12, color: "var(--slate)" } }, r.notes)
        ))),
        CF_h("tfoot", null, CF_h("tr", null,
          CF_h("td", { colSpan: 3, style: { fontWeight: 700 } }, "Total"),
          CF_h("td", { className: "num", style: { fontWeight: 700 } }, fmtMoney2(sumBy(rows, r => r.amount))),
          CF_h("td", null)))
      )
    )
  );
}

// ==================== EXPENSES VIEW ====================
function ExpensesView({ data, store }) {
  const initial = React.useMemo(() => cfLatestMonth(data, ["expenses"]), []);
  const [year, setYear] = React.useState(initial.year);
  const [month, setMonth] = React.useState(initial.month);
  const blankForm = { type: "expense", label: CF_EXPENSE_CATEGORIES[0], description: "", amount: "", status: "Paid", payMethod: "Cash", day: "1", notes: "" };
  const [form, setForm] = React.useState(blankForm);
  const [formFiles, setFormFiles] = React.useState([]);
  const [fileInputKey, setFileInputKey] = React.useState(0);
  const [toast, setToast] = React.useState("");
  const [genForm, setGenForm] = React.useState({ hours: "", liters: "", notes: "" });
  const rc = useReceipts();

  const monthExpenses = React.useMemo(() => cfInPeriod(data.expenses, year, month), [data, year, month]);
  const monthMoves = React.useMemo(() => [
    ...cfInPeriod(data.transfers, year, month).map(t => ({ ...t, label: "Transfer to LASeR Association" })),
    ...cfInPeriod(data.advances, year, month).map(a => ({ ...a, label: "Advance" })),
  ].sort((a, b) => a.date < b.date ? -1 : 1), [data, year, month]);
  const total = sumBy(monthExpenses, e => e.amount);
  const yearTotal = React.useMemo(() => sumBy(cfInPeriod(data.expenses, year, "all"), e => e.amount), [data, year]);
  const allMonthEntries = [...monthExpenses, ...monthMoves];
  const withReceipt = allMonthEntries.filter(e => (rc.byEntry[e.id] || []).length > 0).length;

  const currentGenLog = React.useMemo(() => data.generatorLogs.find(g => g.year === year && g.month === month), [data, year, month]);
  const yearGenLogs = React.useMemo(() => data.generatorLogs.filter(g => g.year === year), [data, year]);
  const yearGenHours = sumBy(yearGenLogs, g => g.hours || 0);
  const yearGenPossibleHours = sumBy(yearGenLogs, g => daysInMonth(g.year, g.month) * 24);
  const yearGenRate = yearGenPossibleHours > 0 ? Math.round((yearGenHours / yearGenPossibleHours) * 100) : 0;

  React.useEffect(() => {
    setGenForm({
      hours: currentGenLog && currentGenLog.hours !== undefined ? String(currentGenLog.hours) : "",
      liters: currentGenLog && currentGenLog.liters !== undefined ? String(currentGenLog.liters) : "",
      notes: currentGenLog ? (currentGenLog.notes || "") : "",
    });
  }, [year, month, currentGenLog]);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(""), 2500); }

  async function submitForm(e) {
    e.preventDefault();
    if (form.amount === "" || isNaN(form.amount)) return;
    const t = CF_ENTRY_TYPES.find(x => x.id === form.type);
    const day = Math.min(Math.max(1, Number(form.day) || 1), daysInMonth(year, month));
    const id = t.id.slice(0, 3) + "-" + Date.now();
    const entry = {
      id,
      date: year + "-" + pad2(month) + "-" + pad2(day),
      description: form.description,
      amount: Number(form.amount),
      status: form.status,
      payMethod: form.payMethod,
      notes: form.notes,
    };
    if (t.id === "expense") entry.label = form.label;
    store.addEntry(t.list, entry);
    let note = "Saved";
    if (formFiles.length) {
      try {
        const rejected = await uploadReceipts(id, formFiles);
        note = rejected.length ? "Saved — skipped: " + rejected.join(", ") : "Saved with " + formFiles.length + " receipt(s)";
      } catch (err) { note = "Saved, but receipt upload failed: " + (err && err.message || err); }
    }
    setForm(f => ({ ...blankForm, type: f.type, label: f.label }));
    setFormFiles([]);
    setFileInputKey(k => k + 1);
    flash(note);
  }

  function submitGenForm(e) {
    e.preventDefault();
    if (genForm.hours === "" && genForm.liters === "") return;
    store.setGeneratorLog(year, month, {
      hours: genForm.hours === "" ? 0 : Number(genForm.hours),
      liters: genForm.liters === "" ? 0 : Number(genForm.liters),
      notes: genForm.notes,
    });
  }

  async function downloadZip() {
    const n = await downloadReceiptsZip(allMonthEntries, rc.byEntry, "Receipts_" + year + "-" + pad2(month) + ".zip");
    if (!n) flash("No receipts uploaded for this month yet");
  }
  function exportMonth() {
    const rowsOut = allMonthEntries.map(e => ({
      Date: e.date,
      Type: e.label === "Transfer to LASeR Association" || e.label === "Advance" ? e.label : "Expense",
      Category: e.label,
      Description: e.description || "",
      "Amount ($)": e.amount,
      Status: e.status || "",
      "Payment Method": e.payMethod || "",
      Notes: e.notes || "",
      Receipt: (rc.byEntry[e.id] || []).map(r => r.name).join(", "),
    }));
    exportToExcel(rowsOut, "Expenses_" + year + "-" + pad2(month) + ".xlsx", "Expenses");
  }

  const setF = (k) => (e) => { const v = e.target.value; setForm(f => ({ ...f, [k]: v })); };
  const field = (label, control) => CF_h("div", { className: "form-field" }, CF_h("label", null, label), control);

  const entryTable = (rows, showCategory) => CF_h("div", { className: "table-wrap" },
    CF_h("table", { className: "data-table" },
      CF_h("thead", null, CF_h("tr", null,
        CF_h("th", null, "Date"), CF_h("th", null, showCategory ? "Category" : "Type"), CF_h("th", null, "Description"),
        CF_h("th", { className: "num" }, "Amount"), CF_h("th", null, "Status"), CF_h("th", null, "Notes"), CF_h("th", null, "Receipt"))),
      CF_h("tbody", null, rows.map(e => CF_h("tr", { key: e.id },
        CF_h("td", { className: "mono" }, e.date),
        CF_h("td", null, e.label),
        CF_h("td", { style: { whiteSpace: "normal" } }, e.description || ""),
        CF_h("td", { className: "num" }, fmtMoney2(e.amount)),
        CF_h("td", null, e.status ? CF_h("span", { className: "badge " + (e.status === "Paid" ? "paid" : "unpaid") }, e.status) : ""),
        CF_h("td", { style: { whiteSpace: "normal", fontSize: 12, color: "var(--slate)", maxWidth: 260 } }, e.notes || ""),
        CF_h("td", null, CF_h(ReceiptCell, { entryId: e.id, receipts: rc.byEntry[e.id] }))
      )))
    ));

  return CF_h("div", null,
    CF_h("div", { className: "page-header" },
      CF_h("div", null,
        CF_h("div", { className: "page-eyebrow" }, "EXPENSES"),
        CF_h("div", { className: "page-title" }, "Monthly Expenses"),
        CF_h("div", { className: "page-desc" }, "Expenses, transfers to LASeR, advances, generator hours — and the scanned receipt for each entry")),
      CF_h(MonthPicker, { year, month, setYear, setMonth })),

    CF_h("div", { className: "kpi-grid", style: { gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" } },
      CF_h("div", { className: "kpi-card accent-rust" },
        CF_h("div", { className: "kpi-label" }, "Expenses " + monthLabel(year, month)),
        CF_h("div", { className: "kpi-value" }, fmtMoney(total)), CF_h("div", { className: "kpi-bar" })),
      CF_h("div", { className: "kpi-card accent-ink" },
        CF_h("div", { className: "kpi-label" }, "Total Expenses for " + year),
        CF_h("div", { className: "kpi-value" }, fmtMoney(yearTotal)), CF_h("div", { className: "kpi-bar" })),
      CF_h("div", { className: "kpi-card accent-teal" },
        CF_h("div", { className: "kpi-label" }, "Receipts Attached " + monthLabel(year, month)),
        CF_h("div", { className: "kpi-value" }, withReceipt + " / " + allMonthEntries.length), CF_h("div", { className: "kpi-bar" }))),

    data.generatorLogs.length > 0 && CF_h("div", { className: "panel-card", style: { marginBottom: 20 } },
      CF_h("h3", null, CF_h("span", { className: "eyebrow-dot" }), "Generator Log History — " + year),
      CF_h("div", { className: "table-wrap" },
        CF_h("table", { className: "data-table" },
          CF_h("thead", null, CF_h("tr", null, CF_h("th", null, "Month"), CF_h("th", { className: "num" }, "Running Hours"),
            CF_h("th", { className: "num" }, "Diesel $"), CF_h("th", { className: "num" }, "Utilization"), CF_h("th", null, "Notes"), CF_h("th", null, "Edit"))),
          CF_h("tbody", null, Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
            const g = data.generatorLogs.find(x => x.year === year && x.month === m);
            const diesel = cfInPeriod(data.expenses, year, m).filter(cfIsDiesel);
            return CF_h("tr", { key: m, className: m === month ? "row-saved" : "" },
              CF_h("td", null, monthLabel(year, m)),
              CF_h("td", { className: "num" }, g ? g.hours : "—"),
              CF_h("td", { className: "num" }, diesel.length ? fmtMoney2(sumBy(diesel, e => e.amount)) : "—"),
              CF_h("td", { className: "num" }, g ? Math.round((g.hours || 0) / (daysInMonth(year, m) * 24) * 100) + "%" : "—"),
              CF_h("td", { style: { whiteSpace: "normal" } }, g ? g.notes : ""),
              CF_h("td", null, CF_h("button", { className: "btn btn-sm", onClick: () => setMonth(m) }, g ? "Edit" : "Add")));
          }))))),

    CF_h("div", { className: "kpi-grid", style: { gridTemplateColumns: "repeat(2, 1fr)" } },
      CF_h("div", { className: "kpi-card accent-teal" },
        CF_h("div", { className: "kpi-label" }, "Generator Hours " + year),
        CF_h("div", { className: "kpi-value" }, yearGenHours.toLocaleString("en-US")), CF_h("div", { className: "kpi-bar" })),
      CF_h("div", { className: "kpi-card accent-teal" },
        CF_h("div", { className: "kpi-label" }, "Utilization Rate " + year),
        CF_h("div", { className: "kpi-value" }, yearGenRate + "%"), CF_h("div", { className: "kpi-bar" }))),

    CF_h("div", { className: "panel-card", style: { marginBottom: 20 } },
      CF_h("h3", null, CF_h("span", { className: "eyebrow-dot" }), "Generator Log — " + monthLabel(year, month)),
      CF_h("form", { onSubmit: submitGenForm },
        CF_h("div", { className: "form-grid" },
          field("Running Hours", CF_h("input", { type: "number", step: "0.1", min: "0", value: genForm.hours, placeholder: "e.g. 210", onChange: e => { const v = e.target.value; setGenForm(f => ({ ...f, hours: v })); } })),
          field("Diesel Consumed (Liters)", CF_h("input", { type: "number", step: "0.1", min: "0", value: genForm.liters, placeholder: "e.g. 480", onChange: e => { const v = e.target.value; setGenForm(f => ({ ...f, liters: v })); } })),
          field("Notes", CF_h("input", { value: genForm.notes, onChange: e => { const v = e.target.value; setGenForm(f => ({ ...f, notes: v })); } }))),
        CF_h("button", { className: "btn btn-dark", type: "submit" }, currentGenLog ? "Update Generator Log" : "Save Generator Log"))),

    CF_h("div", { className: "panel-card", style: { marginBottom: 20 } },
      CF_h("h3", null, CF_h("span", { className: "eyebrow-dot" }), "Add New Entry — " + monthLabel(year, month)),
      CF_h("form", { onSubmit: submitForm },
        CF_h("div", { className: "form-grid" },
          field("Type", CF_h("select", { value: form.type, onChange: setF("type") },
            CF_ENTRY_TYPES.map(t => CF_h("option", { key: t.id, value: t.id }, t.label)))),
          form.type === "expense"
            ? field("Category", CF_h("select", { value: form.label, onChange: setF("label") },
                CF_EXPENSE_CATEGORIES.map(c => CF_h("option", { key: c, value: c }, c))))
            : field("Category", CF_h("input", { value: CF_ENTRY_TYPES.find(t => t.id === form.type).label, disabled: true })),
          field("Description", CF_h("input", { value: form.description, onChange: setF("description"), placeholder: "e.g. مازوت عن 5-11-2026" })),
          field("Amount ($)", CF_h("input", { type: "number", step: "0.01", value: form.amount, onChange: setF("amount"), required: true })),
          field("Day of Month", CF_h("input", { type: "number", min: "1", max: String(daysInMonth(year, month)), value: form.day, onChange: setF("day") })),
          field("Status", CF_h("select", { value: form.status, onChange: setF("status") },
            ["Paid", "Unpaid"].map(s => CF_h("option", { key: s, value: s }, s)))),
          field("Payment Method", CF_h("select", { value: form.payMethod, onChange: setF("payMethod") },
            CF_PAY_METHODS.map(s => CF_h("option", { key: s, value: s }, s)))),
          field("Notes", CF_h("input", { value: form.notes, onChange: setF("notes") })),
          field("Receipt (image or PDF, optional)", CF_h("input", {
            key: fileInputKey, type: "file", accept: "image/*,application/pdf", multiple: true,
            onChange: e => setFormFiles(Array.from(e.target.files || [])),
          }))),
        CF_h("button", { className: "btn btn-dark", type: "submit" }, "Save Entry"))),

    CF_h("div", { className: "panel-card", style: { marginBottom: 20 } },
      CF_h("h3", { style: { justifyContent: "space-between", flexWrap: "wrap", gap: 10 } },
        CF_h("span", { style: { display: "flex", alignItems: "center", gap: 8 } },
          CF_h("span", { className: "eyebrow-dot" }), "Expenses for " + monthLabel(year, month)),
        CF_h("span", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
          CF_h("button", { type: "button", className: "btn btn-sm", onClick: downloadZip, disabled: !withReceipt }, "Download receipts (.zip)"),
          CF_h("button", { type: "button", className: "btn btn-sm", onClick: exportMonth, disabled: !allMonthEntries.length }, "Export to Excel"))),
      rc.error && CF_h("div", { className: "receipt-msg", style: { marginBottom: 10 } }, "Receipt storage unavailable: " + rc.error),
      monthExpenses.length === 0
        ? CF_h("div", { className: "empty-state" }, CF_h("div", { className: "icon" }, "—"), "No expenses recorded for this month yet")
        : entryTable(monthExpenses, true),
      CF_h("div", { className: "receipt-note" }, "Receipts are saved in this browser on this device. Use “Download receipts (.zip)” to back them up or share them.")),

    monthMoves.length > 0 && CF_h("div", { className: "panel-card", style: { marginBottom: 20 } },
      CF_h("h3", null, CF_h("span", { className: "eyebrow-dot" }), "Transfers to LASeR & Advances — " + monthLabel(year, month)),
      entryTable(monthMoves, false)),

    toast && CF_h("div", { className: "toast" }, toast)
  );
}
