"use client";

import { useEffect, useState } from "react";
import { readJson } from "@/lib/upload";
import { DEFAULT_PLAN, PLAN_NAMES, PLAN_PERKS, type PlanId, type Plans } from "@/lib/plans";

/**
 * Weekly vs lifetime, then a checkout button. POSTs `{ plan }` to `endpoint`
 * and follows the Stripe Checkout URL it returns.
 * `preview` = an admin looking at someone else's paywall: explains instead of paying.
 */
export default function PlanPicker({
  plans,
  endpoint,
  offerEndsAt = null,
  preview = false,
  onCheckout,
}: {
  plans: Plans;
  endpoint: string;
  /** When the lifetime discount stops (ISO). Null = no discount here. The server checks it again at checkout. */
  offerEndsAt?: string | null;
  preview?: boolean;
  /** Analytics hook, called when they press the button. */
  onCheckout?: (plan: PlanId) => void;
}) {
  const [plan, setPlan] = useState<PlanId>(DEFAULT_PLAN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { weekly, lifetime } = plans;
  const left = useSecondsLeft(lifetime.sale ? offerEndsAt : null);
  // null = not counted yet (first paint): show the sale price, the clock fills in a moment later.
  const sale = lifetime.sale && offerEndsAt && (left === null || left > 0) ? lifetime.sale : null;
  const lifetimePrice = sale?.price ?? lifetime.price;

  async function checkout() {
    if (preview) {
      setError("Admin preview: only the user who sent this profile can pay.");
      return;
    }
    onCheckout?.(plan);
    setBusy(true);
    setError(null);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await readJson<{ checkoutUrl?: string }>(res);
    if (res.ok && data.checkoutUrl) {
      window.location.assign(data.checkoutUrl);
      return;
    }
    setBusy(false);
    setError(data.error ?? "Couldn't open checkout. Try again.");
  }

  const cta =
    plan === "weekly"
      ? `Start for ${weekly.intro ?? weekly.price}`
      : `Get lifetime · ${lifetimePrice}`;
  const fine =
    plan === "weekly"
      ? weekly.intro
        ? `${weekly.intro} for your first week, then ${weekly.price} every week. Cancel anytime from your account.`
        : `${weekly.price} every week. Cancel anytime from your account.`
      : "One-time payment. No subscription. Secure checkout by Stripe.";

  return (
    <div className="text-left">
      <div role="radiogroup" aria-label="Choose a plan" className="grid gap-2.5">
        <PlanOption
          on={plan === "lifetime"}
          onPick={() => setPlan("lifetime")}
          name={PLAN_NAMES.lifetime}
          note={PLAN_PERKS.lifetime}
          price={lifetimePrice}
          was={sale ? lifetime.price : undefined}
          priceNote="once"
          badge={sale ? `${sale.percentOff}% off · ends in ${left === null ? "…" : clock(left)}` : "Best value"}
          hot={Boolean(sale)}
        />
        <PlanOption
          on={plan === "weekly"}
          onPick={() => setPlan("weekly")}
          name={PLAN_NAMES.weekly}
          note={PLAN_PERKS.weekly}
          price={weekly.intro ?? weekly.price}
          priceNote={weekly.intro ? `first week, then ${weekly.price}/wk` : "per week"}
        />
      </div>

      <button
        type="button"
        onClick={checkout}
        disabled={busy}
        className="mt-4 w-full rounded-full bg-flame py-5 text-xl font-bold text-paper shadow-[0_10px_0_-2px_var(--flame-deep)] transition active:translate-y-1 active:shadow-[0_6px_0_-2px_var(--flame-deep)] hover:bg-flame-deep disabled:opacity-80"
      >
        {busy ? "One sec…" : cta}
      </button>
      <p className="mt-4 text-center text-xs text-muted text-pretty">{fine}</p>
      {error && (
        <p role="alert" className="mt-2 text-center text-sm text-flame-deep">
          {error}
        </p>
      )}
    </div>
  );
}

/** Seconds until `endsAt`, ticking every second. Null until the first tick (and when there's no deadline). */
function useSecondsLeft(endsAt: string | null): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!endsAt) return;
    const end = new Date(endsAt).getTime();
    const tick = () => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [endsAt]);
  return endsAt ? left : null;
}

/** 872 -> "14:32" */
function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function PlanOption({
  on,
  onPick,
  name,
  note,
  price,
  was,
  priceNote,
  badge,
  hot = false,
}: {
  on: boolean;
  onPick: () => void;
  name: string;
  /** Line under the name: what the plan includes. */
  note?: string;
  price: string;
  /** The full price, struck through next to the discounted one. */
  was?: string;
  priceNote: string;
  badge?: string;
  /** Flame-coloured badge (a live discount) instead of the dark one. */
  hot?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={`relative flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition active:scale-[0.99] ${
        on ? "border-flame bg-flame/5" : "border-line bg-paper hover:border-muted"
      }`}
    >
      {badge && (
        <span
          className={`absolute -top-2.5 right-4 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide tabular-nums text-paper ${
            hot ? "bg-flame" : "bg-ink"
          }`}
        >
          {badge}
        </span>
      )}
      <span
        aria-hidden
        className={`grid size-5 shrink-0 place-items-center rounded-full transition-colors ${
          on ? "bg-flame" : "border-2 border-line"
        }`}
      >
        {on && <span className="size-2 rounded-full bg-paper" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold leading-tight">{name}</span>
        {note && <span className="mt-0.5 block text-sm leading-tight text-muted">{note}</span>}
      </span>
      <span className="shrink-0 text-right">
        <span className="block leading-tight">
          {was && <s className="mr-1.5 text-sm text-muted">{was}</s>}
          <span className="text-lg font-extrabold">{price}</span>
        </span>
        <span className="block text-xs text-muted leading-tight">{priceNote}</span>
      </span>
    </button>
  );
}
