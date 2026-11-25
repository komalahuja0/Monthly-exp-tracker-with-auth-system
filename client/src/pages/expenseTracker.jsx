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

// Makes amounts and percentages in the AI text bold.
const renderInsight = (text) =>
  text
    .split(/((?:₹|Rs\.?)\s?[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%)/g)
    .map((part, i) =>
      i % 2 === 1 ? (
        <strong key={i} style={{ fontWeight: 700 }}>{part}</strong>
      ) : (
        part
      )
    );

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

  const [insight, setInsight] = useState("");
  const [insightSnapshot, setInsightSnapshot] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");

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

  // Used to tell whether the AI summary still matches what's on screen.
  const dataKey = JSON.stringify([budgetNum, carriedApplied, entries.filter(isValid).map((e) => [e.name.trim(), e.amount, e.date])]);
  const insightStale = insight !== "" && insightSnapshot !== dataKey;

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

  const handleGetInsight = async () => {
    setInsightError("");
    if (!entries.some(isValid)) {
      setInsightError("Add at least one expense to get a summary.");
      return;
    }
    if (!totalBudget) {
      setInsightError("Set a monthly budget to get a summary.");
      return;
    }
    try {
      setInsightLoading(true);
      // Make sure the server has the latest numbers before it analyses them.
      const saved = await persist(entries, budget);
      if (!saved) {
        setInsightError("Couldn’t save your latest changes, so the summary wasn’t generated.");
        return;
      }
      const res = await axios.get(`${API}/ai/insights/${month}/${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInsight(res.data.insight || "");
      setInsightSnapshot(dataKey);
    } catch (error) {
      console.log("AI summary error:", error.response?.status, error.response?.data || error.message);
      const status = error.response?.status;
      const serverMsg = error.response?.data?.message;
      if (!error.response) {
        setInsightError("Couldn’t reach the server. Check your connection and the API URL.");
      } else if (status === 404) {
        setInsightError("The summary service wasn’t found on the server (route /api/ai is not mounted).");
      } else if (status === 401) {
        setInsightError("Your session has expired. Log out and sign in again.");
      } else {
        setInsightError(`Couldn’t generate a summary: ${String(serverMsg || "server error").slice(0, 160)}`);
      }
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
          <div className="bb-skeleton h-44 w-full" style={{ borderRadius: 14 }} />
          <div className="bb-skeleton h-72 w-full" style={{ borderRadius: 14 }} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overview */}
          <section className="bb-card overflow-hidden" aria-label="Monthly overview">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-7 p-6 sm:p-7">
              {/* Budget */}
              <div className="lg:pr-6 min-w-0">
                <label htmlFor="budget" className="bb-label">Monthly budget</label>
                <div className="flex items-baseline gap-1 mt-1.5">
                  <span className="bb-display text-[1.75rem] font-semibold bb-muted">₹</span>
                  <input
                    id="budget"
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={budget}
                    onChange={(e) => { setBudget(e.target.value); setDirty(true); }}
                    placeholder="0"
                    className="bb-display bb-num w-full min-w-0 text-[1.75rem] font-semibold bg-transparent border-0 outline-none p-0"
                    style={{ color: "var(--ink)", MozAppearance: "textfield" }}
                  />
                </div>
                <p className="m-0 mt-1 text-sm bb-muted bb-num">
                  {carriedApplied > 0 ? `+ ${currency(carriedApplied)} carried over` : "Set this month’s limit"}
                </p>
              </div>

              {/* Spent */}
              <div className="lg:px-6 lg:border-l bb-divider min-w-0">
                <p className="bb-label m-0">Spent</p>
                <p className="bb-display bb-num m-0 mt-1.5 text-[1.75rem] font-semibold">{currency(totalSpent)}</p>
                <p className="m-0 mt-1 text-sm bb-muted bb-num">
                  {entries.filter(isValid).length} {entries.filter(isValid).length === 1 ? "transaction" : "transactions"}
                </p>
              </div>

              {/* Remaining */}
              <div className="lg:px-6 lg:border-l bb-divider min-w-0">
                <p className="bb-label m-0">{moneyLeft < 0 ? "Over budget by" : "Remaining"}</p>
                <p
                  className="bb-display bb-num m-0 mt-1.5 text-[1.75rem] font-semibold"
                  style={{ color: moneyLeft < 0 ? "var(--danger)" : "var(--accent)" }}
                >
                  {currency(Math.abs(moneyLeft))}
                </p>
                <p className="m-0 mt-1 text-sm bb-muted bb-num">
                  {totalBudget > 0 ? `${Math.round(percentUsed)}% of budget used` : "No budget set yet"}
                </p>
              </div>

              {/* Daily allowance */}
              <div className="lg:pl-6 lg:border-l bb-divider min-w-0">
                <p className="bb-label m-0">Daily allowance</p>
                {moneyLeft < 0 || monthEnded || totalBudget <= 0 ? (
                  <>
                    <p className="bb-display bb-num m-0 mt-1.5 text-[1.75rem] font-semibold bb-muted">—</p>
                    <p className="m-0 mt-1 text-sm bb-muted">
                      {moneyLeft < 0 ? "Budget exceeded" : monthEnded ? "This month has ended" : "Set a budget first"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="bb-display bb-num m-0 mt-1.5 text-[1.75rem] font-semibold">
                      {currency(Math.round(dailyBudgetLeft * 100) / 100)}
                      <span className="text-base font-medium bb-muted"> / day</span>
                    </p>
                    <p className="m-0 mt-1 text-sm bb-muted">
                      {isCurrentMonth
                        ? `${remainingDays} ${remainingDays === 1 ? "day" : "days"} left, incl. today`
                        : `Across ${remainingDays} days`}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="px-6 sm:px-7 pb-6">
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
            </div>

            {/* Carry over */}
            <div
              className="px-6 sm:px-7 py-4 border-t bb-divider flex items-center justify-between gap-4"
              style={{ background: "#fafbfc" }}
            >
              <div className="min-w-0">
                <p className="m-0 text-sm font-semibold" id="carry-label">Carry over unspent budget</p>
                <p className="m-0 mt-0.5 text-sm bb-muted">
                  {carriedAvailable > 0
                    ? `${MONTHS[prevMonth - 1]} ${prevEnded ? "had" : "has so far"} ${currency(carriedAvailable)} unspent. Add it to this month’s budget.`
                    : `${MONTHS[prevMonth - 1]} has nothing unspent to carry over.`}
                </p>
                {carryOver && carriedAvailable !== carriedAmount && (
                  <p className="m-0 mt-1 text-sm" style={{ color: "var(--warn)" }}>
                    {MONTHS[prevMonth - 1]}’s unspent is now {currency(carriedAvailable)}, but {currency(carriedAmount)} is carried.{" "}
                    <button type="button" onClick={refreshCarry} className="bb-linkbtn">Update</button>
                  </p>
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={carryOver}
                aria-labelledby="carry-label"
                onClick={toggleCarryOver}
                className="bb-switch"
              />
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

            {/* AI summary */}
            <section
              className="bb-card p-5 sm:p-6 lg:sticky lg:top-24"
              aria-label="AI spending summary"
              aria-busy={insightLoading}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                    aria-hidden="true"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2.5l2.1 6.4 6.4 2.1-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-2.1L12 2.5z" />
                    </svg>
                  </span>
                  <h2 className="bb-h2 m-0">AI summary</h2>
                </div>
                {insight && (
                  <button
                    type="button"
                    onClick={handleGetInsight}
                    disabled={insightLoading}
                    className="bb-btn bb-btn-secondary bb-btn-sm"
                  >
                    {insightStale ? "Update" : "Refresh"}
                  </button>
                )}
              </div>

              {insightLoading ? (
                <div className="mt-5 space-y-2.5" role="status" aria-label="Generating summary">
                  <div className="bb-skeleton h-4 w-full" />
                  <div className="bb-skeleton h-4 w-[92%]" />
                  <div className="bb-skeleton h-4 w-[96%]" />
                  <div className="bb-skeleton h-4 w-2/3" />
                </div>
              ) : insight ? (
                <>
                  <p
                    className="mt-4 mb-0 text-[1.0625rem] leading-[1.65] font-medium"
                    style={{ color: "var(--ink)" }}
                  >
                    {renderInsight(insight)}
                  </p>
                  {insightStale && (
                    <p className="mt-4 mb-0 text-sm bb-muted">
                      You’ve changed your expenses since this summary. Press Update to include them.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="mt-4 mb-5 text-[0.9375rem] bb-muted">
                    Get a short written summary of this month: how you’re tracking, where most of your money went, and one thing to try.
                  </p>
                  <button type="button" onClick={handleGetInsight} className="bb-btn bb-btn-primary w-full">
                    Summarize this month
                  </button>
                </>
              )}

              {insightError && (
                <div className="bb-alert bb-alert-error mt-4" role="alert">{insightError}</div>
              )}
            </section>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default ExpenseTracker;