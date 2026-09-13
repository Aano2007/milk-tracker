import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Milkrun — daily milk tracker" },
      {
        name: "description",
        content:
          "Mark the days you drink milk, log skips with a reason, and see your monthly milk cost add up.",
      },
      { property: "og:title", content: "Milkrun — daily milk tracker" },
      {
        property: "og:description",
        content:
          "Mark the days you drink milk, log skips with a reason, and see your monthly milk cost add up.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type EntryStatus = "drank" | "skipped";
type Entry = { status: EntryStatus; reason?: string | undefined };
type Entries = Record<string, Entry>;

const ENTRIES_KEY = "milkrun-entries-v1";
const PRICE_KEY = "milkrun-price-v1";
const DEFAULT_PRICE = 30;

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function loadEntries(): Entries {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(ENTRIES_KEY) ?? "{}") as Entries;
  } catch {
    return {};
  }
}

function loadPrice(): number {
  if (typeof window === "undefined") return DEFAULT_PRICE;
  const raw = window.localStorage.getItem(PRICE_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PRICE;
}

function formatMoney(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function Index() {
  const today = new Date();
  const [entries, setEntries] = useState<Entries>({});
  const [price, setPrice] = useState<number>(DEFAULT_PRICE);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [skipDay, setSkipDay] = useState<number | null>(null);
  const [skipReason, setSkipReason] = useState("");
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceDraft, setPriceDraft] = useState("");

  useEffect(() => {
    setEntries(loadEntries());
    setPrice(loadPrice());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  }, [entries, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(PRICE_KEY, String(price));
  }, [price, hydrated]);

  const { year, month } = view;
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday

  const monthEntries = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
    return Object.entries(entries).filter(([k]) => k.startsWith(prefix));
  }, [entries, year, month]);

  const drankCount = monthEntries.filter(([, e]) => e.status === "drank").length;
  const skippedCount = monthEntries.filter(([, e]) => e.status === "skipped").length;
  const monthTotal = drankCount * price;
  const daysTallied = drankCount + skippedCount;

  const latestSkip = useMemo(() => {
    const skips = monthEntries
      .filter(([, e]) => e.status === "skipped" && e.reason)
      .sort(([a], [b]) => (a < b ? 1 : -1));
    return skips[0] ?? null;
  }, [monthEntries]);

  const pastMonths = useMemo(() => {
    const map = new Map<string, { year: number; month: number; drank: number; skipped: number }>();
    for (const [k, e] of Object.entries(entries)) {
      const [y = 0, m = 1] = k.split("-").map(Number);
      const key = `${y}-${m}`;
      if (y === today.getFullYear() && m - 1 === today.getMonth()) continue;
      const cur = map.get(key) ?? { year: y, month: m - 1, drank: 0, skipped: 0 };
      if (e.status === "drank") cur.drank += 1;
      else cur.skipped += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.month - a.month,
    );
  }, [entries, today]);

  function tapDay(day: number) {
    if (isCurrentMonth && day > today.getDate()) return;
    const key = dateKey(year, month, day);
    const existing = entries[key];
    if (!existing) {
      // empty → drank
      setEntries((prev) => ({ ...prev, [key]: { status: "drank" } }));
    } else if (existing.status === "drank") {
      // drank → open skip dialog
      setSkipDay(day);
      setSkipReason("");
    } else {
      // skipped → clear (back to empty)
      setEntries((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setSkipDay(null);
    }
  }

  function saveSkip() {
    if (skipDay == null) return;
    const key = dateKey(year, month, skipDay);
    setEntries((prev) => ({
      ...prev,
      [key]: { status: "skipped", reason: skipReason.trim() || undefined },
    }));
    setSkipDay(null);
    setSkipReason("");
    (document.activeElement as HTMLElement)?.blur();
  }

  function shiftMonth(delta: number) {
    setSkipDay(null);
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function savePrice() {
    const n = Number(priceDraft);
    if (Number.isFinite(n) && n > 0) setPrice(n);
    setEditingPrice(false);
    (document.activeElement as HTMLElement)?.blur();
  }

  const cells: Array<{ day: number; inMonth: boolean } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, inMonth: true });
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= trailing; i++) cells.push({ day: i, inMonth: false });

  return (
    <div className="min-h-screen bg-background font-body text-foreground antialiased">
      <div className="mx-auto max-w-[380px] px-5 pt-6 pb-16">
        {/* top bar */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-card shadow-clay overflow-hidden">
              <img src="/milk-icon.png" alt="Milk" className="size-9 object-contain" />
            </div>
            <div className="leading-tight">
              <p className="font-display text-lg leading-none font-semibold">Milkrun</p>
              <p className="text-xs font-medium text-soft">morning doorstep tally</p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingPrice(true);
              setPriceDraft(String(price));
            }}
            aria-label="Edit daily milk price"
            className="tile-press grid size-10 shrink-0 cursor-pointer place-items-center rounded-2xl bg-card text-soft shadow-clay-sm"
          >
            <span className="text-lg leading-none">=</span>
          </button>
        </header>

        {/* price editor */}
        {editingPrice && (
          <div className="mt-4 flex items-center gap-2 rounded-[20px] bg-card p-4 shadow-clay" onClick={(e) => e.stopPropagation()}>
            <label className="text-sm font-semibold text-soft" htmlFor="price-input">
              Price per day
            </label>
            <input
              id="price-input"
              type="number"
              min="0"
              step="0.5"
              value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && savePrice()}
              autoFocus
              className="w-24 rounded-xl bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none ring-butter focus:ring-2"
            />
            <button
              onClick={savePrice}
              className="tile-press cursor-pointer rounded-xl bg-butter px-4 py-2 text-sm font-semibold text-butter-deep shadow-tile-butter"
            >
              Save
            </button>
            <button
              onClick={() => setEditingPrice(false)}
              className="tile-press cursor-pointer rounded-xl bg-card px-3 py-2 text-sm font-semibold text-soft shadow-clay-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* hero: month + cost */}
        <section className="mt-6">
          <div className="rounded-[28px] bg-card p-5 shadow-clay-lg">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-soft uppercase">
                  {isCurrentMonth ? "This month" : "Month"}
                </p>
                <h1 className="mt-1 font-display text-3xl leading-tight font-semibold text-balance">
                  {MONTH_NAMES[month]!} {year}
                </h1>
              </div>
              <button
                onClick={() => {
                  setEditingPrice(true);
                  setPriceDraft(String(price));
                }}
                className="tile-press shrink-0 cursor-pointer rounded-2xl bg-background px-3 py-2 text-xs font-semibold text-soft shadow-clay-sm"
              >
                {formatMoney(price)} / day
              </button>
            </div>

            <div className="mt-5 flex items-end gap-3">
              <p className="font-display text-5xl leading-none font-semibold">{formatMoney(monthTotal)}</p>
              <span className="mb-1 text-sm font-medium text-soft">
                spent · {drankCount} {drankCount === 1 ? "glass" : "glasses"}
              </span>
            </div>

            <div className="mt-4">
              <div className="h-3 overflow-hidden rounded-full bg-background shadow-inner">
                <div
                  className="h-full rounded-full bg-milk-deep transition-all"
                  style={{ width: `${daysInMonth ? Math.min(100, (daysTallied / daysInMonth) * 100) : 0}%` }}
                />
              </div>
              <p className="mt-2 text-xs font-medium text-soft">
                {daysTallied} of {daysInMonth} days tallied
              </p>
            </div>
          </div>
        </section>

        {/* calendar */}
        <section className="mt-6">
          <div className="flex items-center justify-between px-1 pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="tile-press grid size-8 cursor-pointer place-items-center rounded-xl bg-card font-display text-sm font-semibold text-soft shadow-clay-sm"
              >
                ‹
              </button>
              <p className="font-display text-base font-semibold">{MONTH_NAMES[month]!}</p>
              <button
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="tile-press grid size-8 cursor-pointer place-items-center rounded-xl bg-card font-display text-sm font-semibold text-soft shadow-clay-sm"
              >
                ›
              </button>
            </div>
            <p className="text-xs font-medium text-soft">tap a day to mark</p>
          </div>

          <div className="rounded-[24px] bg-card p-4 shadow-clay-lg">
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="pb-1 text-[11px] font-semibold text-soft">
                  {d}
                </div>
              ))}

              {cells.map((cell, i) => {
                if (!cell) return <div key={`blank-${i}`} className="aspect-square" />;
                if (!cell.inMonth) {
                  return (
                    <div
                      key={`next-${i}`}
                      className="grid aspect-square place-items-center rounded-2xl bg-background shadow-tile-empty"
                    >
                      <span className="text-sm font-medium text-soft">{cell.day}</span>
                    </div>
                  );
                }
                const key = dateKey(year, month, cell.day);
                const entry = entries[key];
                const isToday = isCurrentMonth && cell.day === today.getDate();
                const isFuture = isCurrentMonth && cell.day > today.getDate();

                if (isFuture) {
                  return (
                    <div
                      key={key}
                      className="grid aspect-square place-items-center rounded-2xl bg-background shadow-tile-empty"
                    >
                      <span className="text-sm font-medium text-soft">{cell.day}</span>
                    </div>
                  );
                }

                const base =
                  "tile-press grid aspect-square cursor-pointer place-items-center rounded-2xl";
                const todayRing = isToday ? "ring-2 ring-butter ring-offset-2 ring-offset-card" : "";

                if (entry?.status === "drank") {
                  return (
                    <button
                      key={key}
                      onClick={() => tapDay(cell.day)}
                      aria-label={`Day ${cell.day}, drank milk. Tap to change.`}
                      className={`${base} bg-milk shadow-tile-milk ${todayRing}`}
                    >
                      <span className="font-display text-lg font-semibold text-milk-deep">{cell.day}</span>
                    </button>
                  );
                }
                if (entry?.status === "skipped") {
                  return (
                    <button
                      key={key}
                      onClick={() => tapDay(cell.day)}
                      aria-label={`Day ${cell.day}, skipped${entry.reason ? `: ${entry.reason}` : ""}. Tap to clear.`}
                      className={`${base} bg-butter shadow-tile-butter ${todayRing}`}
                    >
                      <span className="font-display text-lg font-semibold text-butter-deep">{cell.day}</span>
                    </button>
                  );
                }
                return (
                  <button
                    key={key}
                    onClick={() => tapDay(cell.day)}
                    aria-label={`Day ${cell.day}, not marked. Tap to mark drank.`}
                    className={`${base} bg-background shadow-tile-empty ${todayRing}`}
                  >
                    <span className="text-sm font-medium text-soft">{cell.day}</span>
                  </button>
                );
              })}
            </div>

            {/* legend */}
            <div className="mt-4 flex items-center justify-between px-1 text-xs font-medium text-soft">
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-milk-deep" />
                drank
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-butter" />
                skipped
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-background ring-1 ring-black/5" />
                empty
              </span>
            </div>
          </div>
        </section>

        {/* skip reason editor */}
        {skipDay != null && (
          <section className="mt-4">
            <div className="rounded-[20px] bg-berry/15 p-4 shadow-note-berry">
              <p className="text-sm font-semibold text-berry-deep">
                Skipped {MONTH_NAMES[month]!.slice(0, 3)} {skipDay} — why?
              </p>
              <input
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveSkip()}
                placeholder="e.g. no milk at the doorstep"
                autoFocus
                className="mt-2 w-full rounded-xl bg-card px-3 py-2 text-sm font-medium text-foreground outline-none ring-butter focus:ring-2"
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={saveSkip}
                  className="tile-press cursor-pointer rounded-xl bg-berry px-4 py-2 text-sm font-semibold text-berry-deep shadow-tile-berry"
                >
                  Save skip
                </button>
                <button
                  onClick={() => {
                    setSkipDay(null);
                    setSkipReason("");
                  }}
                  className="tile-press cursor-pointer rounded-xl bg-card px-4 py-2 text-sm font-semibold text-soft shadow-clay-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </section>
        )}

        {/* latest skip note */}
        {skipDay == null && latestSkip && (
          <section className="mt-4">
            <div className="flex items-start gap-3 rounded-[20px] bg-berry/15 p-4 shadow-note-berry">
              <span className="mt-0.5 size-3 shrink-0 rounded-full bg-berry" />
              <p className="text-sm font-medium text-pretty text-berry-deep">
                {MONTH_NAMES[month]!.slice(0, 3)} {Number(latestSkip[0].split("-")[2])} · {latestSkip[1].reason}
              </p>
            </div>
          </section>
        )}

        {/* past months */}
        {pastMonths.length > 0 && (
          <section className="mt-7">
            <div className="flex items-center justify-between px-1 pb-3">
              <p className="font-display text-base font-semibold">Past months</p>
              <p className="text-xs font-medium text-soft">tap to view</p>
            </div>

            <div className="space-y-3">
              {pastMonths.map((m) => (
                <button
                  key={`${m.year}-${m.month}`}
                  onClick={() => {
                    setSkipDay(null);
                    setView({ year: m.year, month: m.month });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="tile-press flex w-full cursor-pointer items-center gap-3 rounded-[20px] bg-card p-4 text-left shadow-clay"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-milk">
                    <span className="font-display text-base font-semibold text-milk-deep">
                      {MONTH_NAMES[m.month]!.slice(0, 3)}
                    </span>
                  </span>
                  <span className="flex-1 leading-tight">
                    <span className="block font-display text-sm font-semibold">
                      {MONTH_NAMES[m.month]!} {m.year}
                    </span>
                    <span className="block text-xs font-medium text-soft">
                      {m.drank} {m.drank === 1 ? "glass" : "glasses"} · {m.skipped} skipped
                    </span>
                  </span>
                  <span className="font-display text-lg font-semibold">{formatMoney(m.drank * price)}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
