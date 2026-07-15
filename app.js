// ==================== UTILITIES ====================
const MONTHS_AR = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_ARABIC = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];
function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}
function ymKey(y, m) {
  return y * 100 + m;
}
function monthLabel(y, m) {
  return MONTHS_AR[m - 1] + " " + y;
}
function monthLabelArabic(y, m) {
  return MONTHS_ARABIC[m - 1] + " " + y;
}
function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}
function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return "$0";
  const r = Math.round(n);
  return "$" + r.toLocaleString("en-US");
}
function fmtMoney2(n) {
  if (n === null || n === undefined || isNaN(n)) return "$0.00";
  return "$" + Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// English number-to-words for USD amounts, matching "Only One Hundred Nine USD" style
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
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
  return data.tariff[key] !== undefined ? data.tariff[key] : sub.fixedFee || 0;
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
function sumBy(arr, fn) {
  return arr.reduce((s, x) => s + (fn(x) || 0), 0);
}
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
      subscribers: seed.subscribers.map(s => ({
        ...s
      })),
      readings: seed.readings.map(r => ({
        ...r
      })),
      expenses: seed.expenses.map(e => ({
        ...e
      })),
      contracts: seed.contracts.map(c => ({
        ...c
      })),
      prices: seed.prices.map(p => ({
        ...p
      })),
      generatorLogs: (seed.generatorLogs || []).map(g => ({
        ...g
      })),
      tariff: {
        ...seed.tariff
      }
    };
  });
  const addOrUpdateReading = React.useCallback(reading => {
    // FIREBASE: setDoc(doc(db, "readings", `${reading.subId}_${reading.date}`), reading)
    setData(prev => {
      const idx = prev.readings.findIndex(r => r.subId === reading.subId && r.date === reading.date);
      const next = [...prev.readings];
      if (idx >= 0) next[idx] = {
        ...next[idx],
        ...reading
      };else next.push(reading);
      return {
        ...prev,
        readings: next
      };
    });
  }, []);
  const addExpense = React.useCallback(expense => {
    // FIREBASE: addDoc(collection(db, "expenses"), expense)
    setData(prev => ({
      ...prev,
      expenses: [...prev.expenses, expense]
    }));
  }, []);
  const addContract = React.useCallback(contract => {
    // FIREBASE: addDoc(collection(db, "contracts"), contract)
    setData(prev => ({
      ...prev,
      contracts: [...prev.contracts, contract]
    }));
  }, []);
  const addSubscriber = React.useCallback(sub => {
    // FIREBASE: addDoc(collection(db, "subscribers"), sub)
    setData(prev => ({
      ...prev,
      subscribers: [...prev.subscribers, sub]
    }));
  }, []);
  const updateSubscriber = React.useCallback((id, patch) => {
    // FIREBASE: updateDoc(doc(db, "subscribers", String(id)), patch)
    setData(prev => ({
      ...prev,
      subscribers: prev.subscribers.map(s => s.id === id ? {
        ...s,
        ...patch
      } : s)
    }));
  }, []);
  const setPriceForMonth = React.useCallback((year, month, price) => {
    // FIREBASE: setDoc(doc(db, "settings", `${year}_${month}`), { price })
    setData(prev => {
      const idx = prev.prices.findIndex(p => p.year === year && p.month === month);
      const next = [...prev.prices];
      if (idx >= 0) next[idx] = {
        ...next[idx],
        price
      };else next.push({
        year,
        month,
        price
      });
      return {
        ...prev,
        prices: next
      };
    });
  }, []);
  const setGeneratorLog = React.useCallback((year, month, patch) => {
    // FIREBASE: setDoc(doc(db, "generatorLogs", `${year}_${month}`), patch)
    setData(prev => {
      const idx = prev.generatorLogs.findIndex(g => g.year === year && g.month === month);
      const next = [...prev.generatorLogs];
      if (idx >= 0) next[idx] = {
        ...next[idx],
        ...patch
      };else next.push({
        year,
        month,
        ...patch
      });
      return {
        ...prev,
        generatorLogs: next
      };
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
    setGeneratorLog
  };
}
// ==================== LOGIN ====================
const DEMO_USERS = {
  wissam: {
    username: "wissam",
    password: "1234",
    role: "wissam",
    name: "Wissam Kabbara"
  },
  owner: {
    username: "admin",
    password: "1234",
    role: "owner",
    name: "System Administrator"
  }
};
function LoginScreen({
  onLogin
}) {
  const [role, setRole] = React.useState("wissam");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  function handleSubmit(e) {
    e.preventDefault();
    const u = DEMO_USERS[role];
    if (username.trim() === u.username && password === u.password) {
      setError("");
      onLogin({
        role: u.role,
        name: u.name
      });
    } else {
      setError("Incorrect username or password.");
    }
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "login-screen"
  }, /*#__PURE__*/React.createElement("div", {
    className: "login-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "login-eyebrow"
  }, "METER · 224"), /*#__PURE__*/React.createElement("div", {
    className: "login-title-center"
  }, "Sign In"), /*#__PURE__*/React.createElement("div", {
    className: "role-pills"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "role-pill" + (role === "wissam" ? " active" : ""),
    onClick: () => {
      setRole("wissam");
      setError("");
    }
  }, "Wissam"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "role-pill" + (role === "owner" ? " active" : ""),
    onClick: () => {
      setRole("owner");
      setError("");
    }
  }, "Owner")), /*#__PURE__*/React.createElement("div", {
    className: "login-divider"
  }, "or sign in with your ", role === "wissam" ? "meter" : "owner", " credentials:"), /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSubmit
  }, /*#__PURE__*/React.createElement("div", {
    className: "icon-field"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "8",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 20c0-4 4-6 8-6s8 2 8 6"
  })), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    value: username,
    onChange: e => setUsername(e.target.value),
    placeholder: role === "wissam" ? "wissam" : "admin"
  })), /*#__PURE__*/React.createElement("div", {
    className: "icon-field"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "5",
    y: "11",
    width: "14",
    height: "9",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 11V7a4 4 0 0 1 8 0v4"
  })), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    type: "password",
    value: password,
    onChange: e => setPassword(e.target.value),
    placeholder: "Password"
  })), error && /*#__PURE__*/React.createElement("div", {
    className: "login-error"
  }, error), /*#__PURE__*/React.createElement("button", {
    className: "btn-pill",
    type: "submit"
  }, "Log In")), /*#__PURE__*/React.createElement("div", {
    className: "login-hint"
  }, /*#__PURE__*/React.createElement("b", null, "Demo mode:"), " username ", /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, role === "wissam" ? "wissam" : "admin"), " and password ", /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, "1234"), ". After connecting the site to Firebase, this screen becomes a real login with actual accounts for each person.")));
}

// ==================== APP SHELL ====================
const NAV_ITEMS = {
  wissam: [{
    id: "entry",
    label: "Enter Readings"
  }, {
    id: "subscribers",
    label: "Subscribers"
  }],
  owner: [{
    id: "dashboard",
    label: "Dashboard"
  }, {
    id: "entry",
    label: "Enter Readings"
  }, {
    id: "subscribers",
    label: "Subscribers"
  }, {
    id: "expenses",
    label: "Expenses"
  }, {
    id: "contracts",
    label: "Maintenance Contracts"
  }, {
    id: "receipts",
    label: "Receipts"
  }]
};
function BreakerPanel({
  user,
  view,
  setView,
  onLogout
}) {
  const items = NAV_ITEMS[user.role];
  const [mobileOpen, setMobileOpen] = React.useState(false);
  function selectView(id) {
    setView(id);
    setMobileOpen(false);
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "breaker-panel" + (mobileOpen ? " mobile-open" : "")
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand-badge-sm"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M13 2 4 14h6l-1 8 9-12h-6l1-8Z",
    fill: "var(--filament)",
    stroke: "var(--filament)",
    strokeWidth: "1",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "brand-text"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand-mark"
  }, "METER · 224"), /*#__PURE__*/React.createElement("div", {
    className: "brand-name"
  }, "Electricity Meter System"))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mobile-menu-toggle",
    onClick: () => setMobileOpen(o => !o),
    "aria-label": "Toggle menu"
  }, mobileOpen ? /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 6l12 12M18 6 6 18"
  })) : /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 6h16M4 12h16M4 18h16"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "nav-label"
  }, "Menu"), /*#__PURE__*/React.createElement("div", {
    className: "nav-group"
  }, items.map(item => /*#__PURE__*/React.createElement("button", {
    key: item.id,
    className: "switch-item" + (view === item.id ? " active" : ""),
    onClick: () => selectView(item.id)
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), item.label))), /*#__PURE__*/React.createElement("div", {
    className: "panel-footer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nav-label",
    style: {
      padding: 0,
      marginBottom: 10
    }
  }, "General"), /*#__PURE__*/React.createElement("div", {
    className: "user-chip"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot",
    style: {
      background: "var(--filament)",
      width: 7,
      height: 7,
      borderRadius: "50%"
    }
  }), user.name), /*#__PURE__*/React.createElement("button", {
    className: "logout-btn",
    onClick: onLogout
  }, "Log out")));
}
// ==================== MONTH PICKER ====================
function MonthPicker({
  year,
  month,
  setYear,
  setMonth,
  minYear = 2024,
  maxYear = 2026,
  allowAllYears = false,
  allowAllMonths = false
}) {
  const years = [];
  for (let y = minYear; y <= maxYear; y++) years.push(y);
  return /*#__PURE__*/React.createElement("div", {
    className: "month-picker"
  }, /*#__PURE__*/React.createElement("select", {
    value: year,
    onChange: e => setYear(e.target.value === "all" ? "all" : Number(e.target.value))
  }, allowAllYears && /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All Years"), years.map(y => /*#__PURE__*/React.createElement("option", {
    key: y,
    value: y
  }, y))), /*#__PURE__*/React.createElement("select", {
    value: month,
    onChange: e => setMonth(e.target.value === "all" ? "all" : Number(e.target.value)),
    disabled: year === "all"
  }, allowAllMonths && /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All Months"), MONTHS_AR.map((m, i) => /*#__PURE__*/React.createElement("option", {
    key: i,
    value: i + 1
  }, m))));
}
// ==================== KWH PRICE EDITOR ====================
function PriceEditor({
  year,
  month,
  data,
  store
}) {
  const currentPrice = getPrice(data, year, month);
  const [draft, setDraft] = React.useState(String(currentPrice));
  const [saved, setSaved] = React.useState(false);
  React.useEffect(() => {
    setDraft(String(currentPrice));
  }, [year, month, currentPrice]);
  function apply() {
    const val = Number(draft);
    if (draft === "" || isNaN(val) || val < 0) return;
    store.setPriceForMonth(year, month, val);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "price-editor"
  }, /*#__PURE__*/React.createElement("label", null, "kWh Price ($)"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("input", {
    className: "entry-input",
    type: "number",
    step: "0.01",
    min: "0",
    value: draft,
    onChange: e => setDraft(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter") apply();
    },
    onBlur: apply
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-sm",
    onClick: apply
  }, saved ? "Saved" : "Apply")));
}
// ==================== KPI ARROW ICON ====================
function KpiArrowIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 17 17 7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 7h10v10"
  }));
}
// ==================== METER DIAL (signature element) ====================
function MeterDial({
  value,
  max,
  label,
  unit = "kWh"
}) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const angle = -90 + pct * 180; // -90 (empty, left) .. +90 (full, right)
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  function tickPoint(p, r) {
    const a = (-90 + p * 180) * (Math.PI / 180);
    return {
      x: 100 + r * Math.sin(a),
      y: 100 - r * Math.cos(a)
    };
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "dial-wrap"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "200",
    height: "120",
    viewBox: "0 0 200 120"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 20 100 A 80 80 0 0 1 180 100",
    fill: "none",
    stroke: "#DEE5E1",
    strokeWidth: "10",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: `M 20 100 A 80 80 0 0 1 ${100 + 80 * Math.sin((-90 + pct * 180) * Math.PI / 180)} ${100 - 80 * Math.cos((-90 + pct * 180) * Math.PI / 180)}`,
    fill: "none",
    stroke: "#22A566",
    strokeWidth: "10",
    strokeLinecap: "round"
  }), ticks.map((t, i) => {
    const p1 = tickPoint(t, 68);
    const p2 = tickPoint(t, 80);
    return /*#__PURE__*/React.createElement("line", {
      key: i,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      stroke: "#9AA1AC",
      strokeWidth: "2"
    });
  }), /*#__PURE__*/React.createElement("g", {
    className: "dial-needle",
    style: {
      transform: `rotate(${angle}deg)`
    }
  }, /*#__PURE__*/React.createElement("line", {
    x1: "100",
    y1: "100",
    x2: "100",
    y2: "34",
    stroke: "#10251C",
    strokeWidth: "3",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "100",
    cy: "100",
    r: "6",
    fill: "#10251C"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dial-value mono"
  }, Math.round(value).toLocaleString("en-US"), " ", unit), /*#__PURE__*/React.createElement("div", {
    className: "dial-caption"
  }, label));
}
// ==================== DASHBOARD ====================
function DashboardView({
  data
}) {
  const now = new Date();
  const [year, setYear] = React.useState(2026);
  const [month, setMonth] = React.useState(6);
  const [search, setSearch] = React.useState("");
  const [chartYear, setChartYear] = React.useState("all");
  const chartRef = React.useRef(null);
  const chartInstance = React.useRef(null);
  const isAllYears = year === "all";
  const isAllMonths = month === "all";
  const isAggregate = isAllYears || isAllMonths;
  const periodLabel = isAllYears ? "(All Years)" : isAllMonths ? String(year) : monthLabel(year, month);
  const monthReadings = React.useMemo(() => {
    if (isAllYears) return data.readings;
    if (isAllMonths) return data.readings.filter(r => r.date.startsWith(String(year)));
    return readingsForMonth(data, year, month);
  }, [data, year, month, isAllYears, isAllMonths]);
  const monthExpenses = React.useMemo(() => {
    if (isAllYears) return data.expenses;
    if (isAllMonths) return data.expenses.filter(e => e.date.startsWith(String(year)));
    return expensesForMonth(data, year, month);
  }, [data, year, month, isAllYears, isAllMonths]);
  const activeCount = activeSubscribers(data).length;
  const totalCount = data.subscribers.length;
  const collected = sumBy(monthReadings.filter(r => r.paid === "Paid"), r => r.total);
  const unpaid = sumBy(monthReadings.filter(r => r.paid !== "Paid"), r => r.total);
  const expensesTotal = sumBy(monthExpenses, e => e.amount);
  const net = collected - expensesTotal;
  const genLogs = React.useMemo(() => {
    if (isAllYears) return data.generatorLogs;
    if (isAllMonths) return data.generatorLogs.filter(g => g.year === year);
    return data.generatorLogs.filter(g => g.year === year && g.month === month);
  }, [data, year, month, isAllYears, isAllMonths]);
  const genHoursTotal = sumBy(genLogs, g => g.hours || 0);
  const genMonthPossibleHours = !isAggregate ? daysInMonth(year, month) * 24 : 0;
  const yearlyBreakdown = React.useMemo(() => {
    const years = [2024, 2025, 2026];
    const rows = years.map(y => {
      const yReadings = data.readings.filter(r => r.date.startsWith(String(y)));
      const yExpenses = data.expenses.filter(e => e.date.startsWith(String(y)));
      const yCollected = sumBy(yReadings.filter(r => r.paid === "Paid"), r => r.total);
      const yUnpaid = sumBy(yReadings.filter(r => r.paid !== "Paid"), r => r.total);
      const yExpensesTotal = sumBy(yExpenses, e => e.amount);
      return {
        year: y,
        collected: yCollected,
        unpaid: yUnpaid,
        expenses: yExpensesTotal,
        net: yCollected - yExpensesTotal
      };
    });
    const total = {
      collected: sumBy(rows, r => r.collected),
      unpaid: sumBy(rows, r => r.unpaid),
      expenses: sumBy(rows, r => r.expenses),
      net: sumBy(rows, r => r.net)
    };
    return {
      rows,
      total
    };
  }, [data]);

  // build monthly trend series (income vs expenses) across all months present
  const trend = React.useMemo(() => {
    let months;
    if (chartYear === "all") {
      months = allMonthsInRange(data);
    } else {
      months = [];
      for (let m = 1; m <= 12; m++) months.push(chartYear + "-" + pad2(m));
    }
    return months.map(ym => {
      const [y, m] = ym.split("-").map(Number);
      return {
        label: MONTHS_AR[m - 1].slice(0, 3) + " " + String(y).slice(2),
        income: sumBy(readingsForMonth(data, y, m), r => r.total),
        expense: sumBy(expensesForMonth(data, y, m), e => e.amount)
      };
    });
  }, [data, chartYear]);
  React.useEffect(() => {
    if (!chartRef.current) return;
    if (chartInstance.current) chartInstance.current.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "line",
      data: {
        labels: trend.map(t => t.label),
        datasets: [{
          label: "Collected",
          data: trend.map(t => t.income),
          borderColor: "#22A566",
          backgroundColor: "rgba(34,165,102,0.12)",
          tension: 0.3,
          fill: true,
          pointRadius: 0,
          borderWidth: 2
        }, {
          label: "Expenses",
          data: trend.map(t => t.expense),
          borderColor: "#B3261E",
          backgroundColor: "rgba(179,38,30,0.08)",
          tension: 0.3,
          fill: true,
          pointRadius: 0,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              font: {
                family: "IBM Plex Sans Arabic"
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              font: {
                family: "IBM Plex Mono"
              },
              maxRotation: 0,
              autoSkip: true
            }
          },
          y: {
            ticks: {
              font: {
                family: "IBM Plex Mono"
              },
              callback: v => "$" + v
            }
          }
        }
      }
    });
    return () => {
      if (chartInstance.current) chartInstance.current.destroy();
    };
  }, [trend]);
  const subRows = React.useMemo(() => {
    return data.subscribers.filter(s => s.name.toLowerCase().includes(search.toLowerCase())).map(s => {
      const totals = {};
      [2024, 2025, 2026].forEach(y => {
        totals[y] = sumBy(data.readings.filter(r => r.subId === s.id && r.date.startsWith(String(y))), r => r.total);
      });
      const grand = totals[2024] + totals[2025] + totals[2026];
      return {
        ...s,
        totals,
        grand
      };
    }).sort((a, b) => b.grand - a.grand);
  }, [data, search]);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "page-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "page-eyebrow"
  }, "OWNER · OVERVIEW"), /*#__PURE__*/React.createElement("div", {
    className: "page-title"
  }, "Dashboard"), /*#__PURE__*/React.createElement("div", {
    className: "page-desc"
  }, "Full overview of collections and expenses — choose a month, All Months for a year's total, or All Years for a lifetime total")), /*#__PURE__*/React.createElement(MonthPicker, {
    year: year,
    month: month,
    setYear: setYear,
    setMonth: setMonth,
    allowAllYears: true,
    allowAllMonths: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kpi-card kpi-hero accent-ink"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kpi-icon"
  }, /*#__PURE__*/React.createElement(KpiArrowIcon, null)), /*#__PURE__*/React.createElement("div", {
    className: "kpi-label"
  }, "Subscribers (All)"), /*#__PURE__*/React.createElement("div", {
    className: "kpi-value"
  }, totalCount), /*#__PURE__*/React.createElement("div", {
    className: "kpi-bar"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-card accent-teal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kpi-icon"
  }, /*#__PURE__*/React.createElement(KpiArrowIcon, null)), /*#__PURE__*/React.createElement("div", {
    className: "kpi-label"
  }, "Active Now"), /*#__PURE__*/React.createElement("div", {
    className: "kpi-value"
  }, activeCount), /*#__PURE__*/React.createElement("div", {
    className: "kpi-bar"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-card accent-filament"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kpi-icon"
  }, /*#__PURE__*/React.createElement(KpiArrowIcon, null)), /*#__PURE__*/React.createElement("div", {
    className: "kpi-label"
  }, "Collected ", periodLabel), /*#__PURE__*/React.createElement("div", {
    className: "kpi-value"
  }, fmtMoney(collected)), /*#__PURE__*/React.createElement("div", {
    className: "kpi-bar"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-card accent-rust"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kpi-icon"
  }, /*#__PURE__*/React.createElement(KpiArrowIcon, null)), /*#__PURE__*/React.createElement("div", {
    className: "kpi-label"
  }, "Unpaid"), /*#__PURE__*/React.createElement("div", {
    className: "kpi-value"
  }, fmtMoney(unpaid)), /*#__PURE__*/React.createElement("div", {
    className: "kpi-bar"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-card accent-rust"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kpi-icon"
  }, /*#__PURE__*/React.createElement(KpiArrowIcon, null)), /*#__PURE__*/React.createElement("div", {
    className: "kpi-label"
  }, "Expenses ", periodLabel), /*#__PURE__*/React.createElement("div", {
    className: "kpi-value"
  }, fmtMoney(expensesTotal)), /*#__PURE__*/React.createElement("div", {
    className: "kpi-bar"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-card accent-teal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kpi-icon"
  }, /*#__PURE__*/React.createElement(KpiArrowIcon, null)), /*#__PURE__*/React.createElement("div", {
    className: "kpi-label"
  }, "Net (Collected − Expenses)"), /*#__PURE__*/React.createElement("div", {
    className: "kpi-value"
  }, fmtMoney(net)), /*#__PURE__*/React.createElement("div", {
    className: "kpi-bar"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "panel-card",
    style: {
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("h3", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow-dot"
  }), "Totals by Year"), /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "data-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Metric"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "2024"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "2025"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "2026"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Total"))), /*#__PURE__*/React.createElement("tbody", null, [{
    key: "collected",
    label: "Collected"
  }, {
    key: "unpaid",
    label: "Unpaid"
  }, {
    key: "expenses",
    label: "Expenses"
  }, {
    key: "net",
    label: "Net"
  }].map(m => /*#__PURE__*/React.createElement("tr", {
    key: m.key
  }, /*#__PURE__*/React.createElement("td", null, m.label), yearlyBreakdown.rows.map(r => /*#__PURE__*/React.createElement("td", {
    className: "num",
    key: r.year
  }, fmtMoney(r[m.key]))), /*#__PURE__*/React.createElement("td", {
    className: "num",
    style: {
      fontWeight: 700
    }
  }, fmtMoney(yearlyBreakdown.total[m.key])))))))), /*#__PURE__*/React.createElement("div", {
    className: "grid-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-card"
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow-dot"
  }), "Collected vs. Expenses ", chartYear === "all" ? "— All Recorded Months" : "— " + chartYear), /*#__PURE__*/React.createElement("div", {
    className: "month-picker"
  }, /*#__PURE__*/React.createElement("select", {
    value: chartYear,
    onChange: e => setChartYear(e.target.value === "all" ? "all" : Number(e.target.value))
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All Years"), /*#__PURE__*/React.createElement("option", {
    value: 2024
  }, "2024"), /*#__PURE__*/React.createElement("option", {
    value: 2025
  }, "2025"), /*#__PURE__*/React.createElement("option", {
    value: 2026
  }, "2026")))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 280
    }
  }, /*#__PURE__*/React.createElement("canvas", {
    ref: chartRef
  }))), /*#__PURE__*/React.createElement("div", {
    className: "panel-card"
  }, /*#__PURE__*/React.createElement("h3", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow-dot"
  }), isAggregate ? "Total Generator Running Time" : "Generator Running Time"), isAggregate ? /*#__PURE__*/React.createElement("div", {
    className: "dial-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dial-value mono",
    style: {
      fontSize: 34,
      marginTop: 24
    }
  }, Math.round(genHoursTotal).toLocaleString("en-US"), " hrs"), /*#__PURE__*/React.createElement("div", {
    className: "dial-caption"
  }, isAllYears ? "All recorded years" : "All months in " + year)) : /*#__PURE__*/React.createElement(MeterDial, {
    value: genHoursTotal,
    max: genMonthPossibleHours,
    unit: "hrs",
    label: monthLabel(year, month) + " — " + Math.round(genHoursTotal / genMonthPossibleHours * 100) + "% utilization"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "panel-card"
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow-dot"
  }), "Total per Subscriber by Year"), /*#__PURE__*/React.createElement("input", {
    className: "search-input",
    placeholder: "Search by name...",
    value: search,
    onChange: e => setSearch(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "data-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Name"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "2024"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "2025"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "2026"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Total"))), /*#__PURE__*/React.createElement("tbody", null, subRows.map(s => /*#__PURE__*/React.createElement("tr", {
    key: s.id
  }, /*#__PURE__*/React.createElement("td", null, s.name), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "badge " + (s.active === "Active" ? "active" : "inactive")
  }, s.active)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, fmtMoney(s.totals[2024])), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, fmtMoney(s.totals[2025])), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, fmtMoney(s.totals[2026])), /*#__PURE__*/React.createElement("td", {
    className: "num",
    style: {
      fontWeight: 700
    }
  }, fmtMoney(s.grand)))))))));
}
// ==================== ENTRY VIEW (Wissam) ====================
function EntryView({
  data,
  store,
  user
}) {
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
      const prev = existing ? existing.prev : last ? last.curr : 0;
      const draft = drafts[s.id];
      const curr = draft !== undefined ? draft : existing ? existing.curr : "";
      const price = getPrice(data, year, month);
      const defaultFee = getFixedFee(data, s);
      const feeDraft = feeDrafts[s.id];
      const fixedFee = feeDraft !== undefined ? feeDraft === "" ? 0 : Number(feeDraft) : existing && existing.fixedFee !== undefined ? existing.fixedFee : defaultFee;
      const feeEdited = fixedFee !== defaultFee;
      const consumption = curr !== "" && !isNaN(curr) ? Number(curr) - prev : null;
      const total = consumption !== null ? computeTotal(consumption, price, fixedFee) : null;
      return {
        sub: s,
        existing,
        prev,
        curr,
        price,
        fixedFee,
        feeEdited,
        consumption,
        total
      };
    });
  }, [subs, data, dateStr, drafts, feeDrafts, year, month]);
  const enteredCount = rows.filter(r => r.existing).length;
  const displayRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(row => {
      if (remainingOnly && row.existing) return false;
      if (!q) return true;
      return row.sub.name.toLowerCase().includes(q) || String(row.sub.panel).toLowerCase().includes(q) || String(row.sub.meter).toLowerCase().includes(q);
    });
  }, [rows, search, remainingOnly]);
  function setDraft(subId, val) {
    setDrafts(d => ({
      ...d,
      [subId]: val
    }));
  }
  function setFeeDraft(subId, val) {
    setFeeDrafts(d => ({
      ...d,
      [subId]: val
    }));
  }
  function changeAmp(row, newAmp) {
    store.updateSubscriber(row.sub.id, {
      A: Number(newAmp),
      fixedFee: data.tariff[newAmp]
    });
    // the fixed fee follows the new amp's tariff price, so drop any manual override for this row
    setFeeDrafts(d => {
      const next = {
        ...d
      };
      delete next[row.sub.id];
      return next;
    });
  }
  function focusReadingInput(subId) {
    const el = inputRefs.current[subId];
    if (el) {
      el.focus();
      el.select();
    }
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
      editedBy: row.feeEdited ? user.name : row.existing ? row.existing.editedBy : undefined,
      total: row.total,
      totalRounded: Math.ceil(row.total),
      receiptNo: row.existing ? row.existing.receiptNo : "",
      paid: row.existing ? row.existing.paid : "Paid",
      payMethod: "Cash"
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
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "page-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "page-eyebrow"
  }, "DATA ENTRY · ", user.name), /*#__PURE__*/React.createElement("div", {
    className: "page-title"
  }, "Monthly Reading Entry"), /*#__PURE__*/React.createElement("div", {
    className: "page-desc"
  }, "Choose the month, enter the current meter reading for each subscriber — Total = Consumption × kWh Price + Fixed Fee, rounded up to the next dollar")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 14,
      alignItems: "flex-end",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement(PriceEditor, {
    year: year,
    month: month,
    data: data,
    store: store
  }), /*#__PURE__*/React.createElement(MonthPicker, {
    year: year,
    month: month,
    setYear: setYear,
    setMonth: setMonth
  }))), /*#__PURE__*/React.createElement("div", {
    className: "demo-banner"
  }, "Currently in demo mode: readings are saved in browser memory for this session only. After connecting the site to Firebase, they'll be saved permanently and appear immediately for the owner."), /*#__PURE__*/React.createElement("div", {
    className: "panel-card"
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow-dot"
  }), monthLabel(year, month), " — ", enteredCount, "/", rows.length, " entered"), /*#__PURE__*/React.createElement("input", {
    className: "search-input",
    placeholder: "Search by name, panel or meter...",
    value: search,
    onChange: e => setSearch(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "chip-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "chip" + (!remainingOnly ? " active" : ""),
    onClick: () => setRemainingOnly(false)
  }, "All (", rows.length, ")"), /*#__PURE__*/React.createElement("button", {
    className: "chip" + (remainingOnly ? " active" : ""),
    onClick: () => setRemainingOnly(true)
  }, "Remaining (", rows.length - enteredCount, ")")), /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "data-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "#"), /*#__PURE__*/React.createElement("th", null, "Name"), /*#__PURE__*/React.createElement("th", null, "Panel No."), /*#__PURE__*/React.createElement("th", null, "Meter No."), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Previous Reading"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Current Reading"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Consumption"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Amp"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Fixed Fee"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Total"), /*#__PURE__*/React.createElement("th", null, "Save"))), /*#__PURE__*/React.createElement("tbody", null, displayRows.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: 11,
    style: {
      textAlign: "center",
      color: "var(--slate)",
      padding: "24px 12px"
    }
  }, remainingOnly ? "All subscribers have a reading for this month." : "No subscribers match your search.")), displayRows.map((row, idx) => /*#__PURE__*/React.createElement("tr", {
    key: row.sub.id,
    className: row.existing ? "row-saved" : ""
  }, /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, row.sub.id), /*#__PURE__*/React.createElement("td", null, row.sub.name), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, row.sub.panel), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, row.sub.meter), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, row.prev.toLocaleString("en-US")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("input", {
    ref: el => inputRefs.current[row.sub.id] = el,
    className: "entry-input",
    type: "number",
    inputMode: "decimal",
    value: row.curr,
    onChange: e => setDraft(row.sub.id, e.target.value),
    onKeyDown: e => handleReadingKeyDown(e, row, idx),
    placeholder: "Enter reading"
  })), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, row.consumption !== null ? row.consumption.toLocaleString("en-US") : "—"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("select", {
    className: "entry-input",
    value: row.sub.A,
    onChange: e => changeAmp(row, e.target.value)
  }, Object.keys(data.tariff).map(a => /*#__PURE__*/React.createElement("option", {
    key: a,
    value: a
  }, a, "A")))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("input", {
    className: "entry-input",
    type: "number",
    step: "0.01",
    value: feeDrafts[row.sub.id] !== undefined ? feeDrafts[row.sub.id] : row.fixedFee,
    onChange: e => setFeeDraft(row.sub.id, e.target.value),
    style: row.feeEdited ? {
      borderColor: "var(--filament)",
      background: "var(--filament-soft)"
    } : undefined,
    title: row.feeEdited ? "Fixed fee changed from the default subscription rate" : ""
  })), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, row.total !== null ? fmtMoney(Math.ceil(row.total)) : "—"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-sm",
    disabled: row.curr === "" || isNaN(row.curr),
    onClick: () => saveRow(row)
  }, row.existing ? "Update" : "Save"))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      display: "flex",
      justifyContent: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-dark",
    onClick: saveAll
  }, "Save All New Readings"))), toast && /*#__PURE__*/React.createElement("div", {
    className: "toast"
  }, toast));
}
// ==================== SUBSCRIBERS VIEW ====================
function SubscribersView({
  data,
  store
}) {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState(null);
  const blankForm = {
    name: "",
    status: "External",
    panel: "",
    meter: "",
    A: "10",
    notes: ""
  };
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
    setForm({
      name: s.name,
      status: s.status,
      panel: s.panel,
      meter: s.meter,
      A: String(s.A),
      notes: s.notes || ""
    });
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
        notes: form.notes
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
        notes: form.notes || "Added via the website"
      });
    }
    closeForm();
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "page-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "page-eyebrow"
  }, "SUBSCRIBERS · ", data.subscribers.length), /*#__PURE__*/React.createElement("div", {
    className: "page-title"
  }, "Subscribers"), /*#__PURE__*/React.createElement("div", {
    className: "page-desc"
  }, "Full list — active and inactive, with subscription category and meter number")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-dark",
    onClick: () => showForm ? closeForm() : openAddForm()
  }, showForm ? "Close" : "+ Add Subscriber")), showForm && /*#__PURE__*/React.createElement("div", {
    className: "panel-card",
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h3", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow-dot"
  }), editingId != null ? "Edit Subscriber" : "New Subscriber"), /*#__PURE__*/React.createElement("form", {
    onSubmit: submitForm
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Name"), /*#__PURE__*/React.createElement("input", {
    value: form.name,
    onChange: e => setForm(f => ({
      ...f,
      name: e.target.value
    })),
    required: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Status"), /*#__PURE__*/React.createElement("select", {
    value: form.status,
    onChange: e => setForm(f => ({
      ...f,
      status: e.target.value
    }))
  }, /*#__PURE__*/React.createElement("option", {
    value: "External"
  }, "External"), /*#__PURE__*/React.createElement("option", {
    value: "Internal"
  }, "Internal"))), /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Subscription Category (A)"), /*#__PURE__*/React.createElement("select", {
    value: form.A,
    onChange: e => setForm(f => ({
      ...f,
      A: e.target.value
    }))
  }, Object.keys(data.tariff).map(a => /*#__PURE__*/React.createElement("option", {
    key: a,
    value: a
  }, a, " — ", fmtMoney2(data.tariff[a]))))), /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Panel No."), /*#__PURE__*/React.createElement("input", {
    value: form.panel,
    onChange: e => setForm(f => ({
      ...f,
      panel: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Meter No."), /*#__PURE__*/React.createElement("input", {
    value: form.meter,
    onChange: e => setForm(f => ({
      ...f,
      meter: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Notes"), /*#__PURE__*/React.createElement("input", {
    value: form.notes,
    onChange: e => setForm(f => ({
      ...f,
      notes: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-dark",
    type: "submit"
  }, editingId != null ? "Save Changes" : "Save Subscriber"), editingId != null && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "btn btn-sm",
    style: {
      marginInlineStart: 8
    },
    onClick: closeForm
  }, "Cancel"))), /*#__PURE__*/React.createElement("div", {
    className: "chip-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "chip" + (filter === "all" ? " active" : ""),
    onClick: () => setFilter("all")
  }, "All (", data.subscribers.length, ")"), /*#__PURE__*/React.createElement("button", {
    className: "chip" + (filter === "active" ? " active" : ""),
    onClick: () => setFilter("active")
  }, "Active (", activeSubscribers(data).length, ")"), /*#__PURE__*/React.createElement("button", {
    className: "chip" + (filter === "inactive" ? " active" : ""),
    onClick: () => setFilter("inactive")
  }, "Inactive (", data.subscribers.length - activeSubscribers(data).length, ")"), /*#__PURE__*/React.createElement("input", {
    className: "search-input",
    placeholder: "Search by name...",
    value: search,
    onChange: e => setSearch(e.target.value),
    style: {
      marginInlineStart: "auto"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "panel-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "data-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "#"), /*#__PURE__*/React.createElement("th", null, "Name"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null, "Panel No."), /*#__PURE__*/React.createElement("th", null, "Meter No."), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Category A"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Fixed Fee"), /*#__PURE__*/React.createElement("th", null, "Active?"), /*#__PURE__*/React.createElement("th", null, "Notes"), /*#__PURE__*/React.createElement("th", null, "Actions"))), /*#__PURE__*/React.createElement("tbody", null, rows.map(s => /*#__PURE__*/React.createElement("tr", {
    key: s.id
  }, /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, s.id), /*#__PURE__*/React.createElement("td", null, s.name), /*#__PURE__*/React.createElement("td", null, s.status), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, s.panel), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, s.meter), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, s.A), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, fmtMoney2(getFixedFee(data, s))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
    className: "badge " + (s.active === "Active" ? "active" : "inactive"),
    style: {
      border: "none"
    },
    onClick: () => store.updateSubscriber(s.id, {
      active: s.active === "Active" ? "Inactive" : "Active"
    })
  }, s.active)), /*#__PURE__*/React.createElement("td", {
    style: {
      whiteSpace: "normal",
      maxWidth: 220
    }
  }, s.notes), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-sm",
    onClick: () => openEditForm(s)
  }, "Edit")))))))));
}
// ==================== EXPENSES VIEW ====================
const EXPENSE_CATEGORIES = ["Fixed Salaries", "Generator Maintenance Contract", "استهلاك مازوت", "Electrical Maintenance", "Generator Maintenance (Repairs)", "Solar Power System Consumption", "Diesel (Purchase)", "Panel Washing", "Camera Installation", "Miscellaneous Expenses", "Other"];
function ExpensesView({
  data,
  store
}) {
  const [year, setYear] = React.useState(2026);
  const [month, setMonth] = React.useState(6);
  const [form, setForm] = React.useState({
    label: EXPENSE_CATEGORIES[0],
    amount: "",
    notes: ""
  });
  const [genForm, setGenForm] = React.useState({
    hours: "",
    liters: "",
    notes: ""
  });
  const monthExpenses = React.useMemo(() => expensesForMonth(data, year, month), [data, year, month]);
  const total = sumBy(monthExpenses, e => e.amount);
  const yearTotal = React.useMemo(() => {
    return sumBy(data.expenses.filter(e => e.date.startsWith(String(year))), e => e.amount);
  }, [data, year]);
  const currentGenLog = React.useMemo(() => {
    return data.generatorLogs.find(g => g.year === year && g.month === month);
  }, [data, year, month]);
  const yearGenLogs = React.useMemo(() => data.generatorLogs.filter(g => g.year === year), [data, year]);
  const yearGenHours = sumBy(yearGenLogs, g => g.hours || 0);
  const yearGenPossibleHours = sumBy(yearGenLogs, g => daysInMonth(g.year, g.month) * 24);
  const yearGenRate = yearGenPossibleHours > 0 ? Math.round(yearGenHours / yearGenPossibleHours * 100) : 0;
  React.useEffect(() => {
    setGenForm({
      hours: currentGenLog && currentGenLog.hours !== undefined ? String(currentGenLog.hours) : "",
      liters: currentGenLog && currentGenLog.liters !== undefined ? String(currentGenLog.liters) : "",
      notes: currentGenLog ? currentGenLog.notes || "" : ""
    });
  }, [year, month, currentGenLog]);
  function submitForm(e) {
    e.preventDefault();
    if (!form.amount || isNaN(form.amount)) return;
    store.addExpense({
      date: year + "-" + pad2(month) + "-01",
      label: form.label,
      amount: Number(form.amount),
      notes: form.notes
    });
    setForm({
      label: EXPENSE_CATEGORIES[0],
      amount: "",
      notes: ""
    });
  }
  function submitGenForm(e) {
    e.preventDefault();
    if (genForm.hours === "" && genForm.liters === "") return;
    store.setGeneratorLog(year, month, {
      hours: genForm.hours === "" ? 0 : Number(genForm.hours),
      liters: genForm.liters === "" ? 0 : Number(genForm.liters),
      notes: genForm.notes
    });
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "page-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "page-eyebrow"
  }, "EXPENSES"), /*#__PURE__*/React.createElement("div", {
    className: "page-title"
  }, "Monthly Expenses"), /*#__PURE__*/React.createElement("div", {
    className: "page-desc"
  }, "Salaries, maintenance, diesel costs, and generator running hours — by month")), /*#__PURE__*/React.createElement(MonthPicker, {
    year: year,
    month: month,
    setYear: setYear,
    setMonth: setMonth
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-grid",
    style: {
      gridTemplateColumns: "repeat(2, 1fr)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "kpi-card accent-rust"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kpi-label"
  }, "Expenses ", monthLabel(year, month)), /*#__PURE__*/React.createElement("div", {
    className: "kpi-value"
  }, fmtMoney(total)), /*#__PURE__*/React.createElement("div", {
    className: "kpi-bar"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-card accent-ink"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kpi-label"
  }, "Total Expenses for ", year), /*#__PURE__*/React.createElement("div", {
    className: "kpi-value"
  }, fmtMoney(yearTotal)), /*#__PURE__*/React.createElement("div", {
    className: "kpi-bar"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "panel-card",
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h3", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow-dot"
  }), "Add New Expense — ", monthLabel(year, month)), /*#__PURE__*/React.createElement("form", {
    onSubmit: submitForm
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Expense Type"), /*#__PURE__*/React.createElement("select", {
    value: form.label,
    onChange: e => setForm(f => ({
      ...f,
      label: e.target.value
    }))
  }, EXPENSE_CATEGORIES.map(c => /*#__PURE__*/React.createElement("option", {
    key: c,
    value: c
  }, c)))), /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Amount ($)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: form.amount,
    onChange: e => setForm(f => ({
      ...f,
      amount: e.target.value
    })),
    required: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Notes"), /*#__PURE__*/React.createElement("input", {
    value: form.notes,
    onChange: e => setForm(f => ({
      ...f,
      notes: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-dark",
    type: "submit"
  }, "Save Expense"))), /*#__PURE__*/React.createElement("div", {
    className: "kpi-grid",
    style: {
      gridTemplateColumns: "repeat(2, 1fr)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "kpi-card accent-teal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kpi-label"
  }, "Generator Hours ", year), /*#__PURE__*/React.createElement("div", {
    className: "kpi-value"
  }, yearGenHours.toLocaleString("en-US")), /*#__PURE__*/React.createElement("div", {
    className: "kpi-bar"
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-card accent-teal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kpi-label"
  }, "Utilization Rate ", year), /*#__PURE__*/React.createElement("div", {
    className: "kpi-value"
  }, yearGenRate, "%"), /*#__PURE__*/React.createElement("div", {
    className: "kpi-bar"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "panel-card",
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h3", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow-dot"
  }), "Generator Log — ", monthLabel(year, month)), /*#__PURE__*/React.createElement("form", {
    onSubmit: submitGenForm
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Running Hours"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    step: "0.1",
    min: "0",
    value: genForm.hours,
    onChange: e => setGenForm(f => ({
      ...f,
      hours: e.target.value
    })),
    placeholder: "e.g. 210"
  })), /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Diesel Consumed (Liters)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    step: "0.1",
    min: "0",
    value: genForm.liters,
    onChange: e => setGenForm(f => ({
      ...f,
      liters: e.target.value
    })),
    placeholder: "e.g. 480"
  })), /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Notes"), /*#__PURE__*/React.createElement("input", {
    value: genForm.notes,
    onChange: e => setGenForm(f => ({
      ...f,
      notes: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-dark",
    type: "submit"
  }, currentGenLog ? "Update Generator Log" : "Save Generator Log"))), data.generatorLogs.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "panel-card",
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h3", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow-dot"
  }), "Generator Log History"), /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "data-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Month"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Running Hours"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Diesel (L)"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Utilization"), /*#__PURE__*/React.createElement("th", null, "Notes"), /*#__PURE__*/React.createElement("th", null, "Edit"))), /*#__PURE__*/React.createElement("tbody", null, [...data.generatorLogs].sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month)).map((g, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    className: g.year === year && g.month === month ? "row-saved" : ""
  }, /*#__PURE__*/React.createElement("td", null, monthLabel(g.year, g.month)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, g.hours), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, g.liters), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, Math.round((g.hours || 0) / (daysInMonth(g.year, g.month) * 24) * 100), "%"), /*#__PURE__*/React.createElement("td", {
    style: {
      whiteSpace: "normal"
    }
  }, g.notes), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-sm",
    onClick: () => {
      setYear(g.year);
      setMonth(g.month);
    }
  }, "Edit")))))))), /*#__PURE__*/React.createElement("div", {
    className: "panel-card"
  }, /*#__PURE__*/React.createElement("h3", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow-dot"
  }), "Expenses for ", monthLabel(year, month)), monthExpenses.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("div", {
    className: "icon"
  }, "—"), "No expenses recorded for this month yet") : /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "data-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Type"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Amount"), /*#__PURE__*/React.createElement("th", null, "Notes"))), /*#__PURE__*/React.createElement("tbody", null, monthExpenses.map((e, i) => /*#__PURE__*/React.createElement("tr", {
    key: i
  }, /*#__PURE__*/React.createElement("td", null, e.label), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, fmtMoney2(e.amount)), /*#__PURE__*/React.createElement("td", {
    style: {
      whiteSpace: "normal"
    }
  }, e.notes))))))));
}
// ==================== CONTRACTS VIEW ====================
function ContractsView({
  data,
  store
}) {
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    provider: "",
    start: "",
    end: "",
    monthlyCost: "",
    notes: ""
  });
  function submitForm(e) {
    e.preventDefault();
    if (!form.name || !form.end) return;
    store.addContract({
      name: form.name,
      provider: form.provider,
      start: form.start,
      end: form.end,
      monthlyCost: Number(form.monthlyCost) || 0,
      notes: form.notes
    });
    setForm({
      name: "",
      provider: "",
      start: "",
      end: "",
      monthlyCost: "",
      notes: ""
    });
    setShowForm(false);
  }
  function badgeClass(status) {
    if (status === "Active") return "active";
    if (status === "Expiring Soon") return "expiring";
    return "expired";
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "page-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "page-eyebrow"
  }, "MAINTENANCE"), /*#__PURE__*/React.createElement("div", {
    className: "page-title"
  }, "Maintenance Contracts"), /*#__PURE__*/React.createElement("div", {
    className: "page-desc"
  }, "Generators, solar power, and any recurring service contract — automatic alert before expiry")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-dark",
    onClick: () => setShowForm(s => !s)
  }, showForm ? "Close" : "+ Add Contract")), showForm && /*#__PURE__*/React.createElement("div", {
    className: "panel-card",
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h3", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow-dot"
  }), "New Contract"), /*#__PURE__*/React.createElement("form", {
    onSubmit: submitForm
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Contract Name"), /*#__PURE__*/React.createElement("input", {
    value: form.name,
    onChange: e => setForm(f => ({
      ...f,
      name: e.target.value
    })),
    required: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Provider"), /*#__PURE__*/React.createElement("input", {
    value: form.provider,
    onChange: e => setForm(f => ({
      ...f,
      provider: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Monthly Cost ($)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: form.monthlyCost,
    onChange: e => setForm(f => ({
      ...f,
      monthlyCost: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Start Date"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.start,
    onChange: e => setForm(f => ({
      ...f,
      start: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "End Date"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.end,
    onChange: e => setForm(f => ({
      ...f,
      end: e.target.value
    })),
    required: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "form-field"
  }, /*#__PURE__*/React.createElement("label", null, "Notes"), /*#__PURE__*/React.createElement("input", {
    value: form.notes,
    onChange: e => setForm(f => ({
      ...f,
      notes: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-dark",
    type: "submit"
  }, "Save Contract"))), /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "data-table",
    style: {
      background: "var(--white)",
      borderRadius: 4
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Contract Name"), /*#__PURE__*/React.createElement("th", null, "Provider"), /*#__PURE__*/React.createElement("th", null, "Start"), /*#__PURE__*/React.createElement("th", null, "End"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Monthly Cost"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null, "Notes"))), /*#__PURE__*/React.createElement("tbody", null, data.contracts.map((c, i) => {
    const status = contractStatus(c);
    return /*#__PURE__*/React.createElement("tr", {
      key: i
    }, /*#__PURE__*/React.createElement("td", null, c.name), /*#__PURE__*/React.createElement("td", null, c.provider), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, c.start), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, c.end), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, fmtMoney2(c.monthlyCost)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      className: "badge " + badgeClass(status)
    }, status)), /*#__PURE__*/React.createElement("td", {
      style: {
        whiteSpace: "normal",
        maxWidth: 260
      }
    }, c.notes));
  })))));
}
// ==================== RECEIPT TEMPLATE ====================
function ReceiptTemplate({
  sub,
  reading,
  receiptNo
}) {
  if (!sub || !reading) return null;
  const y = Number(reading.date.slice(0, 4));
  const m = Number(reading.date.slice(5, 7));
  const today = new Date();
  const printedDate = `${today.getFullYear()}/${today.getDate()}/${today.getMonth() + 1}`;
  const payMethodArabic = reading.payMethod === "Cash" || !reading.payMethod ? "نقداً" : reading.payMethod;
  return /*#__PURE__*/React.createElement("div", {
    className: "receipt-sheet-ar",
    dir: "rtl"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rc-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rc-title"
  }, "إيصال قبض ", /*#__PURE__*/React.createElement("span", {
    className: "rc-no mono"
  }, receiptNo)), /*#__PURE__*/React.createElement("div", {
    className: "rc-amount-box"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rc-amount-label"
  }, "المبلغ"), /*#__PURE__*/React.createElement("div", {
    className: "rc-amount-value"
  }, /*#__PURE__*/React.createElement("span", null, "USD"), /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, reading.totalRounded)))), /*#__PURE__*/React.createElement("div", {
    className: "rc-row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "rc-label"
  }, "وصلنا من السيد:"), " ", /*#__PURE__*/React.createElement("b", null, sub.name)), /*#__PURE__*/React.createElement("div", {
    className: "rc-box"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rc-box-value mono"
  }, sub.panel), /*#__PURE__*/React.createElement("div", {
    className: "rc-box-label"
  }, "رقم الساعة"))), /*#__PURE__*/React.createElement("div", {
    className: "rc-row"
  }, /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", {
    className: "rc-box"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rc-box-value mono"
  }, reading.price), /*#__PURE__*/React.createElement("div", {
    className: "rc-box-label"
  }, "تعرفة الوحدة"))), /*#__PURE__*/React.createElement("div", {
    className: "rc-row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "rc-label"
  }, "مبلغاً وقدره:"), " ", /*#__PURE__*/React.createElement("b", null, amountInWords(reading.totalRounded)))), /*#__PURE__*/React.createElement("div", {
    className: "rc-row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "rc-label"
  }, "وذلك عن:"), " ", /*#__PURE__*/React.createElement("b", null, "تسديد إشتراك الكهرباء عن شهر ", monthLabelArabic(y, m))), /*#__PURE__*/React.createElement("div", {
    className: "rc-box"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rc-box-value mono"
  }, reading.fixedFee), /*#__PURE__*/React.createElement("div", {
    className: "rc-box-label"
  }, "مبلغ مقطوع"))), /*#__PURE__*/React.createElement("div", {
    className: "rc-row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "rc-label"
  }, "طريقة الدفع:"), " ", /*#__PURE__*/React.createElement("b", null, payMethodArabic))), /*#__PURE__*/React.createElement("div", {
    className: "rc-row rc-meters"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rc-box"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rc-box-value mono"
  }, reading.prev), /*#__PURE__*/React.createElement("div", {
    className: "rc-box-label"
  }, "العداد السابق")), /*#__PURE__*/React.createElement("div", {
    className: "rc-box"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rc-box-value mono"
  }, reading.curr), /*#__PURE__*/React.createElement("div", {
    className: "rc-box-label"
  }, "العداد الحالي")), /*#__PURE__*/React.createElement("div", {
    className: "rc-box"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rc-box-value mono"
  }, reading.consumption), /*#__PURE__*/React.createElement("div", {
    className: "rc-box-label"
  }, "إجمالي المسحوب"))), /*#__PURE__*/React.createElement("div", {
    className: "rc-footer"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "rc-label"
  }, "المستلم:"), " ", /*#__PURE__*/React.createElement("b", null, "LASeR")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "rc-label"
  }, "التاريخ:"), " ", /*#__PURE__*/React.createElement("b", {
    className: "mono"
  }, printedDate))));
}

// ==================== RECEIPTS VIEW ====================
function ReceiptsView({
  data,
  store
}) {
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
      sub: data.subscribers.find(s => s.id === r.subId)
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
    store.addOrUpdateReading({
      ...reading,
      paid: reading.paid === "Paid" ? "Unpaid" : "Paid"
    });
  }
  function waitFrame() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
  async function captureReceipt(sub, reading, receiptNo) {
    setRenderTarget({
      sub,
      reading,
      receiptNo
    });
    await waitFrame();
    const canvas = await html2canvas(hiddenRef.current, {
      scale: 2,
      backgroundColor: "#ffffff"
    });
    return canvas;
  }
  async function downloadSingle(row) {
    setBusy(true);
    setProgress("Generating receipt for " + row.sub.name + " ...");
    const receiptNo = row.reading.receiptNo || row.sub.meter + "-" + row.reading.date.replace(/-/g, "");
    const canvas = await captureReceipt(row.sub, row.reading, receiptNo);
    const {
      jsPDF
    } = window.jspdf;
    const pdf = new jsPDF({
      unit: "px",
      format: [canvas.width / 2, canvas.height / 2]
    });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
    pdf.save("Receipt_" + row.sub.name + "_" + row.reading.date + ".pdf");
    setRenderTarget(null);
    setBusy(false);
    setProgress("");
  }
  async function downloadAll() {
    if (!rows.length) return;
    setBusy(true);
    const {
      jsPDF
    } = window.jspdf;
    let pdf = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      setProgress(`Generating receipt ${i + 1} of ${rows.length} — ${row.sub.name}`);
      const receiptNo = row.reading.receiptNo || row.sub.meter + "-" + row.reading.date.replace(/-/g, "");
      const canvas = await captureReceipt(row.sub, row.reading, receiptNo);
      const w = canvas.width / 2,
        h = canvas.height / 2;
      if (!pdf) pdf = new jsPDF({
        unit: "px",
        format: [w, h]
      });else pdf.addPage([w, h]);
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
    }
    pdf.save(`Receipts_${monthLabel(year, month)}.pdf`);
    setRenderTarget(null);
    setBusy(false);
    setProgress("");
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "page-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "page-eyebrow"
  }, "RECEIPTS"), /*#__PURE__*/React.createElement("div", {
    className: "page-title"
  }, "Receipts"), /*#__PURE__*/React.createElement("div", {
    className: "page-desc"
  }, "Generate PDF receipts for each subscriber — individually or all at once for the month")), /*#__PURE__*/React.createElement(MonthPicker, {
    year: year,
    month: month,
    setYear: setYear,
    setMonth: setMonth
  })), /*#__PURE__*/React.createElement("div", {
    className: "panel-card",
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow-dot"
  }), monthLabel(year, month), " — ", rows.length, " receipts available"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-dark",
    onClick: downloadAll,
    disabled: busy || !rows.length
  }, "Download All Receipts (Single PDF)")), /*#__PURE__*/React.createElement("div", {
    className: "chip-row",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "chip" + (payFilter === "all" ? " active" : ""),
    onClick: () => setPayFilter("all")
  }, "All (", allRows.length, ")"), /*#__PURE__*/React.createElement("button", {
    className: "chip" + (payFilter === "paid" ? " active" : ""),
    onClick: () => setPayFilter("paid")
  }, "Paid (", paidCount, ")"), /*#__PURE__*/React.createElement("button", {
    className: "chip" + (payFilter === "unpaid" ? " active" : ""),
    onClick: () => setPayFilter("unpaid")
  }, "Unpaid (", unpaidCount, ")")), rows.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("div", {
    className: "icon"
  }, "—"), "No readings saved for this month yet. Enter them from the \"Enter Readings\" page first.") : /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "data-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Name"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Consumption"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Fixed Fee"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Total"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null, "Receipt"))), /*#__PURE__*/React.createElement("tbody", null, rows.map(row => /*#__PURE__*/React.createElement("tr", {
    key: row.sub.id
  }, /*#__PURE__*/React.createElement("td", null, row.sub.name), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, row.reading.consumption, " kWh"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, fmtMoney2(row.reading.fixedFee), row.reading.feeEdited && /*#__PURE__*/React.createElement("span", {
    className: "badge expiring",
    style: {
      marginInlineStart: 6
    },
    title: row.reading.editedBy ? `Edited by ${row.reading.editedBy}` : "Fixed fee edited"
  }, "Edited", row.reading.editedBy ? ` · ${row.reading.editedBy}` : "")), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, fmtMoney2(row.reading.total)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
    className: "badge " + (row.reading.paid === "Paid" ? "paid" : "unpaid"),
    style: {
      border: "none"
    },
    onClick: () => togglePaid(row.reading)
  }, row.reading.paid === "Paid" ? "Paid" : "Unpaid")), /*#__PURE__*/React.createElement("td", {
    style: {
      display: "flex",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-sm",
    onClick: () => setPreviewSub(row)
  }, "Preview"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-sm",
    disabled: busy,
    onClick: () => downloadSingle(row)
  }, "PDF")))))))), previewSub && /*#__PURE__*/React.createElement("div", {
    className: "panel-card",
    style: {
      maxWidth: 640
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow-dot"
  }), "Receipt Preview"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-sm",
    onClick: () => setPreviewSub(null)
  }, "Close")), /*#__PURE__*/React.createElement(ReceiptTemplate, {
    sub: previewSub.sub,
    reading: previewSub.reading,
    receiptNo: previewSub.reading.receiptNo || previewSub.sub.meter + "-" + previewSub.reading.date.replace(/-/g, "")
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      top: -9999,
      left: -9999
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: hiddenRef
  }, renderTarget && /*#__PURE__*/React.createElement(ReceiptTemplate, {
    sub: renderTarget.sub,
    reading: renderTarget.reading,
    receiptNo: renderTarget.receiptNo
  }))), busy && /*#__PURE__*/React.createElement("div", {
    className: "toast"
  }, progress));
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
    return /*#__PURE__*/React.createElement(LoginScreen, {
      onLogin: handleLogin
    });
  }
  let body = null;
  if (view === "dashboard" && user.role === "owner") body = /*#__PURE__*/React.createElement(DashboardView, {
    data: store.data
  });else if (view === "entry") body = /*#__PURE__*/React.createElement(EntryView, {
    data: store.data,
    store: store,
    user: user
  });else if (view === "subscribers") body = /*#__PURE__*/React.createElement(SubscribersView, {
    data: store.data,
    store: store
  });else if (view === "expenses" && user.role === "owner") body = /*#__PURE__*/React.createElement(ExpensesView, {
    data: store.data,
    store: store
  });else if (view === "contracts" && user.role === "owner") body = /*#__PURE__*/React.createElement(ContractsView, {
    data: store.data,
    store: store
  });else if (view === "receipts" && user.role === "owner") body = /*#__PURE__*/React.createElement(ReceiptsView, {
    data: store.data,
    store: store
  });else body = /*#__PURE__*/React.createElement(EntryView, {
    data: store.data,
    store: store,
    user: user
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "app-shell"
  }, /*#__PURE__*/React.createElement(BreakerPanel, {
    user: user,
    view: view,
    setView: setView,
    onLogout: handleLogout
  }), /*#__PURE__*/React.createElement("div", {
    className: "content"
  }, body));
}
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(/*#__PURE__*/React.createElement(App, null));