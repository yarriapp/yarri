"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminPagination from "@/components/AdminPagination";
import Header from "@/components/Header";
import {
  ADMIN_ACCOUNT_PAGE_SIZE,
  sanitizeAdminSearch,
  UUID_PATTERN,
} from "@/lib/admin-account-pagination";
import { isAllowedAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

type ModeFilter = "all" | "solo" | "duo" | "group";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  city: string | null;
  dating_mode: string | null;
  is_banned: boolean | null;
  created_at: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

export default function AdminAccountsPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [accountPage, setAccountPage] = useState(1);
  const [accountTotal, setAccountTotal] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [reason, setReason] = useState("admin_removed");
  const [details, setDetails] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const verifyAccess = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const email = session?.user?.email?.toLowerCase() ?? "";
      if (!email || !isAllowedAdminEmail(email)) {
        router.replace("/admin");
        return;
      }

      setCheckingAccess(false);
    };

    void verifyAccess();
  }, [router]);

  const loadProfiles = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const query = sanitizeAdminSearch(debouncedSearchTerm);
      const from = (accountPage - 1) * ADMIN_ACCOUNT_PAGE_SIZE;
      let request = supabase
        .from("profiles")
        .select("id, full_name, email, city, dating_mode, is_banned, created_at", {
          count: "exact",
        });

      if (modeFilter !== "all") {
        request = request.eq("dating_mode", modeFilter);
      }

      if (query) {
        const pattern = `%${query}%`;
        const clauses = [
          `full_name.ilike.${pattern}`,
          `email.ilike.${pattern}`,
          `city.ilike.${pattern}`,
          `dating_mode.ilike.${pattern}`,
        ];
        if (UUID_PATTERN.test(query)) clauses.push(`id.eq.${query}`);
        request = request.or(clauses.join(","));
      }

      const { data, error: profilesError, count } = await request
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + ADMIN_ACCOUNT_PAGE_SIZE - 1);

      if (profilesError) throw profilesError;

      const resultTotal = count || 0;
      const pageCount = Math.max(1, Math.ceil(resultTotal / ADMIN_ACCOUNT_PAGE_SIZE));
      setAccountTotal(resultTotal);
      if (accountPage > pageCount) {
        setAccountPage(pageCount);
        return;
      }

      const rows = (data || []) as ProfileRow[];
      setProfiles(rows);
      setSelectedUserId((current) =>
        current && rows.some((profile) => profile.id === current)
          ? current
          : rows[0]?.id || ""
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load users."
      );
    } finally {
      setLoading(false);
    }
  }, [accountPage, debouncedSearchTerm, modeFilter]);

  useEffect(() => {
    if (checkingAccess) return;
    void loadProfiles();
  }, [checkingAccess, loadProfiles]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedUserId) || null;

  const handleDelete = async () => {
    if (!selectedProfile?.id) return;

    const confirmed = window.confirm(
      "Delete this user account permanently? This will remove profile, matches, chats, and linked data."
    );

    if (!confirmed) return;

    try {
      setDeleting(true);

      const { error: deleteError } = await supabase.rpc(
        "admin_delete_user_account",
        {
          p_user_id: selectedProfile.id,
          p_reason: reason.trim() || "admin_removed",
          p_details: details.trim() || null,
        }
      );

      if (deleteError) throw deleteError;

      setDetails("");
      await loadProfiles();
    } catch (deleteFailure) {
      setError(
        deleteFailure instanceof Error
          ? deleteFailure.message
          : "Could not delete this account."
      );
    } finally {
      setDeleting(false);
    }
  };

  if (checkingAccess) {
    return <div className="p-10">Checking access...</div>;
  }

  return (
    <main className="admin-dashboard-page">
      <div className="admin-dashboard-shell">
        <Header />

        <section className="admin-workspace-grid">
          <aside className="admin-sidebar-card admin-users-panel">
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title">Accounts</h2>
                <p className="admin-section-subtitle">
                  Browse Solo, Duo, and Group members 50 accounts at a time.
                </p>
              </div>
            </div>

            <div className="admin-search-wrap">
              <input
                type="text"
                className="admin-input"
                placeholder="Search by name, email, city, mode, or user id..."
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setAccountPage(1);
                }}
              />
            </div>

            <div className="admin-tabs-row" aria-label="Account type filter">
              {(["all", "solo", "duo", "group"] as ModeFilter[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`admin-tab-button ${modeFilter === mode ? "admin-tab-button-active" : ""}`}
                  onClick={() => {
                    setModeFilter(mode);
                    setAccountPage(1);
                  }}
                >
                  {mode.slice(0, 1).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>

            <div className="admin-list-count-row">
              <span className="admin-list-count-primary">
                {modeFilter === "all" ? "All accounts" : `${modeFilter.slice(0, 1).toUpperCase()}${modeFilter.slice(1)} accounts`} ({accountTotal})
              </span>
            </div>

            {loading ? (
              <div className="admin-mini-card">
                <h3 className="admin-section-title">Loading accounts...</h3>
              </div>
            ) : (
              <div className="admin-user-list">
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    className={`admin-user-card ${
                      selectedUserId === profile.id ? "admin-user-card-active" : ""
                    }`}
                    onClick={() => setSelectedUserId(profile.id)}
                  >
                    <div className="admin-user-card-main">
                      <h3 className="admin-user-card-name">
                        {profile.full_name || "Unnamed User"}
                      </h3>
                      <p className="admin-user-card-subline">
                        {profile.email || "No email"} • {profile.city || "No city"}
                      </p>
                      <p className="admin-user-card-subline">
                        {profile.dating_mode || "unknown"} •{" "}
                        {profile.is_banned ? "Banned" : "Active"}
                      </p>
                    </div>
                  </button>
                ))}
                {!profiles.length ? (
                  <div className="admin-empty-card">
                    <h3 className="admin-section-title">No matching accounts</h3>
                    <p className="admin-section-subtitle">Try another account type or search.</p>
                  </div>
                ) : null}
              </div>
            )}

            <AdminPagination
              page={accountPage}
              pageSize={ADMIN_ACCOUNT_PAGE_SIZE}
              total={accountTotal}
              loading={loading}
              onPageChange={setAccountPage}
            />
          </aside>

          <section className="admin-main-card admin-detail-panel">
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title">Delete account</h2>
                <p className="admin-section-subtitle">
                  Remove one user account and keep an admin-side leave record.
                </p>
              </div>
            </div>

            {error ? <div className="admin-error-box">{error}</div> : null}

            {!selectedProfile ? (
              <div className="admin-empty-card">
                <h3 className="admin-section-title">No user selected</h3>
                <p className="admin-section-subtitle">
                  Pick a user from the left panel first.
                </p>
              </div>
            ) : (
              <div className="admin-grid admin-grid-two">
                <article className="admin-mini-card">
                  <h3 className="admin-section-title">Selected account</h3>
                  <div className="admin-kv-grid">
                    <div className="admin-kv-item">
                      <span className="admin-kv-label">Name</span>
                      <span className="admin-kv-value">
                        {selectedProfile.full_name || "Unnamed User"}
                      </span>
                    </div>
                    <div className="admin-kv-item">
                      <span className="admin-kv-label">Email</span>
                      <span className="admin-kv-value">
                        {selectedProfile.email || "-"}
                      </span>
                    </div>
                    <div className="admin-kv-item">
                      <span className="admin-kv-label">Mode</span>
                      <span className="admin-kv-value">
                        {selectedProfile.dating_mode || "-"}
                      </span>
                    </div>
                    <div className="admin-kv-item">
                      <span className="admin-kv-label">Created</span>
                      <span className="admin-kv-value">
                        {formatDate(selectedProfile.created_at)}
                      </span>
                    </div>
                  </div>
                </article>

                <article className="admin-mini-card">
                  <h3 className="admin-section-title">Delete request</h3>

                  <div className="admin-field">
                    <label className="admin-label">Reason</label>
                    <input
                      className="admin-input"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </div>

                  <div className="admin-field">
                    <label className="admin-label">Details</label>
                    <textarea
                      className="admin-textarea"
                      value={details}
                      onChange={(event) => setDetails(event.target.value)}
                      placeholder="Optional admin note about why the account is being removed."
                    />
                  </div>

                  <div className="admin-form-actions">
                    <button
                      type="button"
                      className="admin-primary-button admin-button-fit"
                      onClick={handleDelete}
                      disabled={deleting}
                    >
                      {deleting ? "Deleting..." : "Delete User Account"}
                    </button>
                  </div>
                </article>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
