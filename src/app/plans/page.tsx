"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import AdminCollapsible from "@/components/AdminCollapsible";
import { isAllowedAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

type Mode = "solo" | "duo" | "group";
type FeatureType =
  | "plan"
  | "boost"
  | "vibe"
  | "top_placement"
  | "liked_you"
  | "unlimited_likes"
  | "undo_reverse"
  | "match_reverse"
  | "flower";

type DurationUnit = "day" | "week" | "month" | "custom";

type PremiumProduct = {
  id: string;
  name: string;
  feature_type: FeatureType;
  target_mode: Mode;
  price: number;
  currency: string;
  duration_minutes: number;
  is_active: boolean;
  bundle_quantity?: number | null;
  flower_type?: string | null;
  flower_icon?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

type BundleFeatureKey =
  | "likes"
  | "vibes"
  | "boosts"
  | "topPlacement"
  | "whoLikedYou"
  | "undoReverse"
  | "matchReverse"
  | "flowers";

type BundleLimit = {
  enabled: boolean;
  unlimited: boolean;
  quantity: string;
};

const FEATURE_OPTIONS: { id: FeatureType; label: string; hint: string }[] = [
  { id: "liked_you", label: "Who Liked You", hint: "Timed access product." },
  { id: "vibe", label: "Vibes", hint: "Count-based Give Vibe packs." },
  { id: "boost", label: "Boosts", hint: "Boost wallet or timed boost product." },
  { id: "top_placement", label: "Top Placement", hint: "Priority placement duration." },
  { id: "unlimited_likes", label: "Unlimited Likes", hint: "Unlimited likes for the product duration." },
  { id: "undo_reverse", label: "Undo", hint: "Reverse recent swipe actions with a custom limit or unlimited use." },
  { id: "match_reverse", label: "Re-match", hint: "Restore matches the member previously unmatched, with a custom limit or unlimited use." },
  { id: "flower", label: "Flowers", hint: "Paid flower reaction packs." },
];

const BUNDLE_FEATURES: { id: BundleFeatureKey; label: string; hint: string }[] = [
  { id: "likes", label: "Likes", hint: "Set unlimited likes or a monthly cap." },
  { id: "vibes", label: "Vibes", hint: "Give Vibe balance included in plan." },
  { id: "boosts", label: "Boosts", hint: "Boost balance included in plan." },
  { id: "topPlacement", label: "Top Placement", hint: "Priority placement for the full plan duration." },
  { id: "whoLikedYou", label: "Who Liked You", hint: "Unlock profile visitors/likes." },
  { id: "undoReverse", label: "Undo", hint: "Reverse swipe actions during the plan, with a custom limit or unlimited use." },
  { id: "matchReverse", label: "Re-match", hint: "Restore previously unmatched connections, with a custom limit or unlimited use." },
  { id: "flowers", label: "Flowers", hint: "Flower reaction pack included." },
];

const FEATURE_ID_BY_BUNDLE_KEY: Record<BundleFeatureKey, Exclude<FeatureType, "plan">> = {
  likes: "unlimited_likes",
  vibes: "vibe",
  boosts: "boost",
  topPlacement: "top_placement",
  whoLikedYou: "liked_you",
  undoReverse: "undo_reverse",
  matchReverse: "match_reverse",
  flowers: "flower",
};

const ACCESS_ONLY_BUNDLE_FEATURES = new Set<BundleFeatureKey>([
  "likes",
  "topPlacement",
  "whoLikedYou",
]);

const EMPTY_BUNDLE_LIMITS: Record<BundleFeatureKey, BundleLimit> = {
  likes: { enabled: true, unlimited: true, quantity: "0" },
  vibes: { enabled: true, unlimited: false, quantity: "10" },
  boosts: { enabled: true, unlimited: false, quantity: "3" },
  topPlacement: { enabled: false, unlimited: false, quantity: "1" },
  whoLikedYou: { enabled: true, unlimited: true, quantity: "0" },
  undoReverse: { enabled: false, unlimited: false, quantity: "3" },
  matchReverse: { enabled: false, unlimited: false, quantity: "1" },
  flowers: { enabled: false, unlimited: false, quantity: "5" },
};

function durationToMinutes(value: string, unit: DurationUnit) {
  const amount = Math.max(0, Number(value || 0));
  if (!Number.isFinite(amount)) return 0;
  if (unit === "day") return Math.round(amount * 24 * 60);
  if (unit === "week") return Math.round(amount * 7 * 24 * 60);
  if (unit === "month") return Math.round(amount * 30 * 24 * 60);
  return Math.round(amount);
}

function formatDuration(minutes: number) {
  if (!minutes) return "No duration";
  const days = minutes / 1440;
  if (Number.isInteger(days) && days >= 1) {
    if (days === 7) return "1 week";
    if (days === 30) return "1 month";
    return `${days} days`;
  }
  return `${minutes} min`;
}

function money(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(Number(amount || 0));
  } catch {
    return `${currency} ${amount}`;
  }
}

function labelForFeature(feature: FeatureType) {
  return FEATURE_OPTIONS.find((item) => item.id === feature)?.label || feature;
}

function catalogFeatureLabel(metadata: Record<string, unknown>, feature: string) {
  const label = labelForFeature(feature as FeatureType);
  const limits = metadata.feature_limits;
  const limit =
    limits && typeof limits === "object"
      ? (limits as Record<string, { unlimited?: boolean; quantity?: number | null }>)[feature]
      : null;

  if (!limit || feature === "liked_you" || feature === "top_placement" || feature === "unlimited_likes") {
    return label;
  }
  if (limit.unlimited) return `Unlimited ${label}`;
  if (limit.quantity) return `${label} x${limit.quantity}`;
  return label;
}

const MODE_OPTIONS: { id: Mode; label: string }[] = [
  { id: "solo", label: "Solo" },
  { id: "duo", label: "Duo" },
  { id: "group", label: "Group" },
];

const QUICK_DURATIONS: { label: string; value: string; unit: DurationUnit }[] = [
  { label: "1 day", value: "1", unit: "day" },
  { label: "3 days", value: "3", unit: "day" },
  { label: "7 days", value: "7", unit: "day" },
  { label: "2 weeks", value: "2", unit: "week" },
  { label: "1 month", value: "1", unit: "month" },
  { label: "3 months", value: "3", unit: "month" },
];

function cloneBundleLimits() {
  return JSON.parse(JSON.stringify(EMPTY_BUNDLE_LIMITS)) as Record<BundleFeatureKey, BundleLimit>;
}

function getErrorMessage(error: unknown) {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const maybe = error as { message?: string; details?: string; hint?: string; code?: string };
    return [maybe.message, maybe.details, maybe.hint, maybe.code].filter(Boolean).join(" ");
  }
  return String(error);
}

export default function AdminPlansPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [activeMode, setActiveMode] = useState<Mode>("solo");
  const [products, setProducts] = useState<PremiumProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savingSingle, setSavingSingle] = useState(false);
  const [savingBundle, setSavingBundle] = useState(false);
  const [togglingId, setTogglingId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const [singleMode, setSingleMode] = useState<Mode>("solo");
  const [singleFeature, setSingleFeature] = useState<FeatureType>("liked_you");
  const [singleName, setSingleName] = useState("Who Liked You - 7 Days");
  const [singlePrice, setSinglePrice] = useState("9.99");
  const [singleCurrency, setSingleCurrency] = useState("USD");
  const [singleDurationValue, setSingleDurationValue] = useState("7");
  const [singleDurationUnit, setSingleDurationUnit] = useState<DurationUnit>("day");
  const [singleQuantity, setSingleQuantity] = useState("1");
  const [singleUnlimited, setSingleUnlimited] = useState(false);
  const [flowerType, setFlowerType] = useState("rose");
  const [flowerIcon, setFlowerIcon] = useState("rose");

  const [bundleMode, setBundleMode] = useState<Mode>("solo");
  const [bundleName, setBundleName] = useState("Premium Monthly");
  const [bundlePrice, setBundlePrice] = useState("29.99");
  const [bundleCurrency, setBundleCurrency] = useState("USD");
  const [bundleDurationValue, setBundleDurationValue] = useState("1");
  const [bundleDurationUnit, setBundleDurationUnit] = useState<DurationUnit>("month");
  const [bundleLimits, setBundleLimits] = useState<Record<BundleFeatureKey, BundleLimit>>(
    cloneBundleLimits()
  );

  useEffect(() => {
    const verifyAccess = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.email || !isAllowedAdminEmail(session.user.email)) {
        router.replace("/admin");
        return;
      }

      setCheckingAccess(false);
    };

    void verifyAccess();
  }, [router]);

  useEffect(() => {
    setSingleMode(activeMode);
    setBundleMode(activeMode);
  }, [activeMode]);

  const loadProducts = useCallback(async (mode: Mode = activeMode) => {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("premium_products")
      .select("*")
      .eq("target_mode", mode)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setProducts([]);
    } else {
      setProducts((data || []) as PremiumProduct[]);
    }

    setLoading(false);
  }, [activeMode]);

  useEffect(() => {
    if (!checkingAccess) void loadProducts();
  }, [checkingAccess, loadProducts]);

  const productStats = useMemo(() => {
    const active = products.filter((product) => product.is_active).length;
    const plans = products.filter((product) => product.feature_type === "plan").length;
    return { total: products.length, active, plans };
  }, [products]);

  const singleNeedsQuantity =
    singleFeature === "vibe" ||
    singleFeature === "boost" ||
    singleFeature === "undo_reverse" ||
    singleFeature === "match_reverse" ||
    singleFeature === "flower";

  const singleSupportsUnlimited =
    singleFeature === "undo_reverse" || singleFeature === "match_reverse";

  const singleDurationMinutes =
    singleFeature === "vibe" || singleFeature === "flower"
      ? 0
      : durationToMinutes(singleDurationValue, singleDurationUnit);
  const bundleDurationMinutes = durationToMinutes(bundleDurationValue, bundleDurationUnit);

  const createSingleFeatureProduct = async () => {
    const cleanName = singleName.trim();
    const parsedPrice = Number(singlePrice);
    const parsedQuantity = Math.max(1, Math.floor(Number(singleQuantity || 1)));
    const effectiveSingleUnlimited =
      singleFeature === "unlimited_likes" ||
      (singleSupportsUnlimited && singleUnlimited);
    const quantityValue = singleNeedsQuantity && !effectiveSingleUnlimited ? parsedQuantity : null;
    const durationMinutes =
      singleFeature === "vibe" || singleFeature === "flower"
        ? 0
        : durationToMinutes(singleDurationValue, singleDurationUnit);

    if (!cleanName || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError("Add a product name and valid price.");
      return;
    }

    try {
      setSavingSingle(true);
      setError("");
      setMessage("");

      const { error } = await supabase.from("premium_products").insert({
        name: cleanName,
        feature_type: singleFeature,
        target_mode: singleMode,
        price: parsedPrice,
        currency: singleCurrency.trim().toUpperCase() || "USD",
        duration_minutes: durationMinutes,
        is_active: true,
        bundle_quantity: quantityValue,
        flower_type: singleFeature === "flower" ? flowerType.trim() || "rose" : null,
        flower_icon: singleFeature === "flower" ? flowerIcon.trim() || "rose" : null,
        metadata: {
          product_kind: "single_feature",
          mode: singleMode,
          feature: singleFeature,
          unlimited: effectiveSingleUnlimited,
          quantity: quantityValue,
          feature_limits: {
            [singleFeature]: {
              enabled: true,
              unlimited: effectiveSingleUnlimited,
              quantity: quantityValue,
            },
          },
          duration_unit: singleDurationUnit,
          created_from: "unified_plans_admin",
        },
      });

      if (error) throw error;

      setMessage("Single feature product created.");
      setSingleName("");
      if (singleMode !== activeMode) {
        setActiveMode(singleMode);
      } else {
        await loadProducts(singleMode);
      }
    } catch (error) {
      setError(getErrorMessage(error) || "Could not create product.");
    } finally {
      setSavingSingle(false);
    }
  };

  const updateBundleLimit = (
    feature: BundleFeatureKey,
    patch: Partial<BundleLimit>
  ) => {
    setBundleLimits((current) => ({
      ...current,
      [feature]: {
        ...current[feature],
        ...patch,
      },
    }));
  };

  const createBundlePlan = async () => {
    const cleanName = bundleName.trim();
    const parsedPrice = Number(bundlePrice);
    const enabledFeatures = BUNDLE_FEATURES.filter(
      (feature) => bundleLimits[feature.id].enabled
    );

    if (!cleanName || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError("Add a plan name and valid price.");
      return;
    }

    if (!enabledFeatures.length) {
      setError("Choose at least one feature for this plan.");
      return;
    }

    const featureLimits = Object.fromEntries(
      enabledFeatures.map((feature) => {
        const config = bundleLimits[feature.id];
        const featureId = FEATURE_ID_BY_BUNDLE_KEY[feature.id];
        const accessOnly = ACCESS_ONLY_BUNDLE_FEATURES.has(feature.id);
        return [
          featureId,
          {
            enabled: true,
            unlimited: accessOnly || config.unlimited,
            quantity: accessOnly || config.unlimited
              ? null
              : Math.max(1, Math.floor(Number(config.quantity || 1))),
          },
        ];
      })
    );

    try {
      setSavingBundle(true);
      setError("");
      setMessage("");

      const { error } = await supabase.from("premium_products").insert({
        name: cleanName,
        feature_type: "plan",
        target_mode: bundleMode,
        price: parsedPrice,
        currency: bundleCurrency.trim().toUpperCase() || "USD",
        duration_minutes: bundleDurationMinutes,
        is_active: true,
        bundle_quantity: null,
        flower_type: null,
        flower_icon: null,
        metadata: {
          product_kind: "subscription_bundle",
          mode: bundleMode,
          duration_unit: bundleDurationUnit,
          included_features: enabledFeatures.map(
            (feature) => FEATURE_ID_BY_BUNDLE_KEY[feature.id]
          ),
          feature_limits: featureLimits,
          created_from: "unified_plans_admin",
        },
      });

      if (error) throw error;

      setMessage("Subscription bundle created.");
      if (bundleMode !== activeMode) {
        setActiveMode(bundleMode);
      } else {
        await loadProducts(bundleMode);
      }
    } catch (error) {
      setError(getErrorMessage(error) || "Could not create subscription plan.");
    } finally {
      setSavingBundle(false);
    }
  };

  const deleteProduct = async (product: PremiumProduct) => {
    const confirmed = window.confirm(`Delete "${product.name}" permanently?`);
    if (!confirmed) return;

    try {
      setDeletingId(product.id);
      setError("");
      setMessage("");

      const { error } = await supabase
        .from("premium_products")
        .delete()
        .eq("id", product.id);

      if (error) throw error;

      setMessage("Product deleted.");
      await loadProducts(product.target_mode);
    } catch (error) {
      setError(getErrorMessage(error) || "Could not delete product.");
    } finally {
      setDeletingId("");
    }
  };

  const toggleProduct = async (product: PremiumProduct) => {
    try {
      setTogglingId(product.id);
      setError("");
      setMessage("");

      const { error } = await supabase
        .from("premium_products")
        .update({ is_active: !product.is_active })
        .eq("id", product.id);

      if (error) throw error;

      setMessage(product.is_active ? "Product disabled." : "Product enabled.");
      await loadProducts();
    } catch (error) {
      setError(getErrorMessage(error) || "Could not update product.");
    } finally {
      setTogglingId("");
    }
  };

  if (checkingAccess) {
    return (
      <>
        <Header />
        <main className="admin-main">
          <div className="admin-main-card">
            <h1 className="admin-section-title">Checking admin access...</h1>
            <p className="admin-section-subtitle">Please wait while this page is verified.</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="admin-main">
        <section className="admin-main-card" style={{ marginBottom: 18 }}>
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Plan Builder</h2>
              <p className="admin-section-subtitle">
                Create every solo, duo, and group subscription or premium feature product from one clean place.
              </p>
            </div>
            <button className="admin-secondary-button" type="button" onClick={() => void loadProducts()}>
              Refresh
            </button>
          </div>

          <div className="admin-tabs-row" style={{ marginTop: 16 }}>
            {(["solo", "duo", "group"] as Mode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`admin-tab-button ${activeMode === mode ? "admin-tab-button-active" : ""}`}
                onClick={() => setActiveMode(mode)}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
        </section>

        {error ? <div className="admin-error-box">{error}</div> : null}
        {message ? <div className="admin-success-box">{message}</div> : null}

        <section className="admin-stats-grid" style={{ marginBottom: 18 }}>
          <article className="admin-stat-card">
            <div className="admin-stat-label">Products</div>
            <div className="admin-stat-value">{productStats.total}</div>
            <div className="admin-stat-note">All products in {activeMode}</div>
          </article>
          <article className="admin-stat-card">
            <div className="admin-stat-label">Active</div>
            <div className="admin-stat-value">{productStats.active}</div>
            <div className="admin-stat-note">Currently sellable</div>
          </article>
          <article className="admin-stat-card">
            <div className="admin-stat-label">Bundle Plans</div>
            <div className="admin-stat-value">{productStats.plans}</div>
            <div className="admin-stat-note">Subscription bundles</div>
          </article>
        </section>

        <div className="admin-collapsible-grid">
          <AdminCollapsible
            title="Create Single Feature Product"
            subtitle="Day, week, month, or custom product for one feature."
            defaultOpen
          >
            <div className="admin-form-grid">
              <div className="admin-field">
                <label className="admin-label">Create For</label>
                <select
                  className="admin-input"
                  value={singleMode}
                  onChange={(event) => setSingleMode(event.target.value as Mode)}
                >
                  {MODE_OPTIONS.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label}
                    </option>
                  ))}
                </select>
                <p className="admin-section-subtitle">
                  This product will only show for {singleMode} profiles.
                </p>
              </div>

              <div className="admin-field">
                <label className="admin-label">Feature</label>
                <select
                  className="admin-input"
                  value={singleFeature}
                  onChange={(event) => {
                    const value = event.target.value as FeatureType;
                    setSingleFeature(value);
                    setSingleUnlimited(false);
                    const option = FEATURE_OPTIONS.find((item) => item.id === value);
                    setSingleName(option ? `${option.label} Product` : "");
                  }}
                >
                  {FEATURE_OPTIONS.map((feature) => (
                    <option key={feature.id} value={feature.id}>
                      {feature.label}
                    </option>
                  ))}
                </select>
                <p className="admin-section-subtitle">
                  {FEATURE_OPTIONS.find((item) => item.id === singleFeature)?.hint}
                </p>
              </div>

              <div className="admin-field">
                <label className="admin-label">Product Name</label>
                <input
                  className="admin-input"
                  value={singleName}
                  onChange={(event) => setSingleName(event.target.value)}
                  placeholder="Who Liked You - 7 Days"
                />
              </div>

              <div className="admin-field">
                <label className="admin-label">Price</label>
                <input
                  className="admin-input"
                  type="number"
                  value={singlePrice}
                  onChange={(event) => setSinglePrice(event.target.value)}
                  placeholder="9.99"
                />
              </div>

              <div className="admin-field">
                <label className="admin-label">Currency</label>
                <input
                  className="admin-input"
                  value={singleCurrency}
                  onChange={(event) => setSingleCurrency(event.target.value)}
                  placeholder="USD"
                />
              </div>

              <div className="admin-field">
                <label className="admin-label">
                  {singleDurationUnit === "custom" ? "Custom Minutes" : "How Many"}
                </label>
                <input
                  className="admin-input"
                  type="number"
                  value={singleDurationValue}
                  onChange={(event) => setSingleDurationValue(event.target.value)}
                  disabled={singleFeature === "vibe" || singleFeature === "flower"}
                />
              </div>

              <div className="admin-field">
                <label className="admin-label">Duration Type</label>
                <select
                  className="admin-input"
                  value={singleDurationUnit}
                  onChange={(event) => setSingleDurationUnit(event.target.value as DurationUnit)}
                  disabled={singleFeature === "vibe" || singleFeature === "flower"}
                >
                  <option value="day">Day(s)</option>
                  <option value="week">Week(s)</option>
                  <option value="month">Month(s)</option>
                  <option value="custom">Custom minutes</option>
                </select>
                <p className="admin-section-subtitle">
                  Duration: {singleDurationMinutes ? formatDuration(singleDurationMinutes) : "No timer for this product"}
                </p>
              </div>

              {singleFeature !== "vibe" && singleFeature !== "flower" ? (
                <div className="admin-field admin-field-full">
                  <label className="admin-label">Quick Duration</label>
                  <div className="admin-tabs-row" style={{ marginBottom: 0 }}>
                    {QUICK_DURATIONS.map((duration) => (
                      <button
                        key={`${duration.value}-${duration.unit}`}
                        type="button"
                        className={`admin-tab-button ${
                          singleDurationValue === duration.value &&
                          singleDurationUnit === duration.unit
                            ? "admin-tab-button-active"
                            : ""
                        }`}
                        onClick={() => {
                          setSingleDurationValue(duration.value);
                          setSingleDurationUnit(duration.unit);
                        }}
                      >
                        {duration.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {singleNeedsQuantity ? (
                <div className="admin-field">
                  <label className="admin-label">Quantity / Limit</label>
                  <input
                    className="admin-input"
                    type="number"
                    value={singleQuantity}
                    onChange={(event) => setSingleQuantity(event.target.value)}
                    disabled={singleUnlimited}
                  />
                </div>
              ) : null}

              {singleSupportsUnlimited ? (
                <label className="admin-check-row">
                  <input
                    type="checkbox"
                    checked={singleUnlimited}
                    onChange={(event) => setSingleUnlimited(event.target.checked)}
                  />
                  Unlimited {labelForFeature(singleFeature)}
                </label>
              ) : null}

              {singleFeature === "flower" ? (
                <>
                  <div className="admin-field">
                    <label className="admin-label">Flower Type</label>
                    <input
                      className="admin-input"
                      value={flowerType}
                      onChange={(event) => setFlowerType(event.target.value)}
                      placeholder="rose"
                    />
                  </div>
                  <div className="admin-field">
                    <label className="admin-label">Flower Label</label>
                    <input
                      className="admin-input"
                      value={flowerIcon}
                      onChange={(event) => setFlowerIcon(event.target.value)}
                      placeholder="rose"
                    />
                  </div>
                </>
              ) : null}
            </div>

            <button
              type="button"
              className="admin-primary-button"
              style={{ width: "100%", marginTop: 16 }}
              onClick={() => void createSingleFeatureProduct()}
              disabled={savingSingle}
            >
              {savingSingle ? "Creating..." : "Create Single Feature Product"}
            </button>
          </AdminCollapsible>

          <AdminCollapsible
            title="Create Subscription Bundle"
            subtitle="Monthly/custom plan with any mix of features and limits."
            defaultOpen
          >
            <div className="admin-form-grid">
              <div className="admin-field">
                <label className="admin-label">Create For</label>
                <select
                  className="admin-input"
                  value={bundleMode}
                  onChange={(event) => setBundleMode(event.target.value as Mode)}
                >
                  {MODE_OPTIONS.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label}
                    </option>
                  ))}
                </select>
                <p className="admin-section-subtitle">
                  This subscription bundle will only show for {bundleMode} profiles.
                </p>
              </div>

              <div className="admin-field">
                <label className="admin-label">Plan Name</label>
                <input
                  className="admin-input"
                  value={bundleName}
                  onChange={(event) => setBundleName(event.target.value)}
                  placeholder="Premium Monthly"
                />
              </div>
              <div className="admin-field">
                <label className="admin-label">Price</label>
                <input
                  className="admin-input"
                  type="number"
                  value={bundlePrice}
                  onChange={(event) => setBundlePrice(event.target.value)}
                />
              </div>
              <div className="admin-field">
                <label className="admin-label">Currency</label>
                <input
                  className="admin-input"
                  value={bundleCurrency}
                  onChange={(event) => setBundleCurrency(event.target.value)}
                />
              </div>
              <div className="admin-field">
                <label className="admin-label">
                  {bundleDurationUnit === "custom" ? "Custom Minutes" : "How Many"}
                </label>
                <input
                  className="admin-input"
                  type="number"
                  value={bundleDurationValue}
                  onChange={(event) => setBundleDurationValue(event.target.value)}
                />
              </div>
              <div className="admin-field">
                <label className="admin-label">Duration Type</label>
                <select
                  className="admin-input"
                  value={bundleDurationUnit}
                  onChange={(event) => setBundleDurationUnit(event.target.value as DurationUnit)}
                >
                  <option value="day">Day(s)</option>
                  <option value="week">Week(s)</option>
                  <option value="month">Month(s)</option>
                  <option value="custom">Custom minutes</option>
                </select>
                <p className="admin-section-subtitle">
                  Duration: {bundleDurationMinutes ? formatDuration(bundleDurationMinutes) : "No duration"}
                </p>
              </div>

              <div className="admin-field admin-field-full">
                <label className="admin-label">Quick Duration</label>
                <div className="admin-tabs-row" style={{ marginBottom: 0 }}>
                  {QUICK_DURATIONS.map((duration) => (
                    <button
                      key={`${duration.value}-${duration.unit}`}
                      type="button"
                      className={`admin-tab-button ${
                        bundleDurationValue === duration.value &&
                        bundleDurationUnit === duration.unit
                          ? "admin-tab-button-active"
                          : ""
                      }`}
                      onClick={() => {
                        setBundleDurationValue(duration.value);
                        setBundleDurationUnit(duration.unit);
                      }}
                    >
                      {duration.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="admin-feature-limit-grid">
              {BUNDLE_FEATURES.map((feature) => {
                const config = bundleLimits[feature.id];
                const accessOnly = ACCESS_ONLY_BUNDLE_FEATURES.has(feature.id);

                return (
                  <article key={feature.id} className="admin-mini-card">
                    <label className="admin-check-row">
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        onChange={(event) =>
                          updateBundleLimit(feature.id, { enabled: event.target.checked })
                        }
                      />
                      <strong>{feature.label}</strong>
                    </label>
                    <p className="admin-section-subtitle">{feature.hint}</p>

                    {accessOnly ? (
                      <p className="admin-section-subtitle" style={{ marginTop: 10 }}>
                        Included for the full plan duration.
                      </p>
                    ) : (
                      <>
                        <label className="admin-check-row" style={{ marginTop: 10 }}>
                          <input
                            type="checkbox"
                            checked={config.unlimited}
                            disabled={!config.enabled}
                            onChange={(event) =>
                              updateBundleLimit(feature.id, { unlimited: event.target.checked })
                            }
                          />
                          Unlimited
                        </label>

                        <div className="admin-field" style={{ marginTop: 10 }}>
                          <label className="admin-label">Quantity</label>
                          <input
                            className="admin-input"
                            type="number"
                            min="1"
                            value={config.quantity}
                            disabled={!config.enabled || config.unlimited}
                            onChange={(event) =>
                              updateBundleLimit(feature.id, { quantity: event.target.value })
                            }
                          />
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>

            <button
              type="button"
              className="admin-primary-button"
              style={{ width: "100%", marginTop: 16 }}
              onClick={() => void createBundlePlan()}
              disabled={savingBundle}
            >
              {savingBundle ? "Creating..." : "Create Subscription Bundle"}
            </button>
          </AdminCollapsible>

          <AdminCollapsible
            title="Product Catalog"
            subtitle={`${products.length} product${products.length === 1 ? "" : "s"} for ${activeMode}.`}
            defaultOpen
          >
            {loading ? (
              <div className="admin-mini-card">
                <h3 className="admin-section-title">Loading products...</h3>
              </div>
            ) : products.length === 0 ? (
              <div className="admin-mini-card">
                <h3 className="admin-section-title">No products yet</h3>
                <p className="admin-section-subtitle">Create a single feature product or bundle above.</p>
              </div>
            ) : (
              <div className="admin-user-list">
                {products.map((product) => {
                  const metadata = product.metadata || {};
                  const included = [
                    ...(Array.isArray(metadata.included_features)
                      ? (metadata.included_features as string[])
                      : []),
                    ...(Array.isArray(metadata.features)
                      ? (metadata.features as string[])
                      : []),
                  ].filter((feature, index, all) => all.indexOf(feature) === index);

                  return (
                    <article key={product.id} className="admin-user-card" style={{ cursor: "default" }}>
                      <div style={{ width: "100%" }}>
                        <div className="admin-section-header" style={{ alignItems: "flex-start" }}>
                          <div>
                            <h3 className="admin-user-card-name">{product.name}</h3>
                            <p className="admin-user-card-subline">
                              {labelForFeature(product.feature_type)} / {product.target_mode.toUpperCase()} / {formatDuration(product.duration_minutes)}
                            </p>
                          </div>
                          <strong>{money(product.price, product.currency)}</strong>
                        </div>

                        <div className="admin-chip-row" style={{ marginTop: 10 }}>
                          <span className="admin-tag">{product.is_active ? "Active" : "Inactive"}</span>
                          {product.bundle_quantity ? (
                            <span className="admin-tag">Qty {product.bundle_quantity}</span>
                          ) : null}
                          {metadata.unlimited === true ? (
                            <span className="admin-tag">Unlimited</span>
                          ) : null}
                          {included.map((feature) => (
                            <span key={feature} className="admin-tag">
                              {catalogFeatureLabel(metadata, feature)}
                            </span>
                          ))}
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                            gap: 10,
                            marginTop: 14,
                          }}
                        >
                          <button
                            type="button"
                            className="admin-secondary-button"
                            style={{ width: "100%" }}
                            onClick={() => void toggleProduct(product)}
                            disabled={togglingId === product.id || deletingId === product.id}
                          >
                            {togglingId === product.id
                              ? "Saving..."
                              : product.is_active
                                ? "Disable Product"
                                : "Enable Product"}
                          </button>
                          <button
                            type="button"
                            className="admin-secondary-button"
                            style={{
                              width: "100%",
                              borderColor: "#fecaca",
                              color: "#b42318",
                              background: "#fff7f7",
                            }}
                            onClick={() => void deleteProduct(product)}
                            disabled={deletingId === product.id || togglingId === product.id}
                          >
                            {deletingId === product.id ? "Deleting..." : "Delete Product"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </AdminCollapsible>
        </div>
      </main>
    </>
  );
}
