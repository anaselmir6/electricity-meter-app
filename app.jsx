// ==================== UTILITIES ====================
const MONTHS_AR = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function ymKey(y, m) { return y * 100 + m; }
function monthLabel(y, m) { return MONTHS_AR[m - 1] + " " + y; }
function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return "$0";
  const r = Math.round(n);
  return "$" + r.toLocaleString("en-US");
}
function fmtMoney2(n) {
  if (n === null || n === undefined || isNaN(n)) return "$0.00";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// English number-to-words for USD amounts, matching "Only One Hundred Nine USD" style
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function numToWords(n) {
  n = Math.round(n);
  if (n === 0) return "Zero";
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + numToWords(n % 100) : "");
  if (n < 1000000) return numToWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + numToWords(n % 1000) : "");
  return String(n);
}
function amountInWords(n) {
  return "Only " + numToWords(n) + " USD";
}

// tariff / calculation helpers, given the shared app data object
function getPrice(data, year, month) {
  const row = data.prices.find(p => p.year === year && p.month === month);
  return row ? row.price : 0;
}
function getFixedFee(data, sub) {
  const key = String(sub.A);
  return data.tariff[key] !== undefined ? data.tariff[key] : (sub.fixedFee || 0);
}
function getLastReading(data, subId, beforeDateStr) {
  // returns the most recent reading strictly before the given date for this subscriber
  const rows = data.readings.filter(r => r.subId === subId && (!beforeDateStr || r.date < beforeDateStr));
  if (!rows.length) return null;
  rows.sort((a, b) => a.date < b.date ? 1 : -1);
  return rows[0];
}
function computeTotal(consumption, price, fixedFee) {
  return consumption * price + fixedFee;
}
function activeSubscribers(data) {
  return data.subscribers.filter(s => s.active === "Active");
}
function readingsForMonth(data, year, month) {
  const target = year + "-" + pad2(month);
  return data.readings.filter(r => r.date.startsWith(target));
}
function expensesForMonth(data, year, month) {
  const target = year + "-" + pad2(month);
  return data.expenses.filter(e => e.date.startsWith(target));
}
function sumBy(arr, fn) { return arr.reduce((s, x) => s + (fn(x) || 0), 0); }

function allMonthsInRange(data) {
  const set = new Set();
  data.readings.forEach(r => set.add(r.date.slice(0, 7)));
  data.prices.forEach(p => set.add(p.year + "-" + pad2(p.month)));
  return Array.from(set).sort();
}

function contractStatus(contract) {
  const today = new Date().toISOString().slice(0, 10);
  if (today > contract.end) return "Expired";
  const daysLeft = (new Date(contract.end) - new Date(today)) / 86400000;
  if (daysLeft <= 30) return "Expiring Soon";
  return "Active";
}
// ==================== DATA STORE ====================
// DEMO MODE: state lives in memory only and resets on reload.
// Each function below is written so it can be swapped 1:1 for a Firebase
// Firestore call later (see the "// FIREBASE:" comments) without touching
// any component code — components only ever call store.xxx(...).

function useStore() {
  const [data, setData] = React.useState(() => {
    const seed = window.APP_DATA;
    return {
      subscribers: seed.subscribers.map(s => ({ ...s })),
      readings: seed.readings.map(r => ({ ...r })),
      expenses: seed.expenses.map(e => ({ ...e })),
      contracts: seed.contracts.map(c => ({ ...c })),
      prices: seed.prices.map(p => ({ ...p })),
      tariff: { ...seed.tariff },
    };
  });

  const addOrUpdateReading = React.useCallback((reading) => {
    // FIREBASE: setDoc(doc(db, "readings", `${reading.subId}_${reading.date}`), reading)
    setData(prev => {
      const idx = prev.readings.findIndex(r => r.subId === reading.subId && r.date === reading.date);
      const next = [...prev.readings];
      if (idx >= 0) next[idx] = { ...next[idx], ...reading };
      else next.push(reading);
      return { ...prev, readings: next };
    });
  }, []);

  const addExpense = React.useCallback((expense) => {
    // FIREBASE: addDoc(collection(db, "expenses"), expense)
    setData(prev => ({ ...prev, expenses: [...prev.expenses, expense] }));
  }, []);

  const addContract = React.useCallback((contract) => {
    // FIREBASE: addDoc(collection(db, "contracts"), contract)
    setData(prev => ({ ...prev, contracts: [...prev.contracts, contract] }));
  }, []);

  const addSubscriber = React.useCallback((sub) => {
    // FIREBASE: addDoc(collection(db, "subscribers"), sub)
    setData(prev => ({ ...prev, subscribers: [...prev.subscribers, sub] }));
  }, []);

  const updateSubscriber = React.useCallback((id, patch) => {
    // FIREBASE: updateDoc(doc(db, "subscribers", String(id)), patch)
    setData(prev => ({
      ...prev,
      subscribers: prev.subscribers.map(s => s.id === id ? { ...s, ...patch } : s),
    }));
  }, []);

  const setPriceForMonth = React.useCallback((year, month, price) => {
    // FIREBASE: setDoc(doc(db, "settings", `${year}_${month}`), { price })
    setData(prev => {
      const idx = prev.prices.findIndex(p => p.year === year && p.month === month);
      const next = [...prev.prices];
      if (idx >= 0) next[idx] = { ...next[idx], price };
      else next.push({ year, month, price });
      return { ...prev, prices: next };
    });
  }, []);

  return {
    data,
    addOrUpdateReading,
    addExpense,
    addContract,
    addSubscriber,
    updateSubscriber,
    setPriceForMonth,
  };
}
// ==================== LOGIN ====================
const DEMO_USERS = {
  wissam: { username: "wissam", password: "1234", role: "wissam", name: "Wissam Kabbara" },
  owner: { username: "admin", password: "1234", role: "owner", name: "System Administrator" },
};

function LoginScreen({ onLogin }) {
  const [role, setRole] = React.useState("wissam");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const u = DEMO_USERS[role];
    if (username.trim() === u.username && password === u.password) {
      setError("");
      onLogin({ role: u.role, name: u.name });
    } else {
      setError("Incorrect username or password.");
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-eyebrow">METER · 224</div>
        <div className="login-title">Electricity Meter Management System</div>
        <div className="login-sub">Sign in according to your role to continue</div>

        <div className="role-tabs">
          <button
            type="button"
            className={"role-tab" + (role === "wissam" ? " active" : "")}
            onClick={() => { setRole("wissam"); setError(""); }}
          >
            Wissam Login (Enter Readings)
          </button>
          <button
            type="button"
            className={"role-tab" + (role === "owner" ? " active" : "")}
            onClick={() => { setRole("owner"); setError(""); }}
          >
            Owner Login (Dashboard)
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="field-label">Username</label>
          <input className="field-input" value={username} onChange={e => setUsername(e.target.value)} placeholder={role === "wissam" ? "wissam" : "admin"} />
          <label className="field-label">Password</label>
          <input className="field-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••" />
          {error && <div className="login-error">{error}</div>}
          <button className="btn-primary" type="submit">Login</button>
        </form>

        <div className="login-hint">
          <b>Demo mode:</b> username <span className="mono">{role === "wissam" ? "wissam" : "admin"}</span> and password <span className="mono">1234</span>.
          After connecting the site to Firebase, this screen becomes a real login with actual accounts for each person.
        </div>
      </div>
    </div>
  );
}

// ==================== APP SHELL ====================
const NAV_ITEMS = {
  wissam: [
    { id: "entry", label: "Enter Readings" },
    { id: "subscribers", label: "Subscribers" },
  ],
  owner: [
    { id: "dashboard", label: "Dashboard" },
    { id: "entry", label: "Enter Readings" },
    { id: "subscribers", label: "Subscribers" },
    { id: "expenses", label: "Expenses" },
    { id: "contracts", label: "Maintenance Contracts" },
    { id: "receipts", label: "Receipts" },
  ],
};

function BreakerPanel({ user, view, setView, onLogout }) {
  const items = NAV_ITEMS[user.role];
  return (
    <div className="breaker-panel">
      <div className="brand">
        <div className="brand-mark">METER · 224</div>
        <div className="brand-name">Electricity Meter System</div>
        <div className="brand-sub">Property 224 — Subscriber Management</div>
      </div>
      <div className="nav-group">
        {items.map(item => (
          <button
            key={item.id}
            className={"switch-item" + (view === item.id ? " active" : "")}
            onClick={() => setView(item.id)}
          >
            <span className="dot"></span>
            {item.label}
          </button>
        ))}
      </div>
      <div className="panel-footer">
        <div className="user-chip">
          <span className="dot" style={{ background: "#E8A33D", width: 7, height: 7, borderRadius: "50%" }}></span>
          {user.name}
        </div>
        <button className="logout-btn" onClick={onLogout}>Log out</button>
      </div>
    </div>
  );
}
// ==================== MONTH PICKER ====================
function MonthPicker({ year, month, setYear, setMonth, minYear = 2024, maxYear = 2026 }) {
  const years = [];
  for (let y = minYear; y <= maxYear; y++) years.push(y);
  return (
    <div className="month-picker">
      <select value={year} onChange={e => setYear(Number(e.target.value))}>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <select value={month} onChange={e => setMonth(Number(e.target.value))}>
        {MONTHS_AR.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
    </div>
  );
}
// ==================== METER DIAL (signature element) ====================
function MeterDial({ value, max, label }) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const angle = -90 + pct * 180; // -90 (empty, left) .. +90 (full, right)
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  function tickPoint(p, r) {
    const a = (-90 + p * 180) * (Math.PI / 180);
    return { x: 100 + r * Math.cos(a), y: 100 + r * Math.sin(a) };
  }

  return (
    <div className="dial-wrap">
      <svg width="200" height="120" viewBox="0 0 200 120">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#DDD6C4" strokeWidth="10" strokeLinecap="round" />
        <path
          d={`M 20 100 A 80 80 0 0 1 ${100 + 80 * Math.cos((-90 + pct * 180) * Math.PI / 180)} ${100 + 80 * Math.sin((-90 + pct * 180) * Math.PI / 180)}`}
          fill="none" stroke="#E8A33D" strokeWidth="10" strokeLinecap="round"
        />
        {ticks.map((t, i) => {
          const p1 = tickPoint(t, 68);
          const p2 = tickPoint(t, 80);
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#9AA1AC" strokeWidth="2" />;
        })}
        <g className="dial-needle" style={{ transform: `rotate(${angle}deg)` }}>
          <line x1="100" y1="100" x2="100" y2="34" stroke="#14181D" strokeWidth="3" strokeLinecap="round" />
          <circle cx="100" cy="100" r="6" fill="#14181D" />
        </g>
      </svg>
      <div className="dial-value mono">{Math.round(value).toLocaleString("en-US")} kWh</div>
      <div className="dial-caption">{label}</div>
    </div>
  );
}
// ==================== DASHBOARD ====================
function DashboardView({ data }) {
  const now = new Date();
  const [year, setYear] = React.useState(2026);
  const [month, setMonth] = React.useState(6);
  const [search, setSearch] = React.useState("");
  const chartRef = React.useRef(null);
  const chartInstance = React.useRef(null);

  const monthReadings = React.useMemo(() => readingsForMonth(data, year, month), [data, year, month]);
  const monthExpenses = React.useMemo(() => expensesForMonth(data, year, month), [data, year, month]);

  const activeCount = activeSubscribers(data).length;
  const totalCount = data.subscribers.length;
  const collected = sumBy(monthReadings.filter(r => r.paid === "Paid"), r => r.total);
  const unpaid = sumBy(monthReadings.filter(r => r.paid !== "Paid"), r => r.total);
  const expensesTotal = sumBy(monthExpenses, e => e.amount);
  const net = collected - expensesTotal;
  const kwhTotal = sumBy(monthReadings, r => r.consumption);

  const yearlyBreakdown = React.useMemo(() => {
    const years = [2024, 2025, 2026];
    const rows = years.map(y => {
      const yReadings = data.readings.filter(r => r.date.startsWith(String(y)));
      const yExpenses = data.expenses.filter(e => e.date.startsWith(String(y)));
      const yCollected = sumBy(yReadings.filter(r => r.paid === "Paid"), r => r.total);
      const yUnpaid = sumBy(yReadings.filter(r => r.paid !== "Paid"), r => r.total);
      const yExpensesTotal = sumBy(yExpenses, e => e.amount);
      return { year: y, collected: yCollected, unpaid: yUnpaid, expenses: yExpensesTotal, net: yCollected - yExpensesTotal };
    });
    const total = {
      collected: sumBy(rows, r => r.collected),
      unpaid: sumBy(rows, r => r.unpaid),
      expenses: sumBy(rows, r => r.expenses),
      net: sumBy(rows, r => r.net),
    };
    return { rows, total };
  }, [data]);

  const maxKwh = React.useMemo(() => {
    const months = allMonthsInRange(data);
    let max = 0;
    months.forEach(ym => {
      const [y, m] = ym.split("-").map(Number);
      const total = sumBy(readingsForMonth(data, y, m), r => r.consumption);
      if (total > max) max = total;
    });
    return max || 1;
  }, [data]);

  // build monthly trend series (income vs expenses) across all months present
  const trend = React.useMemo(() => {
    const months = allMonthsInRange(data);
    return months.map(ym => {
      const [y, m] = ym.split("-").map(Number);
      return {
        label: MONTHS_AR[m - 1].slice(0, 3) + " " + String(y).slice(2),
        income: sumBy(readingsForMonth(data, y, m), r => r.total),
        expense: sumBy(expensesForMonth(data, y, m), e => e.amount),
      };
    });
  }, [data]);

  React.useEffect(() => {
    if (!chartRef.current) return;
    if (chartInstance.current) chartInstance.current.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "line",
      data: {
        labels: trend.map(t => t.label),
        datasets: [
          {
            label: "Collected",
            data: trend.map(t => t.income),
            borderColor: "#E8A33D",
            backgroundColor: "rgba(232,163,61,0.12)",
            tension: 0.3,
            fill: true,
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: "Expenses",
            data: trend.map(t => t.expense),
            borderColor: "#1F5C54",
            backgroundColor: "rgba(31,92,84,0.08)",
            tension: 0.3,
            fill: true,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom", labels: { font: { family: "IBM Plex Sans Arabic" } } } },
        scales: {
          x: { ticks: { font: { family: "IBM Plex Mono" }, maxRotation: 0, autoSkip: true } },
          y: { ticks: { font: { family: "IBM Plex Mono" }, callback: v => "$" + v } },
        },
      },
    });
    return () => { if (chartInstance.current) chartInstance.current.destroy(); };
  }, [trend]);

  const subRows = React.useMemo(() => {
    return data.subscribers
      .filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
      .map(s => {
        const totals = {};
        [2024, 2025, 2026].forEach(y => {
          totals[y] = sumBy(data.readings.filter(r => r.subId === s.id && r.date.startsWith(String(y))), r => r.total);
        });
        const grand = totals[2024] + totals[2025] + totals[2026];
        return { ...s, totals, grand };
      })
      .sort((a, b) => b.grand - a.grand);
  }, [data, search]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">OWNER · OVERVIEW</div>
          <div className="page-title">Dashboard</div>
          <div className="page-desc">Full overview of collections and expenses — choose a month to update the numbers</div>
        </div>
        <MonthPicker year={year} month={month} setYear={setYear} setMonth={setMonth} />
      </div>

      <div className="kpi-grid">
        <div className="kpi-card accent-ink">
          <div className="kpi-label">Subscribers (All)</div>
          <div className="kpi-value">{totalCount}</div>
          <div className="kpi-bar"></div>
        </div>
        <div className="kpi-card accent-teal">
          <div className="kpi-label">Active Now</div>
          <div className="kpi-value">{activeCount}</div>
          <div className="kpi-bar"></div>
        </div>
        <div className="kpi-card accent-filament">
          <div className="kpi-label">Collected {monthLabel(year, month)}</div>
          <div className="kpi-value">{fmtMoney(collected)}</div>
          <div className="kpi-bar"></div>
        </div>
        <div className="kpi-card accent-rust">
          <div className="kpi-label">Unpaid</div>
          <div className="kpi-value">{fmtMoney(unpaid)}</div>
          <div className="kpi-bar"></div>
        </div>
        <div className="kpi-card accent-rust">
          <div className="kpi-label">Expenses {monthLabel(year, month)}</div>
          <div className="kpi-value">{fmtMoney(expensesTotal)}</div>
          <div className="kpi-bar"></div>
        </div>
        <div className="kpi-card accent-teal">
          <div className="kpi-label">Net (Collected − Expenses)</div>
          <div className="kpi-value">{fmtMoney(net)}</div>
          <div className="kpi-bar"></div>
        </div>
      </div>

      <div className="panel-card" style={{ marginBottom: 24 }}>
        <h3><span className="eyebrow-dot"></span>Totals by Year</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="num">2024</th>
                <th className="num">2025</th>
                <th className="num">2026</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: "collected", label: "Collected" },
                { key: "unpaid", label: "Unpaid" },
                { key: "expenses", label: "Expenses" },
                { key: "net", label: "Net" },
              ].map(m => (
                <tr key={m.key}>
                  <td>{m.label}</td>
                  {yearlyBreakdown.rows.map(r => (
                    <td className="num" key={r.year}>{fmtMoney(r[m.key])}</td>
                  ))}
                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(yearlyBreakdown.total[m.key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel-card">
          <h3><span className="eyebrow-dot"></span>Collected vs. Expenses — All Recorded Months</h3>
          <div style={{ height: 280 }}>
            <canvas ref={chartRef}></canvas>
          </div>
        </div>
        <div className="panel-card">
          <h3><span className="eyebrow-dot"></span>Month Consumption (kWh)</h3>
          <MeterDial value={kwhTotal} max={maxKwh} label={monthLabel(year, month)} />
        </div>
      </div>

      <div className="panel-card">
        <h3 style={{ justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="eyebrow-dot"></span>Total per Subscriber by Year</span>
          <input className="search-input" placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)} />
        </h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th className="num">2024</th>
                <th className="num">2025</th>
                <th className="num">2026</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {subRows.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td><span className={"badge " + (s.active === "Active" ? "active" : "inactive")}>{s.active}</span></td>
                  <td className="num">{fmtMoney(s.totals[2024])}</td>
                  <td className="num">{fmtMoney(s.totals[2025])}</td>
                  <td className="num">{fmtMoney(s.totals[2026])}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(s.grand)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
// ==================== ENTRY VIEW (Wissam) ====================
function EntryView({ data, store, user }) {
  const [year, setYear] = React.useState(2026);
  const [month, setMonth] = React.useState(7);
  const [drafts, setDrafts] = React.useState({});
  const [feeDrafts, setFeeDrafts] = React.useState({});
  const [toast, setToast] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [remainingOnly, setRemainingOnly] = React.useState(false);
  const inputRefs = React.useRef({});
  const dateStr = year + "-" + pad2(month) + "-01";

  const subs = React.useMemo(() => activeSubscribers(data).sort((a, b) => a.id - b.id), [data]);

  const rows = React.useMemo(() => {
    return subs.map(s => {
      const existing = data.readings.find(r => r.subId === s.id && r.date === dateStr);
      const last = getLastReading(data, s.id, dateStr);
      const prev = existing ? existing.prev : (last ? last.curr : 0);
      const draft = drafts[s.id];
      const curr = draft !== undefined ? draft : (existing ? existing.curr : "");
      const price = getPrice(data, year, month);
      const defaultFee = getFixedFee(data, s);
      const feeDraft = feeDrafts[s.id];
      const fixedFee = feeDraft !== undefined ? (feeDraft === "" ? 0 : Number(feeDraft)) : (existing && existing.fixedFee !== undefined ? existing.fixedFee : defaultFee);
      const feeEdited = fixedFee !== defaultFee;
      const consumption = curr !== "" && !isNaN(curr) ? Number(curr) - prev : null;
      const total = consumption !== null ? computeTotal(consumption, price, fixedFee) : null;
      return { sub: s, existing, prev, curr, price, fixedFee, feeEdited, consumption, total };
    });
  }, [subs, data, dateStr, drafts, feeDrafts, year, month]);

  const enteredCount = rows.filter(r => r.existing).length;

  const displayRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(row => {
      if (remainingOnly && row.existing) return false;
      if (!q) return true;
      return row.sub.name.toLowerCase().includes(q)
        || String(row.sub.panel).toLowerCase().includes(q)
        || String(row.sub.meter).toLowerCase().includes(q);
    });
  }, [rows, search, remainingOnly]);

  function setDraft(subId, val) {
    setDrafts(d => ({ ...d, [subId]: val }));
  }

  function setFeeDraft(subId, val) {
    setFeeDrafts(d => ({ ...d, [subId]: val }));
  }

  function changeAmp(row, newAmp) {
    store.updateSubscriber(row.sub.id, { A: Number(newAmp), fixedFee: data.tariff[newAmp] });
    // the fixed fee follows the new amp's tariff price, so drop any manual override for this row
    setFeeDrafts(d => { const next = { ...d }; delete next[row.sub.id]; return next; });
  }

  function focusReadingInput(subId) {
    const el = inputRefs.current[subId];
    if (el) { el.focus(); el.select(); }
  }

  function handleReadingKeyDown(e, row, idx) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (row.curr === "" || isNaN(row.curr)) return;
    saveRow(row);
    const next = displayRows[idx + 1];
    if (next) requestAnimationFrame(() => focusReadingInput(next.sub.id));
  }

  function saveRow(row) {
    if (row.curr === "" || isNaN(row.curr)) return;
    store.addOrUpdateReading({
      date: dateStr,
      subId: row.sub.id,
      prev: row.prev,
      curr: Number(row.curr),
      consumption: row.consumption,
      price: row.price,
      fixedFee: row.fixedFee,
      feeEdited: row.feeEdited,
      editedBy: row.feeEdited ? user.name : (row.existing ? row.existing.editedBy : undefined),
      total: row.total,
      totalRounded: Math.ceil(row.total),
      receiptNo: row.existing ? row.existing.receiptNo : "",
      paid: row.existing ? row.existing.paid : "Paid",
      payMethod: "Cash",
    });
    setToast("Saved reading for " + row.sub.name);
    setTimeout(() => setToast(""), 2200);
  }

  function saveAll() {
    let count = 0;
    rows.forEach(row => {
      if (row.curr !== "" && !isNaN(row.curr) && !row.existing) {
        saveRow(row);
        count++;
      }
    });
    setToast(count > 0 ? `Saved ${count} new readings` : "No new readings to save");
    setTimeout(() => setToast(""), 2500);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">DATA ENTRY · {user.name}</div>
          <div className="page-title">Monthly Reading Entry</div>
          <div className="page-desc">Choose the month, enter the current meter reading for each subscriber — the rest is calculated automatically</div>
        </div>
        <MonthPicker year={year} month={month} setYear={setYear} setMonth={setMonth} />
      </div>

      <div className="demo-banner">
        Currently in demo mode: readings are saved in browser memory for this session only. After connecting the site to Firebase, they'll be saved permanently and appear immediately for the owner.
      </div>

      <div className="panel-card">
        <h3 style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="eyebrow-dot"></span>{monthLabel(year, month)} — {enteredCount}/{rows.length} entered
          </span>
          <input
            className="search-input"
            placeholder="Search by name, panel or meter..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </h3>
        <div className="chip-row">
          <button className={"chip" + (!remainingOnly ? " active" : "")} onClick={() => setRemainingOnly(false)}>All ({rows.length})</button>
          <button className={"chip" + (remainingOnly ? " active" : "")} onClick={() => setRemainingOnly(true)}>Remaining ({rows.length - enteredCount})</button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Panel No.</th>
                <th>Meter No.</th>
                <th className="num">Previous Reading</th>
                <th className="num">Current Reading</th>
                <th className="num">Consumption</th>
                <th className="num">Amp</th>
                <th className="num">Fixed Fee</th>
                <th className="num">Total</th>
                <th>Save</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--slate)", padding: "24px 12px" }}>
                  {remainingOnly ? "All subscribers have a reading for this month." : "No subscribers match your search."}
                </td></tr>
              )}
              {displayRows.map((row, idx) => (
                <tr key={row.sub.id} className={row.existing ? "row-saved" : ""}>
                  <td className="num">{row.sub.id}</td>
                  <td>{row.sub.name}</td>
                  <td className="num">{row.sub.panel}</td>
                  <td className="num">{row.sub.meter}</td>
                  <td className="num">{row.prev.toLocaleString("en-US")}</td>
                  <td>
                    <input
                      ref={el => inputRefs.current[row.sub.id] = el}
                      className="entry-input"
                      type="number"
                      inputMode="decimal"
                      value={row.curr}
                      onChange={e => setDraft(row.sub.id, e.target.value)}
                      onKeyDown={e => handleReadingKeyDown(e, row, idx)}
                      placeholder="Enter reading"
                    />
                  </td>
                  <td className="num">{row.consumption !== null ? row.consumption.toLocaleString("en-US") : "—"}</td>
                  <td>
                    <select
                      className="entry-input"
                      value={row.sub.A}
                      onChange={e => changeAmp(row, e.target.value)}
                    >
                      {Object.keys(data.tariff).map(a => <option key={a} value={a}>{a}A</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      className="entry-input"
                      type="number"
                      step="0.01"
                      value={feeDrafts[row.sub.id] !== undefined ? feeDrafts[row.sub.id] : row.fixedFee}
                      onChange={e => setFeeDraft(row.sub.id, e.target.value)}
                      style={row.feeEdited ? { borderColor: "var(--filament)", background: "var(--filament-soft)" } : undefined}
                      title={row.feeEdited ? "Fixed fee changed from the default subscription rate" : ""}
                    />
                  </td>
                  <td className="num">{row.total !== null ? fmtMoney(Math.ceil(row.total)) : "—"}</td>
                  <td>
                    <button className="btn btn-sm" disabled={row.curr === "" || isNaN(row.curr)} onClick={() => saveRow(row)}>
                      {row.existing ? "Update" : "Save"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-dark" onClick={saveAll}>Save All New Readings</button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
// ==================== SUBSCRIBERS VIEW ====================
function SubscribersView({ data, store }) {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState(null);
  const blankForm = { name: "", status: "External", panel: "", meter: "", A: "10", notes: "" };
  const [form, setForm] = React.useState(blankForm);

  const rows = React.useMemo(() => {
    return data.subscribers.filter(s => {
      if (filter === "active" && s.active !== "Active") return false;
      if (filter === "inactive" && s.active !== "Inactive") return false;
      return s.name.toLowerCase().includes(search.toLowerCase());
    }).sort((a, b) => a.id - b.id);
  }, [data, search, filter]);

  function openAddForm() {
    setEditingId(null);
    setForm(blankForm);
    setShowForm(true);
  }

  function openEditForm(s) {
    setEditingId(s.id);
    setForm({ name: s.name, status: s.status, panel: s.panel, meter: s.meter, A: String(s.A), notes: s.notes || "" });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(blankForm);
  }

  function submitForm(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editingId != null) {
      store.updateSubscriber(editingId, {
        name: form.name.trim(),
        status: form.status,
        panel: form.panel || "0",
        meter: form.meter || String(editingId),
        A: Number(form.A),
        fixedFee: data.tariff[form.A] || 0,
        notes: form.notes,
      });
    } else {
      const nextId = Math.max(0, ...data.subscribers.map(s => s.id)) + 1;
      store.addSubscriber({
        id: nextId,
        name: form.name.trim(),
        status: form.status,
        panel: form.panel || "0",
        meter: form.meter || String(nextId),
        A: Number(form.A),
        fixedFee: data.tariff[form.A] || 0,
        active: "Active",
        notes: form.notes || "Added via the website",
      });
    }
    closeForm();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">SUBSCRIBERS · {data.subscribers.length}</div>
          <div className="page-title">Subscribers</div>
          <div className="page-desc">Full list — active and inactive, with subscription category and meter number</div>
        </div>
        <button className="btn btn-dark" onClick={() => showForm ? closeForm() : openAddForm()}>
          {showForm ? "Close" : "+ Add Subscriber"}
        </button>
      </div>

      {showForm && (
        <div className="panel-card" style={{ marginBottom: 20 }}>
          <h3><span className="eyebrow-dot"></span>{editingId != null ? "Edit Subscriber" : "New Subscriber"}</h3>
          <form onSubmit={submitForm}>
            <div className="form-grid">
              <div className="form-field">
                <label>Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="form-field">
                <label>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="External">External</option>
                  <option value="Internal">Internal</option>
                </select>
              </div>
              <div className="form-field">
                <label>Subscription Category (A)</label>
                <select value={form.A} onChange={e => setForm(f => ({ ...f, A: e.target.value }))}>
                  {Object.keys(data.tariff).map(a => <option key={a} value={a}>{a} — {fmtMoney2(data.tariff[a])}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Panel No.</label>
                <input value={form.panel} onChange={e => setForm(f => ({ ...f, panel: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>Meter No.</label>
                <input value={form.meter} onChange={e => setForm(f => ({ ...f, meter: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>Notes</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-dark" type="submit">{editingId != null ? "Save Changes" : "Save Subscriber"}</button>
            {editingId != null && <button type="button" className="btn btn-sm" style={{ marginInlineStart: 8 }} onClick={closeForm}>Cancel</button>}
          </form>
        </div>
      )}

      <div className="chip-row">
        <button className={"chip" + (filter === "all" ? " active" : "")} onClick={() => setFilter("all")}>All ({data.subscribers.length})</button>
        <button className={"chip" + (filter === "active" ? " active" : "")} onClick={() => setFilter("active")}>Active ({activeSubscribers(data).length})</button>
        <button className={"chip" + (filter === "inactive" ? " active" : "")} onClick={() => setFilter("inactive")}>Inactive ({data.subscribers.length - activeSubscribers(data).length})</button>
        <input className="search-input" placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)} style={{ marginInlineStart: "auto" }} />
      </div>

      <div className="panel-card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th><th>Name</th><th>Status</th><th>Panel No.</th><th>Meter No.</th>
                <th className="num">Category A</th><th className="num">Fixed Fee</th><th>Active?</th><th>Notes</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id}>
                  <td className="num">{s.id}</td>
                  <td>{s.name}</td>
                  <td>{s.status}</td>
                  <td className="num">{s.panel}</td>
                  <td className="num">{s.meter}</td>
                  <td className="num">{s.A}</td>
                  <td className="num">{fmtMoney2(getFixedFee(data, s))}</td>
                  <td>
                    <button
                      className={"badge " + (s.active === "Active" ? "active" : "inactive")}
                      style={{ border: "none" }}
                      onClick={() => store.updateSubscriber(s.id, { active: s.active === "Active" ? "Inactive" : "Active" })}
                    >
                      {s.active}
                    </button>
                  </td>
                  <td style={{ whiteSpace: "normal", maxWidth: 220 }}>{s.notes}</td>
                  <td><button className="btn btn-sm" onClick={() => openEditForm(s)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
// ==================== EXPENSES VIEW ====================
const EXPENSE_CATEGORIES = [
  "Fixed Salaries", "Generator Maintenance Contract", "Generator Consumption (Diesel)", "Electrical Maintenance",
  "Generator Maintenance (Repairs)", "Solar Power System Consumption", "Diesel (Purchase)",
  "Panel Washing", "Camera Installation", "Miscellaneous Expenses", "Other",
];

function ExpensesView({ data, store }) {
  const [year, setYear] = React.useState(2026);
  const [month, setMonth] = React.useState(6);
  const [form, setForm] = React.useState({ label: EXPENSE_CATEGORIES[0], amount: "", notes: "" });

  const monthExpenses = React.useMemo(() => expensesForMonth(data, year, month), [data, year, month]);
  const total = sumBy(monthExpenses, e => e.amount);

  const yearTotal = React.useMemo(() => {
    return sumBy(data.expenses.filter(e => e.date.startsWith(String(year))), e => e.amount);
  }, [data, year]);

  function submitForm(e) {
    e.preventDefault();
    if (!form.amount || isNaN(form.amount)) return;
    store.addExpense({
      date: year + "-" + pad2(month) + "-01",
      label: form.label,
      amount: Number(form.amount),
      notes: form.notes,
    });
    setForm({ label: EXPENSE_CATEGORIES[0], amount: "", notes: "" });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">EXPENSES</div>
          <div className="page-title">Monthly Expenses</div>
          <div className="page-desc">Salaries, maintenance, diesel — every expense by month</div>
        </div>
        <MonthPicker year={year} month={month} setYear={setYear} setMonth={setMonth} />
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="kpi-card accent-rust">
          <div className="kpi-label">Expenses {monthLabel(year, month)}</div>
          <div className="kpi-value">{fmtMoney(total)}</div>
          <div className="kpi-bar"></div>
        </div>
        <div className="kpi-card accent-ink">
          <div className="kpi-label">Total Expenses for {year}</div>
          <div className="kpi-value">{fmtMoney(yearTotal)}</div>
          <div className="kpi-bar"></div>
        </div>
      </div>

      <div className="panel-card" style={{ marginBottom: 20 }}>
        <h3><span className="eyebrow-dot"></span>Add New Expense — {monthLabel(year, month)}</h3>
        <form onSubmit={submitForm}>
          <div className="form-grid">
            <div className="form-field">
              <label>Expense Type</label>
              <select value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Amount ($)</label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div className="form-field">
              <label>Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <button className="btn btn-dark" type="submit">Save Expense</button>
        </form>
      </div>

      <div className="panel-card">
        <h3><span className="eyebrow-dot"></span>Expenses for {monthLabel(year, month)}</h3>
        {monthExpenses.length === 0 ? (
          <div className="empty-state"><div className="icon">—</div>No expenses recorded for this month yet</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Type</th><th className="num">Amount</th><th>Notes</th></tr></thead>
              <tbody>
                {monthExpenses.map((e, i) => (
                  <tr key={i}>
                    <td>{e.label}</td>
                    <td className="num">{fmtMoney2(e.amount)}</td>
                    <td style={{ whiteSpace: "normal" }}>{e.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
// ==================== CONTRACTS VIEW ====================
function ContractsView({ data, store }) {
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", provider: "", start: "", end: "", monthlyCost: "", notes: "" });

  function submitForm(e) {
    e.preventDefault();
    if (!form.name || !form.end) return;
    store.addContract({
      name: form.name,
      provider: form.provider,
      start: form.start,
      end: form.end,
      monthlyCost: Number(form.monthlyCost) || 0,
      notes: form.notes,
    });
    setForm({ name: "", provider: "", start: "", end: "", monthlyCost: "", notes: "" });
    setShowForm(false);
  }

  function badgeClass(status) {
    if (status === "Active") return "active";
    if (status === "Expiring Soon") return "expiring";
    return "expired";
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">MAINTENANCE</div>
          <div className="page-title">Maintenance Contracts</div>
          <div className="page-desc">Generators, solar power, and any recurring service contract — automatic alert before expiry</div>
        </div>
        <button className="btn btn-dark" onClick={() => setShowForm(s => !s)}>
          {showForm ? "Close" : "+ Add Contract"}
        </button>
      </div>

      {showForm && (
        <div className="panel-card" style={{ marginBottom: 20 }}>
          <h3><span className="eyebrow-dot"></span>New Contract</h3>
          <form onSubmit={submitForm}>
            <div className="form-grid">
              <div className="form-field"><label>Contract Name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div className="form-field"><label>Provider</label><input value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} /></div>
              <div className="form-field"><label>Monthly Cost ($)</label><input type="number" value={form.monthlyCost} onChange={e => setForm(f => ({ ...f, monthlyCost: e.target.value }))} /></div>
              <div className="form-field"><label>Start Date</label><input type="date" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} /></div>
              <div className="form-field"><label>End Date</label><input type="date" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} required /></div>
              <div className="form-field"><label>Notes</label><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
            <button className="btn btn-dark" type="submit">Save Contract</button>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table" style={{ background: "var(--white)", borderRadius: 4 }}>
          <thead>
            <tr>
              <th>Contract Name</th><th>Provider</th><th>Start</th><th>End</th>
              <th className="num">Monthly Cost</th><th>Status</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.contracts.map((c, i) => {
              const status = contractStatus(c);
              return (
                <tr key={i}>
                  <td>{c.name}</td>
                  <td>{c.provider}</td>
                  <td className="num">{c.start}</td>
                  <td className="num">{c.end}</td>
                  <td className="num">{fmtMoney2(c.monthlyCost)}</td>
                  <td><span className={"badge " + badgeClass(status)}>{status}</span></td>
                  <td style={{ whiteSpace: "normal", maxWidth: 260 }}>{c.notes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ==================== RECEIPT TEMPLATE ====================
function ReceiptTemplate({ sub, reading, receiptNo }) {
  if (!sub || !reading) return null;
  return (
    <div className="receipt-sheet" dir="ltr">
      <div className="r-title">Receipt — No. {receiptNo}</div>
      <div className="r-row"><span>Received from:</span><b>{sub.name}</b></div>
      <div className="r-row"><span>Panel No.:</span><b className="mono">{sub.panel}</b></div>
      <div className="r-row"><span>Unit Rate:</span><b className="mono">{reading.price} $</b></div>
      <div className="r-row"><span>For:</span><b>Payment of electricity subscription for {monthLabel(Number(reading.date.slice(0,4)), Number(reading.date.slice(5,7)))}</b></div>
      <div className="r-row"><span>Previous Reading:</span><b className="mono">{reading.prev}</b></div>
      <div className="r-row"><span>Current Reading:</span><b className="mono">{reading.curr}</b></div>
      <div className="r-row"><span>Total Consumption:</span><b className="mono">{reading.consumption} kWh</b></div>
      <div className="r-row"><span>Fixed Subscription:</span><b className="mono">{fmtMoney2(reading.fixedFee)}</b></div>
      <div className="r-amount">Amount: {amountInWords(reading.totalRounded)} — {fmtMoney(reading.totalRounded)}</div>
      <div className="r-row"><span>Payment Method:</span><b>{reading.payMethod || "Cash"}</b></div>
      <div className="r-foot">
        <span>Received by: Meter System 224</span>
        <span className="mono">{reading.date}</span>
      </div>
    </div>
  );
}

// ==================== RECEIPTS VIEW ====================
function ReceiptsView({ data, store }) {
  const [year, setYear] = React.useState(2026);
  const [month, setMonth] = React.useState(6);
  const [payFilter, setPayFilter] = React.useState("all");
  const [previewSub, setPreviewSub] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState("");
  const hiddenRef = React.useRef(null);
  const [renderTarget, setRenderTarget] = React.useState(null); // { sub, reading, receiptNo }

  const monthReadings = React.useMemo(() => readingsForMonth(data, year, month), [data, year, month]);
  const allRows = React.useMemo(() => {
    return monthReadings.map(r => ({
      reading: r,
      sub: data.subscribers.find(s => s.id === r.subId),
    })).filter(r => r.sub).sort((a, b) => a.sub.id - b.sub.id);
  }, [monthReadings, data]);
  const paidCount = allRows.filter(r => r.reading.paid === "Paid").length;
  const unpaidCount = allRows.length - paidCount;
  const rows = React.useMemo(() => {
    return allRows.filter(r => {
      if (payFilter === "paid") return r.reading.paid === "Paid";
      if (payFilter === "unpaid") return r.reading.paid !== "Paid";
      return true;
    });
  }, [allRows, payFilter]);

  function togglePaid(reading) {
    store.addOrUpdateReading({ ...reading, paid: reading.paid === "Paid" ? "Unpaid" : "Paid" });
  }

  function waitFrame() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  async function captureReceipt(sub, reading, receiptNo) {
    setRenderTarget({ sub, reading, receiptNo });
    await waitFrame();
    const canvas = await html2canvas(hiddenRef.current, { scale: 2, backgroundColor: "#ffffff" });
    return canvas;
  }

  async function downloadSingle(row) {
    setBusy(true);
    setProgress("Generating receipt for " + row.sub.name + " ...");
    const receiptNo = row.reading.receiptNo || (row.sub.meter + "-" + row.reading.date.replace(/-/g, ""));
    const canvas = await captureReceipt(row.sub, row.reading, receiptNo);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "px", format: [canvas.width / 2, canvas.height / 2] });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
    pdf.save("Receipt_" + row.sub.name + "_" + row.reading.date + ".pdf");
    setRenderTarget(null);
    setBusy(false);
    setProgress("");
  }

  async function downloadAll() {
    if (!rows.length) return;
    setBusy(true);
    const { jsPDF } = window.jspdf;
    let pdf = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      setProgress(`Generating receipt ${i + 1} of ${rows.length} — ${row.sub.name}`);
      const receiptNo = row.reading.receiptNo || (row.sub.meter + "-" + row.reading.date.replace(/-/g, ""));
      const canvas = await captureReceipt(row.sub, row.reading, receiptNo);
      const w = canvas.width / 2, h = canvas.height / 2;
      if (!pdf) pdf = new jsPDF({ unit: "px", format: [w, h] });
      else pdf.addPage([w, h]);
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
    }
    pdf.save(`Receipts_${monthLabel(year, month)}.pdf`);
    setRenderTarget(null);
    setBusy(false);
    setProgress("");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">RECEIPTS</div>
          <div className="page-title">Receipts</div>
          <div className="page-desc">Generate PDF receipts for each subscriber — individually or all at once for the month</div>
        </div>
        <MonthPicker year={year} month={month} setYear={setYear} setMonth={setMonth} />
      </div>

      <div className="panel-card" style={{ marginBottom: 20 }}>
        <h3 style={{ justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="eyebrow-dot"></span>{monthLabel(year, month)} — {rows.length} receipts available</span>
          <button className="btn btn-dark" onClick={downloadAll} disabled={busy || !rows.length}>Download All Receipts (Single PDF)</button>
        </h3>
        <div className="chip-row" style={{ marginBottom: 14 }}>
          <button className={"chip" + (payFilter === "all" ? " active" : "")} onClick={() => setPayFilter("all")}>All ({allRows.length})</button>
          <button className={"chip" + (payFilter === "paid" ? " active" : "")} onClick={() => setPayFilter("paid")}>Paid ({paidCount})</button>
          <button className={"chip" + (payFilter === "unpaid" ? " active" : "")} onClick={() => setPayFilter("unpaid")}>Unpaid ({unpaidCount})</button>
        </div>
        {rows.length === 0 ? (
          <div className="empty-state"><div className="icon">—</div>No readings saved for this month yet. Enter them from the "Enter Readings" page first.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Name</th><th className="num">Consumption</th><th className="num">Fixed Fee</th><th className="num">Total</th><th>Status</th><th>Receipt</th></tr></thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.sub.id}>
                    <td>{row.sub.name}</td>
                    <td className="num">{row.reading.consumption} kWh</td>
                    <td className="num">
                      {fmtMoney2(row.reading.fixedFee)}
                      {row.reading.feeEdited && (
                        <span className="badge expiring" style={{ marginInlineStart: 6 }} title={row.reading.editedBy ? `Edited by ${row.reading.editedBy}` : "Fixed fee edited"}>
                          Edited{row.reading.editedBy ? ` · ${row.reading.editedBy}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="num">{fmtMoney2(row.reading.total)}</td>
                    <td>
                      <button
                        className={"badge " + (row.reading.paid === "Paid" ? "paid" : "unpaid")}
                        style={{ border: "none" }}
                        onClick={() => togglePaid(row.reading)}
                      >
                        {row.reading.paid === "Paid" ? "Paid" : "Unpaid"}
                      </button>
                    </td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => setPreviewSub(row)}>Preview</button>
                      <button className="btn btn-sm" disabled={busy} onClick={() => downloadSingle(row)}>PDF</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {previewSub && (
        <div className="panel-card" style={{ maxWidth: 640 }}>
          <h3 style={{ justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="eyebrow-dot"></span>Receipt Preview</span>
            <button className="btn btn-sm" onClick={() => setPreviewSub(null)}>Close</button>
          </h3>
          <ReceiptTemplate sub={previewSub.sub} reading={previewSub.reading} receiptNo={previewSub.reading.receiptNo || (previewSub.sub.meter + "-" + previewSub.reading.date.replace(/-/g, ""))} />
        </div>
      )}

      {/* off-screen render target used for PDF capture */}
      <div style={{ position: "fixed", top: -9999, left: -9999 }}>
        <div ref={hiddenRef}>
          {renderTarget && <ReceiptTemplate sub={renderTarget.sub} reading={renderTarget.reading} receiptNo={renderTarget.receiptNo} />}
        </div>
      </div>

      {busy && <div className="toast">{progress}</div>}
    </div>
  );
}
// ==================== ROOT APP ====================
function App() {
  const [user, setUser] = React.useState(null);
  const [view, setView] = React.useState("dashboard");
  const store = useStore();

  function handleLogin(u) {
    setUser(u);
    setView(u.role === "wissam" ? "entry" : "dashboard");
  }

  function handleLogout() {
    setUser(null);
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  let body = null;
  if (view === "dashboard" && user.role === "owner") body = <DashboardView data={store.data} />;
  else if (view === "entry") body = <EntryView data={store.data} store={store} user={user} />;
  else if (view === "subscribers") body = <SubscribersView data={store.data} store={store} />;
  else if (view === "expenses" && user.role === "owner") body = <ExpensesView data={store.data} store={store} />;
  else if (view === "contracts" && user.role === "owner") body = <ContractsView data={store.data} store={store} />;
  else if (view === "receipts" && user.role === "owner") body = <ReceiptsView data={store.data} store={store} />;
  else body = <EntryView data={store.data} store={store} user={user} />;

  return (
    <div className="app-shell">
      <BreakerPanel user={user} view={view} setView={setView} onLogout={handleLogout} />
      <div className="content">{body}</div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);

