"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { isAllowedAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

type PaymentRow = {
  id: string;
  user_id: string;
  product_id: string | null;
  feature_type: string;
  amount: number;
  currency: string;
  payment_provider: string | null;
  payment_status: string;
  quantity: number | null;
  stripe_invoice_id: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  created_at: string;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  product_id: string;
  target_mode: "solo" | "duo" | "group";
  status: string;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
};

type ProductRow = {
  id: string;
  name: string;
  feature_type: string;
  target_mode: string;
  price: number;
  currency: string;
  duration_minutes: number | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
};

type ProductPerformance = {
  productId: string;
  name: string;
  mode: string;
  feature: string;
  sales: number;
  revenue: number;
};

const PAGE_SIZE = 20;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const AT_RISK_SUBSCRIPTION_STATUSES = new Set(["past_due", "unpaid", "incomplete"]);

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));
  } catch {
    return `${currency || "USD"} ${Number(amount || 0).toFixed(2)}`;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

function formatLabel(value?: string | null) {
  return String(value || "Unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function RevenuePage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const loadRevenue = useCallback(async (manual = false) => {
    try {
      if (manual) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");

      const [paymentsResult, subscriptionsResult, productsResult, profilesResult] =
        await Promise.all([
          supabase
            .from("purchase_history")
            .select(
              "id,user_id,product_id,feature_type,amount,currency,payment_provider,payment_status,quantity,stripe_invoice_id,stripe_subscription_id,stripe_checkout_session_id,created_at"
            )
            .order("created_at", { ascending: false })
            .limit(1000),
          supabase
            .from("stripe_subscriptions")
            .select(
              "id,user_id,product_id,target_mode,status,cancel_at_period_end,current_period_start,current_period_end,created_at"
            )
            .order("created_at", { ascending: false })
            .limit(1000),
          supabase
            .from("premium_products")
            .select("id,name,feature_type,target_mode,price,currency,duration_minutes"),
          supabase.from("profiles").select("id,full_name").limit(5000),
        ]);

      const firstError = [
        paymentsResult.error,
        subscriptionsResult.error,
        productsResult.error,
        profilesResult.error,
      ].find(Boolean);
      if (firstError) throw firstError;

      const paymentRows = (paymentsResult.data || []) as PaymentRow[];
      setPayments(paymentRows);
      setSubscriptions((subscriptionsResult.data || []) as SubscriptionRow[]);
      setProducts((productsResult.data || []) as ProductRow[]);
      setProfiles((profilesResult.data || []) as ProfileRow[]);

      const firstCompletedCurrency = paymentRows.find(
        (row) => row.payment_status === "completed"
      )?.currency;
      if (firstCompletedCurrency) {
        setCurrency((current) => current || firstCompletedCurrency.toUpperCase());
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Revenue data could not be loaded.";
      setError(
        `${message} If payment rows are blocked, run C:\\dating\\sql\\dating_subscription_entitlement_repair.sql in Supabase SQL Editor.`
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const email = session?.user?.email?.toLowerCase() || "";

      if (!email || !isAllowedAdminEmail(email)) {
        router.replace("/admin");
        return;
      }

      if (!mounted) return;
      setCheckingAccess(false);
      await loadRevenue();
    };

    void boot();
    return () => {
      mounted = false;
    };
  }, [loadRevenue, router]);

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );
  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.full_name || "Unnamed member"])),
    [profiles]
  );

  const completedPayments = useMemo(
    () => payments.filter((payment) => payment.payment_status === "completed"),
    [payments]
  );
  const currencies = useMemo(() => {
    const values = Array.from(
      new Set(completedPayments.map((payment) => String(payment.currency || "USD").toUpperCase()))
    );
    return values.length ? values : ["USD"];
  }, [completedPayments]);

  useEffect(() => {
    if (!currencies.includes(currency)) setCurrency(currencies[0]);
  }, [currencies, currency]);

  const selectedPayments = useMemo(
    () => completedPayments.filter((payment) => payment.currency.toUpperCase() === currency),
    [completedPayments, currency]
  );

  const metrics = useMemo(() => {
    const now = Date.now();
    const today = startOfToday();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const totalRevenue = selectedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const todayRevenue = selectedPayments
      .filter((payment) => new Date(payment.created_at).getTime() >= today)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const thirtyDayRevenue = selectedPayments
      .filter((payment) => new Date(payment.created_at).getTime() >= thirtyDaysAgo)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    const activeSubscriptions = subscriptions.filter((subscription) =>
      ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)
    );
    const mrr = activeSubscriptions.reduce((sum, subscription) => {
      const product = productMap.get(subscription.product_id);
      if (!product || product.currency.toUpperCase() !== currency) return sum;
      const duration = Math.max(Number(product.duration_minutes || 43200), 1);
      return sum + Number(product.price || 0) * (43200 / duration);
    }, 0);

    return {
      totalRevenue,
      todayRevenue,
      thirtyDayRevenue,
      mrr,
      successfulPayments: selectedPayments.length,
      activeSubscriptions: activeSubscriptions.length,
      cancelingSubscriptions: activeSubscriptions.filter((row) => row.cancel_at_period_end).length,
      atRiskSubscriptions: subscriptions.filter((row) => AT_RISK_SUBSCRIPTION_STATUSES.has(row.status)).length,
    };
  }, [currency, productMap, selectedPayments, subscriptions]);

  const chart = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (13 - index));
      return { key: dateKey(date), label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: 0 };
    });
    const dayMap = new Map(days.map((day) => [day.key, day]));
    selectedPayments.forEach((payment) => {
      const parsed = new Date(payment.created_at);
      const bucket = dayMap.get(dateKey(parsed));
      if (bucket) bucket.value += Number(payment.amount || 0);
    });
    const maximum = Math.max(...days.map((day) => day.value), 1);
    return days.map((day) => ({ ...day, height: Math.max(4, (day.value / maximum) * 100) }));
  }, [selectedPayments]);

  const productPerformance = useMemo(() => {
    const grouped = new Map<string, ProductPerformance>();
    selectedPayments.forEach((payment) => {
      const product = payment.product_id ? productMap.get(payment.product_id) : null;
      const key = payment.product_id || `feature-${payment.feature_type}`;
      const current = grouped.get(key) || {
        productId: key,
        name: product?.name || formatLabel(payment.feature_type),
        mode: product?.target_mode || "—",
        feature: product?.feature_type || payment.feature_type,
        sales: 0,
        revenue: 0,
      };
      current.sales += 1;
      current.revenue += Number(payment.amount || 0);
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).sort((a, b) => b.revenue - a.revenue);
  }, [productMap, selectedPayments]);

  const filteredPayments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payments.filter((payment) => {
      if (statusFilter !== "all" && payment.payment_status !== statusFilter) return false;
      const product = payment.product_id ? productMap.get(payment.product_id) : null;
      const member = profileMap.get(payment.user_id) || "";
      return !term || [member, product?.name, payment.feature_type, payment.stripe_invoice_id, payment.stripe_subscription_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [payments, productMap, profileMap, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE));
  const visiblePayments = filteredPayments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search, statusFilter]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  if (checkingAccess) {
    return (
      <main className="admin-dashboard-page revenue-page">
        <div className="admin-dashboard-shell">
          <div className="admin-main-card"><h1 className="admin-section-title">Checking admin access...</h1></div>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-dashboard-page revenue-page">
      <div className="admin-dashboard-shell">
        <Header />

        <section className="revenue-toolbar">
          <div>
            <span className="revenue-kicker">Live billing overview</span>
            <h2>Revenue command center</h2>
            <p>Completed payments are sourced from verified Stripe webhook records.</p>
          </div>
          <div className="revenue-toolbar-actions">
            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {currencies.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <button type="button" onClick={() => void loadRevenue(true)} disabled={refreshing}>
              {refreshing ? "Refreshing..." : "Refresh revenue"}
            </button>
          </div>
        </section>

        {error ? <div className="admin-error-box admin-global-error">{error}</div> : null}

        {loading ? (
          <section className="admin-main-card"><h2 className="admin-section-title">Loading revenue...</h2></section>
        ) : (
          <>
            <section className="revenue-metric-grid">
              <article className="revenue-metric revenue-metric-primary"><span>All-time revenue</span><strong>{money(metrics.totalRevenue, currency)}</strong><small>{metrics.successfulPayments} successful payments</small></article>
              <article className="revenue-metric"><span>Last 30 days</span><strong>{money(metrics.thirtyDayRevenue, currency)}</strong><small>{money(metrics.todayRevenue, currency)} collected today</small></article>
              <article className="revenue-metric"><span>Estimated MRR</span><strong>{money(metrics.mrr, currency)}</strong><small>Normalized from active plan prices</small></article>
              <article className="revenue-metric"><span>Active subscriptions</span><strong>{metrics.activeSubscriptions}</strong><small>{metrics.cancelingSubscriptions} ending this period</small></article>
              <article className={`revenue-metric ${metrics.atRiskSubscriptions ? "revenue-metric-warning" : ""}`}><span>Billing attention</span><strong>{metrics.atRiskSubscriptions}</strong><small>Past due, unpaid, or incomplete</small></article>
            </section>

            <section className="revenue-insight-grid">
              <article className="admin-main-card revenue-chart-card">
                <div className="revenue-section-heading"><div><span>14-day trend</span><h3>Daily collected revenue</h3></div><strong>{currency}</strong></div>
                <div className="revenue-chart">
                  {chart.map((day) => (
                    <div className="revenue-chart-column" key={day.key} title={`${day.label}: ${money(day.value, currency)}`}>
                      <div className="revenue-chart-value">{day.value ? money(day.value, currency) : ""}</div>
                      <div className="revenue-chart-track"><div className="revenue-chart-bar" style={{ height: `${day.height}%` }} /></div>
                      <span>{day.label}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="admin-main-card revenue-products-card">
                <div className="revenue-section-heading"><div><span>Product performance</span><h3>Top earning plans and packs</h3></div></div>
                <div className="revenue-product-list">
                  {productPerformance.length ? productPerformance.slice(0, 8).map((product, index) => (
                    <div className="revenue-product-row" key={product.productId}>
                      <span className="revenue-product-rank">{index + 1}</span>
                      <span className="revenue-product-copy"><strong>{product.name}</strong><small>{formatLabel(product.mode)} · {formatLabel(product.feature)} · {product.sales} sales</small></span>
                      <strong>{money(product.revenue, currency)}</strong>
                    </div>
                  )) : <div className="admin-empty-card">No completed payments yet.</div>}
                </div>
              </article>
            </section>

            <section className="admin-main-card revenue-table-card">
              <div className="revenue-section-heading revenue-table-heading">
                <div><span>Ledger</span><h3>Payment history</h3><p>{filteredPayments.length} recorded transactions</p></div>
                <div className="revenue-table-filters">
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search member, product, invoice..." />
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="all">All statuses</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
              </div>

              <div className="revenue-table-wrap">
                <table className="revenue-table">
                  <thead><tr><th>Date</th><th>Member</th><th>Product</th><th>Mode</th><th>Type</th><th>Status</th><th>Amount</th></tr></thead>
                  <tbody>
                    {visiblePayments.length ? visiblePayments.map((payment) => {
                      const product = payment.product_id ? productMap.get(payment.product_id) : null;
                      return (
                        <tr key={payment.id}>
                          <td><strong>{formatDate(payment.created_at)}</strong><small>{payment.stripe_invoice_id ? "Recurring invoice" : "Checkout payment"}</small></td>
                          <td>{profileMap.get(payment.user_id) || "Unknown member"}<small>{payment.user_id.slice(0, 8)}</small></td>
                          <td>{product?.name || formatLabel(payment.feature_type)}<small>{payment.payment_provider || "Manual"}</small></td>
                          <td><span className="revenue-mode-pill">{formatLabel(product?.target_mode || "—")}</span></td>
                          <td>{formatLabel(payment.feature_type)}</td>
                          <td><span className={`revenue-status revenue-status-${payment.payment_status}`}>{formatLabel(payment.payment_status)}</span></td>
                          <td className="revenue-amount">{money(Number(payment.amount || 0), payment.currency || "USD")}</td>
                        </tr>
                      );
                    }) : <tr><td colSpan={7}><div className="admin-empty-card">No transactions match these filters.</div></td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="revenue-pagination">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Previous</button>
                <span>Page {page} of {pageCount}</span>
                <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>Next</button>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
