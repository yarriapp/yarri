"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { isAllowedAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

type DiscoveryScope = "global" | "city" | "distance";
type UndoPeriod = "week" | "month" | "custom";

type SettingsRow = {
  id: number;
  matching_scope: DiscoveryScope;
  distance_miles: number | null;
  is_active: boolean;
};

type UndoSettingsRow = {
  id: number;
  free_undo_limit: number;
  period_unit: UndoPeriod;
  custom_days: number | null;
  is_active: boolean;
};

export default function SettingsPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [matchingScope, setMatchingScope] = useState<DiscoveryScope>("global");
  const [distanceMiles, setDistanceMiles] = useState("50");
  const [isActive, setIsActive] = useState(true);
  const [freeUndoLimit, setFreeUndoLimit] = useState("3");
  const [undoPeriod, setUndoPeriod] = useState<UndoPeriod>("week");
  const [undoCustomDays, setUndoCustomDays] = useState("7");
  const [undoActive, setUndoActive] = useState(true);

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const email = session?.user?.email?.toLowerCase() ?? "";
      if (!email || !isAllowedAdminEmail(email)) {
        router.replace("/admin");
        return;
      }

      if (!mounted) return;
      setCheckingAccess(false);
      await loadSettings();
    };

    boot();

    return () => {
      mounted = false;
    };
  }, [router]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError("");
      const [discoveryRes, undoRes] = await Promise.all([
        supabase
          .from("discovery_settings")
          .select("id, matching_scope, distance_miles, is_active")
          .eq("id", 1)
          .maybeSingle<SettingsRow>(),
        supabase
          .from("discovery_undo_settings")
          .select("id, free_undo_limit, period_unit, custom_days, is_active")
          .eq("id", 1)
          .maybeSingle<UndoSettingsRow>(),
      ]);

      if (discoveryRes.error) {
        setError(discoveryRes.error.message);
        return;
      }

      if (undoRes.error) {
        setError(`${undoRes.error.message} Run C:\\dating\\sql\\dating_undo_actions.sql in Supabase if undo settings are missing.`);
      }

      setMatchingScope(discoveryRes.data?.matching_scope || "global");
      setDistanceMiles(String(discoveryRes.data?.distance_miles ?? 50));
      setIsActive(discoveryRes.data?.is_active !== false);

      setFreeUndoLimit(String(undoRes.data?.free_undo_limit ?? 3));
      setUndoPeriod(undoRes.data?.period_unit || "week");
      setUndoCustomDays(String(undoRes.data?.custom_days ?? 7));
      setUndoActive(undoRes.data?.is_active !== false);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const parsedMiles = Number(distanceMiles);
      const parsedUndoLimit = Math.max(0, Math.floor(Number(freeUndoLimit)));
      const parsedUndoDays = Math.max(1, Math.floor(Number(undoCustomDays)));

      const [discoverySaveRes, undoSaveRes] = await Promise.all([
        supabase.from("discovery_settings").upsert(
          {
            id: 1,
            matching_scope: matchingScope,
            distance_miles: Number.isFinite(parsedMiles) ? parsedMiles : null,
            is_active: isActive,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        ),
        supabase.from("discovery_undo_settings").upsert(
          {
            id: 1,
            free_undo_limit: Number.isFinite(parsedUndoLimit) ? parsedUndoLimit : 0,
            period_unit: undoPeriod,
            custom_days: undoPeriod === "custom" ? (Number.isFinite(parsedUndoDays) ? parsedUndoDays : 7) : null,
            is_active: undoActive,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        ),
      ]);

      if (discoverySaveRes.error || undoSaveRes.error) {
        setError(discoverySaveRes.error?.message || undoSaveRes.error?.message || "Settings save failed.");
        return;
      }

      setSuccess("Discovery and undo settings updated.");
    } finally {
      setSaving(false);
    }
  };

  if (checkingAccess) {
    return (
      <main className="admin-dashboard-page">
        <div className="admin-dashboard-shell">
          <div className="admin-main-card">
            <h1 className="admin-section-title">Checking admin access...</h1>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-dashboard-page">
      <div className="admin-dashboard-shell">
        <Header />

        <section className="admin-main-card">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Discovery Settings</h2>
              <p className="admin-section-subtitle">
                Control whether users discover people everywhere or only nearby.
              </p>
            </div>
          </div>

          {error ? <div className="admin-error-box">{error}</div> : null}
          {success ? <div className="admin-success-box">{success}</div> : null}

          {loading ? (
            <div className="admin-empty-card">
              <h3 className="admin-section-title">Loading settings...</h3>
            </div>
          ) : (
            <div className="admin-form-grid">
              <div className="admin-mini-card">
                <h3 className="admin-section-title">Who can see whom</h3>
                <p className="admin-section-subtitle">
                  Global shows everyone. City keeps discovery inside the same city. Distance is saved for future geo rules.
                </p>

                <div className="admin-tabs-row" style={{ marginTop: "16px", flexWrap: "wrap" }}>
                  {(["global", "city", "distance"] as DiscoveryScope[]).map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      className={`admin-tab-button ${matchingScope === scope ? "admin-tab-button-active" : ""}`}
                      onClick={() => setMatchingScope(scope)}
                    >
                      {scope === "global" ? "Show All Users" : scope === "city" ? "Same City Only" : "Miles Radius"}
                    </button>
                  ))}
                </div>

                <label className="admin-label" style={{ marginTop: "18px", display: "block" }}>
                  Distance / miles
                </label>
                <input
                  className="admin-input"
                  value={distanceMiles}
                  onChange={(event) => setDistanceMiles(event.target.value)}
                  placeholder="50"
                />

                <label className="admin-checkbox-row" style={{ marginTop: "16px" }}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(event) => setIsActive(event.target.checked)}
                  />
                  <span>Discovery rules active</span>
                </label>

                <button
                  type="button"
                  className="admin-primary-button"
                  onClick={saveSettings}
                  disabled={saving}
                  style={{ marginTop: "18px" }}
                >
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </div>

              <div className="admin-mini-card">
                <h3 className="admin-section-title">Current live behavior</h3>
                <p className="admin-section-subtitle">
                  Scope: <strong>{matchingScope}</strong>
                </p>
                <p className="admin-section-subtitle">
                  Miles: <strong>{distanceMiles || "Not set"}</strong>
                </p>
                <p className="admin-section-subtitle">
                  Active: <strong>{isActive ? "Yes" : "No"}</strong>
                </p>
              </div>

              <div className="admin-mini-card">
                <h3 className="admin-section-title">Undo Swipe Rules</h3>
                <p className="admin-section-subtitle">
                  Controls the bottom Undo button in solo, duo, and group swipe.
                </p>

                <label className="admin-label" style={{ marginTop: "18px", display: "block" }}>
                  Free undo actions
                </label>
                <input
                  className="admin-input"
                  type="number"
                  min="0"
                  value={freeUndoLimit}
                  onChange={(event) => setFreeUndoLimit(event.target.value)}
                  placeholder="3"
                />

                <label className="admin-label" style={{ marginTop: "18px", display: "block" }}>
                  Reset period
                </label>
                <div className="admin-tabs-row" style={{ marginTop: "10px", flexWrap: "wrap" }}>
                  {(["week", "month", "custom"] as UndoPeriod[]).map((period) => (
                    <button
                      key={period}
                      type="button"
                      className={`admin-tab-button ${undoPeriod === period ? "admin-tab-button-active" : ""}`}
                      onClick={() => setUndoPeriod(period)}
                    >
                      {period === "week" ? "Weekly" : period === "month" ? "Monthly" : "Custom"}
                    </button>
                  ))}
                </div>

                {undoPeriod === "custom" ? (
                  <>
                    <label className="admin-label" style={{ marginTop: "18px", display: "block" }}>
                      Custom reset days
                    </label>
                    <input
                      className="admin-input"
                      type="number"
                      min="1"
                      value={undoCustomDays}
                      onChange={(event) => setUndoCustomDays(event.target.value)}
                      placeholder="7"
                    />
                  </>
                ) : null}

                <label className="admin-checkbox-row" style={{ marginTop: "16px" }}>
                  <input
                    type="checkbox"
                    checked={undoActive}
                    onChange={(event) => setUndoActive(event.target.checked)}
                  />
                  <span>Undo feature active</span>
                </label>

                <button
                  type="button"
                  className="admin-primary-button"
                  onClick={saveSettings}
                  disabled={saving}
                  style={{ marginTop: "18px" }}
                >
                  {saving ? "Saving..." : "Save Undo Rules"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
