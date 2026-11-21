import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import { MONTHS, currency } from "../utils/format";

const daysInMonth = (month, year) => {
  if (!month) return 30;
  if ([1, 3, 5, 7, 8, 10, 12].includes(month)) return 31;
  if (month === 2) {
    const y = year || new Date().getFullYear();
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return isLeap ? 29 : 28;
  }
  return 30;
};

const emptyEntry = () => ({ name: "", amount: "", date: "" });
const isValid = (e) => e.name.trim() !== "" && e.amount !== "";
const API = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api`;


function ExpenseTracker() {
  const navigate = useNavigate();
  const now = new Date();

  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year] = useState(now.getFullYear());
  const [budget, setBudget] = useState("");
  const [entries, setEntries] = useState([emptyEntry()]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle");
  const [dirty, setDirty] = useState(false);

  const [insight, setInsight] = useState("");
  const [insightSnapshot, setInsightSnapshot] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");

  const token = localStorage.getItem("token");
  const days = daysInMonth(month, year);

  const budgetNum = parseFloat(budget) || 0;
  const totalSpent = entries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const moneyLeft = budgetNum - totalSpent;
  const percentUsed = budgetNum > 0 ? (totalSpent / budgetNum) * 100 : 0;
  const progressClass = percentUsed > 100 ? "over" : percentUsed >= 85 ? "warn" : "";

  // "Days left" is driven by the latest date entered against any entry,
  // not today's calendar date. With no dates yet, the full month remains.
  const entryDays = entries
    .map((e) => (e.date ? parseInt(e.date.split("-")[2], 10) : null))
    .filter((d) => d !== null && !isNaN(d));
  const latestDay = entryDays.length > 0 ? Math.max(...entryDays) : 0;
  const remainingDays = Math.max(days - latestDay, 1);
  const dailyBudgetLeft = moneyLeft / remainingDays;

  // Used to tell whether the AI summary still matches what's on screen.
  const dataKey = JSON.stringify([budgetNum, entries.filter(isValid).map((e) => [e.name.trim(), e.amount, e.date])]);
  const insightStale = insight !== "" && insightSnapshot !== dataKey;

  const statusLabel =
    saveState === "saving" ? "Saving…"
    : saveState === "error" ? "Couldn’t save changes"
    : dirty ? "Unsaved changes"
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
      const res = await axios.get(`${API}/expenses/${month}/${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data.expense;
      if (data) {
        setBudget(String(data.budget ?? ""));
        setEntries(
          data.entries && data.entries.length > 0
            ? data.entries.map((e) => ({ name: e.name, amount: String(e.amount), date: e.date || "" }))
            : [emptyEntry()]
        );
      } else {
        setBudget("");
        setEntries([emptyEntry()]);
      }
      setInsight("");
      setInsightSnapshot("");
      setInsightError("");
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

        await axios.post(
          `${API}/expenses`,
          { month, year, budget: parseFloat(budgetToSave) || 0, daysInMonth: days, entries: cleanEntries },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setSaveState("saved");
        setDirty(false);
        return true;
      } catch (error) {
        console.log(error);
        setSaveState("error");
        return false;
      }
    },
    [month, year, days, token]
  );

  const handleEntryChange = (index, field, value) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)));
    setDirty(true);
  };

  const addEntry = () => setEntries([...entries, emptyEntry()]);

  const removeEntry = (index) => {
    const next = entries.filter((_, i) => i !== index);
    const finalEntries = next.length > 0 ? next : [emptyEntry()];
    setEntries(finalEntries);
    setDirty(true);
  };

  const handleSave = () => persist(entries, budget);

  const handleMonthChange = (e) => {
    if (dirty && !window.confirm("You have unsaved changes. Switch month and discard them?")) return;
    setMonth(parseInt(e.target.value));
  };

  const handleGetInsight = async () => {
    setInsightError("");
    if (!entries.some(isValid)) {
      setInsightError("Add at least one expense to get a summary.");
      return;
    }
    if (!budgetNum) {
      setInsightError("Set a monthly budget to get a summary.");
      return;
    }
    try {
      setInsightLoading(true);
      // Make sure the server has the latest numbers before it analyses them.
      const saved = await persist(entries, budget);
      if (!saved) throw new Error("save failed");
      const res = await axios.get(`${API}/ai/insights/${month}/${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInsight(res.data.insight || "");
      setInsightSnapshot(dataKey);
    } catch (error) {
      console.log(error);
      setInsightError("Couldn’t generate a summary right now. Try again in a moment.");
    } finally {
      setInsightLoading(false);
    }
  };

  return (
    <AppShell>
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
        <div>
          <h1 className="bb-display bb-h1 m-0">Expenses</h1>
          <p className="mt-1.5 mb-0 bb-muted">Track what you spend against your monthly budget.</p>
        </div>
        <div className="flex items-center gap-4">
          <span
            className="text-sm bb-muted min-w-[9.5rem] text-right"
            style={saveState === "error" ? { color: "var(--danger)" } : dirty ? { color: "var(--warn)" } : undefined}
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
          <div className="bb-skeleton h-36 w-full" style={{ borderRadius: 14 }} />
          <div className="bb-skeleton h-72 w-full" style={{ borderRadius: 14 }} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <section className="bb-card p-6 sm:p-7" aria-label="Monthly summary">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-0 sm:divide-x bb-divider">
              <div className="sm:pr-8">
                <label htmlFor="budget" className="bb-label">Monthly budget</label>
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
                    className="bb-display bb-num w-full text-[1.75rem] font-semibold bg-transparent border-0 outline-none p-0"
                    style={{ color: "var(--ink)", MozAppearance: "textfield" }}
                  />
                </div>
              </div>
              <div className="sm:px-8">
                <p className="bb-label m-0">Spent</p>
                <p className="bb-display bb-num m-0 mt-1 text-[1.75rem] font-semibold">{currency(totalSpent)}</p>
              </div>
              <div className="sm:pl-8">
                <p className="bb-label m-0">{moneyLeft < 0 ? "Over budget by" : "Remaining"}</p>
                <p
                  className="bb-display bb-num m-0 mt-1 text-[1.75rem] font-semibold"
                  style={{ color: moneyLeft < 0 ? "var(--danger)" : "var(--accent)" }}
                >
                  {currency(Math.abs(moneyLeft))}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <div
                className={`bb-progress ${progressClass}`}
                role="progressbar"
                aria-label="Budget used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(percentUsed, 100))}
              >
                <div style={{ width: `${Math.min(percentUsed, 100)}%` }} />
              </div>
              <p className="mt-2 mb-0 text-sm bb-muted bb-num">
                {budgetNum > 0 ? `${Math.round(percentUsed)}% of your budget used` : "Set a budget to see your progress"}
              </p>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
            {/* Entries */}
            <section className="bb-card overflow-hidden" aria-label="Expense entries">
              <div className="px-5 py-4 flex items-center justify-between border-b bb-divider">
                <h2 className="bb-h2 m-0">Transactions</h2>
                <span className="text-sm bb-muted bb-num">
                  {entries.filter(isValid).length} {entries.filter(isValid).length === 1 ? "entry" : "entries"}
                </span>
              </div>

              <div className="hidden sm:flex items-center gap-2 px-5 pt-3 pb-1 bb-label">
                <span className="w-[9.5rem] pl-2.5">Date</span>
                <span className="flex-1 pl-2.5">Description</span>
                <span className="w-32 pr-2.5 text-right">Amount (₹)</span>
                <span className="w-9" />
              </div>

              <ul className="list-none m-0 p-0 px-3 pb-2">
                {entries.map((entry, i) => (
                  <li key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1 px-2 py-2 sm:py-1 border-b bb-divider last:border-b-0">
                    <input
                      type="text"
                      aria-label={`Description for entry ${i + 1}`}
                      value={entry.name}
                      onChange={(e) => handleEntryChange(i, "name", e.target.value)}
                      placeholder="What did you spend on?"
                      className="bb-cell order-first w-full sm:order-none sm:flex-1"
                    />
                    <input
                      type="date"
                      aria-label={`Date for entry ${i + 1}`}
                      value={entry.date}
                      onChange={(e) => handleEntryChange(i, "date", e.target.value)}
                      className="bb-cell w-[9.5rem] sm:order-first"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      aria-label={`Amount for entry ${i + 1}`}
                      value={entry.amount}
                      onChange={(e) => handleEntryChange(i, "amount", e.target.value)}
                      placeholder="0.00"
                      className="bb-cell flex-1 sm:flex-none sm:w-32"
                    />
                    <button
                      type="button"
                      onClick={() => removeEntry(i)}
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

              <div className="px-5 py-3.5 flex items-center justify-between border-t bb-divider" style={{ background: "#fafbfc" }}>
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
                    disabled={saveState === "saving" || (!dirty && saveState !== "error")}
                    className="bb-btn bb-btn-primary bb-btn-sm"
                  >
                    {saveState === "saving" ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            </section>

            {/* Side column */}
            <aside className="space-y-6">
              <section className="bb-card p-5" aria-label="Daily allowance">
                <h2 className="bb-h2 m-0">Daily allowance</h2>
                {moneyLeft < 0 ? (
                  <>
                    <p className="bb-display bb-num m-0 mt-3 text-[1.75rem] font-semibold" style={{ color: "var(--danger)" }}>
                      {currency(Math.abs(moneyLeft))} over
                    </p>
                    <p className="mt-1 mb-0 text-sm bb-muted">You’ve passed this month’s budget.</p>
                  </>
                ) : (
                  <>
                    <p className="bb-display bb-num m-0 mt-3 text-[1.75rem] font-semibold">
                      {currency(Math.round(dailyBudgetLeft * 100) / 100)}
                      <span className="text-base font-medium bb-muted"> / day</span>
                    </p>
                    <p className="mt-1 mb-0 text-sm bb-muted">
                      For the {remainingDays} {remainingDays === 1 ? "day" : "days"} left after your latest dated expense.
                    </p>
                  </>
                )}
              </section>

              <section className="bb-card p-5" aria-label="AI spending summary" aria-busy={insightLoading}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="bb-h2 m-0">Spending summary</h2>
                  {insight && (
                    <button
                      type="button"
                      onClick={handleGetInsight}
                      disabled={insightLoading}
                      className="bb-link text-sm bg-transparent border-0 p-0 cursor-pointer disabled:opacity-50"
                    >
                      {insightStale ? "Update" : "Refresh"}
                    </button>
                  )}
                </div>

                {insightLoading ? (
                  <div className="mt-4 space-y-2.5" role="status" aria-label="Generating summary">
                    <div className="bb-skeleton h-4 w-full" />
                    <div className="bb-skeleton h-4 w-[92%]" />
                    <div className="bb-skeleton h-4 w-[96%]" />
                    <div className="bb-skeleton h-4 w-2/3" />
                  </div>
                ) : insight ? (
                  <>
                    <p className="mt-3 mb-0 text-[0.9375rem] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                      {insight}
                    </p>
                    {insightStale && (
                      <p className="mt-3 mb-0 text-xs bb-muted">You’ve changed your expenses since this summary. Update it to include them.</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-2 mb-4 text-sm bb-muted">
                      Get a short written summary of this month: where most of your money went and whether you’re on track.
                    </p>
                    <button type="button" onClick={handleGetInsight} className="bb-btn bb-btn-primary bb-btn-sm w-full">
                      Summarize this month
                    </button>
                  </>
                )}

                {insightError && (
                  <div className="bb-alert bb-alert-error mt-4" role="alert">{insightError}</div>
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