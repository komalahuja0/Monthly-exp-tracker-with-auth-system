import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import { MONTHS, currency } from "../utils/format";

// Day 0 of the next month is the last day of this one, so leap years
// (29 days in Feb) are handled by the Date object itself.
const daysInMonth = (month, year) => new Date(year, month, 0).getDate();

const spentOf = (rec) => (rec.entries || []).reduce((sum, e) => sum + (e.amount || 0), 0);
const prevMonthOf = (m, y) => (m === 1 ? [12, y - 1] : [m - 1, y]);

// Unspent money at the end of month (m, y), using the carried amount that month
// saved. Only a positive leftover is carried; an overspent month carries nothing.
const leftoverOf = (records, m, y) => {
  const rec = records.find((r) => Number(r.month) === m && Number(r.year) === y);
  if (!rec) return 0;
  const carried = rec.carryOver ? Number(rec.carriedAmount) || 0 : 0;
  return Math.max(0, (rec.budget || 0) + carried - spentOf(rec));
};

let nextId = 0;
const newId = () => `entry-${++nextId}`;
const emptyEntry = () => ({ id: newId(), name: "", amount: "", date: "" });

// Oldest date first; entries without a date stay at the bottom (so a new blank row never jumps).
const byDate = (a, b) => {
  if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  if (a.date) return -1;
  if (b.date) return 1;
  return 0;
};
const isValid = (e) => e.name.trim() !== "" && e.amount !== "";
const API = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api`;


function ExpenseTracker() {
  const navigate = useNavigate();
  const now = new Date();

  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year] = useState(now.getFullYear());
  const [budget, setBudget] = useState("");
  const [carryOver, setCarryOver] = useState(false);
  const [carriedAmount, setCarriedAmount] = useState(0);
  const [allRecords, setAllRecords] = useState([]);
  const [entries, setEntries] = useState([emptyEntry()]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle");
  const [dirty, setDirty] = useState(false);


  const token = localStorage.getItem("token");
  const days = daysInMonth(month, year);

  const budgetNum = parseFloat(budget) || 0;
  const totalSpent = entries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const [prevMonth, prevYear] = prevMonthOf(month, year);
  const prevEnded =
    prevYear < now.getFullYear() || (prevYear === now.getFullYear() && prevMonth < now.getMonth() + 1);
  const carriedAvailable = leftoverOf(allRecords, prevMonth, prevYear);
  const carriedApplied = carryOver ? carriedAmount : 0;
  const totalBudget = budgetNum + carriedApplied;
  const moneyLeft = totalBudget - totalSpent;
  const percentUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const progressClass = percentUsed > 100 ? "over" : percentUsed >= 85 ? "warn" : "";

  // Days left come from today's date: the current month counts today through
  // the last day, a future month counts every day, a past month has none left.
  const currentMonth = now.getMonth() + 1;
  const monthEnded = year < now.getFullYear() || (year === now.getFullYear() && month < currentMonth);
  const isCurrentMonth = year === now.getFullYear() && month === currentMonth;
  const remainingDays = monthEnded ? 0 : isCurrentMonth ? days - now.getDate() + 1 : days;
  const dailyBudgetLeft = remainingDays > 0 ? moneyLeft / remainingDays : 0;


  // ----- dashboard visuals -----
  const validEntries = entries.filter(isValid);
  const ringPct = Math.min(percentUsed, 100);
  const RING_C = 2 * Math.PI * 52;
  const ringColor = moneyLeft < 0 ? "#f87171" : percentUsed >= 85 ? "#fbbf24" : "#34d399";
  const monthProgress = isCurrentMonth ? (now.getDate() / days) * 100 : monthEnded ? 100 : 0;
  const pace =
    totalBudget <= 0
      ? null
      : moneyLeft < 0
      ? { label: "Over budget", bg: "rgba(248,113,113,0.2)", fg: "#fca5a5" }
      : isCurrentMonth && percentUsed <= monthProgress + 5
      ? { label: "On track", bg: "rgba(52,211,153,0.18)", fg: "#6ee7b7" }
      : isCurrentMonth
      ? { label: "Spending fast", bg: "rgba(251,191,36,0.18)", fg: "#fcd34d" }
      : null;

  const spendByDay = Array.from({ length: days }, () => 0);
  validEntries.forEach((e) => {
    if (!e.date) return;
    const [ey, em, ed] = e.date.split("-").map(Number);
    if (ey === year && em === month && ed >= 1 && ed <= days) spendByDay[ed - 1] += parseFloat(e.amount) || 0;
  });
  const maxDay = Math.max(...spendByDay);
  const peakDay = maxDay > 0 ? spendByDay.indexOf(maxDay) + 1 : 0;
  const undatedCount = validEntries.filter((e) => !e.date).length;
  const topExpenses = [...validEntries].sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount)).slice(0, 5);
  const biggest = topExpenses[0];

  const statusLabel =
    saveState === "saving" ? "Saving…"
    : saveState === "error" ? "Couldn’t save changes"
    : dirty ? "Unsaved changes"
    : saveState === "partial" ? "Saved, but the server isn’t storing carry-over yet"
    : saveState === "saved" ? "All changes saved"
    : "";

  useEffect(() => {
    if (!token) navigate("/login");
  }, [token, navigate]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const fetchMonth = useCallback(async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };
      const [res, allRes] = await Promise.all([
        axios.get(`${API}/expenses/${month}/${year}`, { headers }),
        axios.get(`${API}/expenses`, { headers }),
      ]);
      setAllRecords(allRes.data.expenses || []);
      const data = res.data.expense;
      setCarryOver(!!data?.carryOver);
      setCarriedAmount(Number(data?.carriedAmount) || 0);
      if (data) {
        setBudget(String(data.budget ?? ""));
        setEntries(
          data.entries && data.entries.length > 0
            ? data.entries
                .map((e) => ({ id: newId(), name: e.name, amount: String(e.amount), date: e.date || "" }))
                .sort(byDate)
            : [emptyEntry()]
        );
      } else {
        setBudget("");
        setEntries([emptyEntry()]);
      }
      setSaveState("idle");
      setDirty(false);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  }, [month, year, token]);

  useEffect(() => {
    if (token) fetchMonth();
  }, [fetchMonth, token]);

  const persist = useCallback(
    async (entriesToSave, budgetToSave) => {
      try {
        setSaveState("saving");
        const cleanEntries = entriesToSave
          .filter(isValid)
          .map((e) => ({ name: e.name.trim(), amount: parseFloat(e.amount), date: e.date || "" }));

        const res = await axios.post(
          `${API}/expenses`,
          {
            month,
            year,
            budget: parseFloat(budgetToSave) || 0,
            daysInMonth: days,
            entries: cleanEntries,
            carryOver,
            carriedAmount,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        // If the server answers without the carry-over fields, it is running old code.
        const stored = res.data?.expense;
        setSaveState(carryOver && stored && !stored.carryOver ? "partial" : "saved");
        setDirty(false);
        return true;
      } catch (error) {
        console.log(error);
        setSaveState("error");
        return false;
      }
    },
    [month, year, days, token, carryOver, carriedAmount]
  );

  const handleEntryChange = (id, field, value) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
    setDirty(true);
  };

  // Runs when focus leaves a row, so rows never move while you're still typing in them.
  const sortEntries = () => {
    const next = [...entries].sort(byDate);
    if (next.some((e, i) => e.id !== entries[i].id)) {
      setEntries(next);
      setDirty(true);
    }
  };

  const addEntry = () => setEntries([...entries, emptyEntry()]);

  const removeEntry = (id) => {
    const next = entries.filter((e) => e.id !== id);
    const finalEntries = next.length > 0 ? next : [emptyEntry()];
    setEntries(finalEntries);
    setDirty(true);
  };

  const handleSave = () => persist(entries, budget);

  const toggleCarryOver = () => {
    if (!carryOver) setCarriedAmount(carriedAvailable);
    setCarryOver((v) => !v);
    setDirty(true);
  };

  const refreshCarry = () => {
    setCarriedAmount(carriedAvailable);
    setDirty(true);
  };

  const handleMonthChange = (e) => {
    if (dirty && !window.confirm("You have unsaved changes. Switch month and discard them?")) return;
    setMonth(parseInt(e.target.value));
  };

  return (
    <AppShell maxWidth="max-w-6xl">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
        <div>
          <h1 className="bb-display bb-h1 m-0">Expenses</h1>
          <p className="mt-1.5 mb-0 bb-muted">Track what you spend against your monthly budget.</p>
        </div>
        <div className="flex items-center gap-4">
          <span
            className="text-sm bb-muted min-w-[9.5rem] text-right"
            style={saveState === "error" ? { color: "var(--danger)" } : dirty || saveState === "partial" ? { color: "var(--warn)" } : undefined}
            role="status"
            aria-live="polite"
          >
            {statusLabel}
          </span>
          <label className="sr-only" htmlFor="month">Month</label>
          <select
            id="month"
            value={month}
            onChange={handleMonthChange}
            className="bb-input"
            style={{ width: "auto", fontWeight: 600, paddingRight: "0.5rem" }}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m} {year}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-5" aria-busy="true">
          <div className="bb-skeleton h-56 w-full" style={{ borderRadius: 18 }} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bb-skeleton h-28" style={{ borderRadius: 14 }} />
            ))}
          </div>
          <div className="bb-skeleton h-72 w-full" style={{ borderRadius: 14 }} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Hero */}
          <section
            className="overflow-hidden text-white"
            style={{ borderRadius: 18, background: "linear-gradient(135deg, #0d1b2a 0%, #14365a 100%)" }}
            aria-label="Monthly overview"
          >
            <div className="p-6 sm:p-9 flex flex-col-reverse gap-8 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="m-0 text-sm font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
                    {moneyLeft < 0 ? "Over budget by" : `Remaining in ${MONTHS[month - 1]}`}
                  </p>
                  {pace && (
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: pace.bg, color: pace.fg }}
                    >
                      {pace.label}
                    </span>
                  )}
                </div>
                <p className="bb-display bb-num m-0 mt-3 text-[3rem] sm:text-[3.75rem] leading-none font-semibold" style={{ color: "#fff" }}>
                  {currency(Math.abs(moneyLeft))}
                </p>
                <p className="m-0 mt-4 text-[0.9375rem]" style={{ color: "rgba(255,255,255,0.65)" }}>
                  {totalBudget > 0
                    ? `of ${currency(totalBudget)}${carriedApplied > 0 ? `, including ${currency(carriedApplied)} carried over` : ""}`
                    : "Set a monthly budget below to get started"}
                </p>
              </div>

              <svg
                width="148"
                height="148"
                viewBox="0 0 132 132"
                className="shrink-0"
                role="img"
                aria-label={`${Math.round(percentUsed)}% of budget used`}
              >
                <circle cx="66" cy="66" r="52" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="10" />
                <circle
                  cx="66"
                  cy="66"
                  r="52"
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C * (1 - ringPct / 100)}
                  transform="rotate(-90 66 66)"
                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                />
                <text x="66" y="68" textAnchor="middle" fill="#fff" fontSize="28" fontWeight="600" className="bb-display">
                  {Math.round(percentUsed)}%
                </text>
                <text x="66" y="87" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="12">
                  used
                </text>
              </svg>
            </div>

            {/* Carry over */}
            <div
              className="px-6 sm:px-9 py-4 flex items-center justify-between gap-4"
              style={{ borderTop: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
            >
              <div className="min-w-0">
                <p className="m-0 text-sm font-semibold" id="carry-label" style={{ color: "#fff" }}>Carry over unspent budget</p>
                <p className="m-0 mt-0.5 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
                  {carriedAvailable > 0
                    ? `${MONTHS[prevMonth - 1]} ${prevEnded ? "had" : "has so far"} ${currency(carriedAvailable)} unspent. Add it to this month’s budget.`
                    : `${MONTHS[prevMonth - 1]} has nothing unspent to carry over.`}
                </p>
                {carryOver && carriedAvailable !== carriedAmount && (
                  <p className="m-0 mt-1 text-sm" style={{ color: "#fcd34d" }}>
                    {MONTHS[prevMonth - 1]}’s unspent is now {currency(carriedAvailable)}, but {currency(carriedAmount)} is carried.{" "}
                    <button type="button" onClick={refreshCarry} className="bb-linkbtn" style={{ color: "#fff", textDecoration: "underline" }}>
                      Update
                    </button>
                  </p>
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={carryOver}
                aria-labelledby="carry-label"
                onClick={toggleCarryOver}
                className="bb-switch bb-switch-dark"
              />
            </div>
          </section>

          {/* KPI tiles */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Key figures">
            <div className="bb-card p-5 min-w-0">
              <span className="bb-chip" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg></span>
              <label htmlFor="budget" className="bb-label block mt-4">Monthly budget</label>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="bb-display text-[1.5rem] font-semibold bb-muted">₹</span>
                <input
                  id="budget"
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={budget}
                  onChange={(e) => { setBudget(e.target.value); setDirty(true); }}
                  placeholder="0"
                  className="bb-display bb-num w-full min-w-0 text-[1.5rem] font-semibold bg-transparent border-0 outline-none p-0"
                  style={{ color: "var(--ink)", MozAppearance: "textfield" }}
                />
              </div>
              <p className="m-0 mt-1 text-sm bb-muted">Click the number to edit</p>
            </div>

            <div className="bb-card p-5 min-w-0">
              <span className="bb-chip" style={{ background: "#fdecea", color: "var(--danger)" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" /></svg></span>
              <p className="bb-label mt-4 mb-0">Spent</p>
              <p className="bb-display bb-num m-0 mt-1 text-[1.5rem] font-semibold">{currency(totalSpent)}</p>
              <p className="m-0 mt-1 text-sm bb-muted bb-num">
                {validEntries.length} {validEntries.length === 1 ? "transaction" : "transactions"}
              </p>
            </div>

            <div className="bb-card p-5 min-w-0">
              <span className="bb-chip" style={{ background: "#e8f0fe", color: "#1d4ed8" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg></span>
              <p className="bb-label mt-4 mb-0">Daily allowance</p>
              {moneyLeft < 0 || monthEnded || totalBudget <= 0 ? (
                <>
                  <p className="bb-display bb-num m-0 mt-1 text-[1.5rem] font-semibold bb-muted">—</p>
                  <p className="m-0 mt-1 text-sm bb-muted">
                    {moneyLeft < 0 ? "Budget exceeded" : monthEnded ? "This month has ended" : "Set a budget first"}
                  </p>
                </>
              ) : (
                <>
                  <p className="bb-display bb-num m-0 mt-1 text-[1.5rem] font-semibold">
                    {currency(Math.round(dailyBudgetLeft * 100) / 100)}
                    <span className="text-sm font-medium bb-muted"> / day</span>
                  </p>
                  <p className="m-0 mt-1 text-sm bb-muted">
                    {isCurrentMonth
                      ? `${remainingDays} ${remainingDays === 1 ? "day" : "days"} left, incl. today`
                      : `Across ${remainingDays} days`}
                  </p>
                </>
              )}
            </div>

            <div className="bb-card p-5 min-w-0">
              <span className="bb-chip" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg></span>
              <p className="bb-label mt-4 mb-0">Biggest expense</p>
              <p className="bb-display bb-num m-0 mt-1 text-[1.5rem] font-semibold">
                {biggest ? currency(parseFloat(biggest.amount)) : "—"}
              </p>
              <p className="m-0 mt-1 text-sm bb-muted truncate">{biggest ? biggest.name : "No expenses yet"}</p>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
            {/* Entries */}
            <section className="bb-card overflow-hidden" aria-label="Expense entries">
              <div className="px-5 py-4 flex items-center justify-between border-b bb-divider">
                <h2 className="bb-h2 m-0">Transactions</h2>
                <span className="text-sm bb-muted bb-num">
                  {entries.filter(isValid).length} {entries.filter(isValid).length === 1 ? "entry" : "entries"}
                </span>
              </div>

              <div className="hidden sm:flex items-center gap-2 px-5 pt-3 pb-1 bb-label">
                <span className="w-[9.5rem] pl-2.5 text-left">Date</span>
                <span className="flex-1 pl-2.5 text-left">Description</span>
                <span className="w-32 pr-2.5 text-right">Amount (₹)</span>
                <span className="w-9" />
              </div>

              <ul className="list-none m-0 p-0 px-3 pb-2">
                {entries.map((entry, i) => (
                  <li
                    key={entry.id}
                    onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) sortEntries(); }}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1 px-2 py-2 sm:py-1 border-b bb-divider last:border-b-0"
                  >
                    <input
                      type="text"
                      aria-label={`Description for entry ${i + 1}`}
                      value={entry.name}
                      onChange={(e) => handleEntryChange(entry.id, "name", e.target.value)}
                      placeholder="What did you spend on?"
                      className="bb-cell order-first w-full sm:order-none sm:w-auto sm:flex-1"
                    />
                    <input
                      type="date"
                      aria-label={`Date for entry ${i + 1}`}
                      value={entry.date}
                      onChange={(e) => handleEntryChange(entry.id, "date", e.target.value)}
                      className="bb-cell w-[9.5rem] shrink-0 sm:order-first"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      aria-label={`Amount for entry ${i + 1}`}
                      value={entry.amount}
                      onChange={(e) => handleEntryChange(entry.id, "amount", e.target.value)}
                      placeholder="0.00"
                      className="bb-cell flex-1 sm:flex-none sm:shrink-0 sm:w-32"
                    />
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.id)}
                      aria-label={`Delete entry ${i + 1}`}
                      className="bb-iconbtn"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-t bb-divider" style={{ background: "#fafbfc" }}>
                <button type="button" onClick={addEntry} className="bb-btn bb-btn-secondary bb-btn-sm">
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  Add expense
                </button>
                <div className="flex items-center gap-4">
                  <p className="m-0 text-sm bb-muted">
                    Total <span className="bb-num font-semibold ml-1" style={{ color: "var(--ink)" }}>{currency(totalSpent)}</span>
                  </p>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saveState === "saving" || !(dirty || saveState === "error")}
                    className={`bb-btn bb-btn-sm ${dirty || saveState === "error" ? "bb-btn-primary" : "bb-btn-secondary"}`}
                  >
                    {saveState === "saving" ? "Saving…" : dirty || saveState === "error" ? "Save changes" : "Saved"}
                  </button>
                </div>
              </div>
            </section>

            <aside className="space-y-6">
              {/* Spending by day */}
              <section className="bb-card p-5 sm:p-6" aria-label="Spending by day">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="bb-h2 m-0">Spending by day</h2>
                  <span className="text-sm bb-muted">{MONTHS[month - 1]}</span>
                </div>
                {maxDay > 0 ? (
                  <>
                    <div
                      className="mt-5 flex items-end gap-[3px] h-[132px]"
                      role="img"
                      aria-label={`Daily spending in ${MONTHS[month - 1]}, highest on day ${peakDay}`}
                    >
                      {spendByDay.map((v, i) => (
                        <div
                          key={i}
                          title={`${i + 1} ${MONTHS[month - 1]}: ${currency(v)}`}
                          className="flex-1 min-w-0 rounded-t-[3px]"
                          style={{
                            height: v > 0 ? `${Math.max((v / maxDay) * 100, 4)}%` : "3px",
                            background:
                              v > 0
                                ? isCurrentMonth && i + 1 === now.getDate()
                                  ? "var(--ink)"
                                  : "var(--accent)"
                                : "#e8ecf1",
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between text-xs bb-muted bb-num">
                      <span>1</span>
                      <span>{Math.ceil(days / 2)}</span>
                      <span>{days}</span>
                    </div>
                    <p className="mt-4 mb-0 text-sm bb-muted">
                      Highest on day {peakDay}:{" "}
                      <span className="font-semibold bb-num" style={{ color: "var(--ink)" }}>{currency(maxDay)}</span>
                    </p>
                    {undatedCount > 0 && (
                      <p className="mt-1 mb-0 text-xs bb-muted">
                        {undatedCount} {undatedCount === 1 ? "expense has" : "expenses have"} no date and aren’t shown.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-4 mb-0 text-sm bb-muted">
                    Add expenses with dates to see how your spending is spread across the month.
                  </p>
                )}
              </section>

              {/* Top expenses */}
              <section className="bb-card p-5 sm:p-6" aria-label="Top expenses">
                <h2 className="bb-h2 m-0">Top expenses</h2>
                {topExpenses.length > 0 ? (
                  <ol className="list-none p-0 m-0 mt-5 space-y-4">
                    {topExpenses.map((e) => {
                      const amt = parseFloat(e.amount) || 0;
                      const share = totalSpent > 0 ? Math.round((amt / totalSpent) * 100) : 0;
                      return (
                        <li key={e.id}>
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="truncate font-medium">{e.name}</span>
                            <span className="bb-num font-semibold shrink-0">{currency(amt)}</span>
                          </div>
                          <div className="bb-progress mt-2" style={{ height: 6 }}>
                            <div style={{ width: `${share}%` }} />
                          </div>
                          <p className="m-0 mt-1 text-xs bb-muted bb-num">{share}% of spending</p>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="mt-4 mb-0 text-sm bb-muted">Your largest expenses will appear here.</p>
                )}
              </section>
            </aside>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default ExpenseTracker;