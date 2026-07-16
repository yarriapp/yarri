"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { isAllowedAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

type ExitFeedbackRow = {
  id: string;
  user_id: string | null;
  requested_by: string;
  email_snapshot: string | null;
  full_name_snapshot: string | null;
  dating_mode_snapshot: string | null;
  reason: string;
  details: string | null;
  created_at: string;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

export default function ExitFeedbackPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [rows, setRows] = useState<ExitFeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

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

  useEffect(() => {
    if (checkingAccess) return;

    const loadRows = async () => {
      try {
        setLoading(true);
        setError("");

        const { data, error: rowsError } = await supabase
          .from("user_exit_feedback")
          .select("*")
          .order("created_at", { ascending: false });

        if (rowsError) throw rowsError;
        setRows((data || []) as ExitFeedbackRow[]);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load exit feedback."
        );
      } finally {
        setLoading(false);
      }
    };

    void loadRows();
  }, [checkingAccess]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) => {
      const haystack = [
        row.full_name_snapshot,
        row.email_snapshot,
        row.reason,
        row.details,
        row.dating_mode_snapshot,
        row.requested_by,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [rows, searchTerm]);

  if (checkingAccess) {
    return <div className="p-10">Checking access...</div>;
  }

  return (
    <main className="admin-dashboard-page">
      <div className="admin-dashboard-shell">
        <Header />

        <section className="admin-main-card">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Leave feedback</h2>
              <p className="admin-section-subtitle">
                Review why users are deleting their account.
              </p>
            </div>
          </div>

          <div className="admin-search-wrap" style={{ marginBottom: "16px" }}>
            <input
              className="admin-input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name, email, reason, mode, or note..."
            />
          </div>

          {error ? <div className="admin-error-box">{error}</div> : null}

          {loading ? (
            <div className="admin-empty-card">
              <h3 className="admin-section-title">Loading feedback...</h3>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="admin-empty-card">
              <h3 className="admin-section-title">No exit feedback yet</h3>
              <p className="admin-section-subtitle">
                User leave reasons will appear here after account deletion.
              </p>
            </div>
          ) : (
            <div className="admin-user-list">
              {filteredRows.map((row) => (
                <article key={row.id} className="admin-mini-card">
                  <div className="admin-user-title-row">
                    <div>
                      <h3 className="admin-section-title">
                        {row.full_name_snapshot || "Deleted User"}
                      </h3>
                      <p className="admin-section-subtitle">
                        {row.email_snapshot || "No email"} • {row.dating_mode_snapshot || "unknown"} • {row.requested_by}
                      </p>
                    </div>
                    <span className="admin-status-chip admin-status-active">
                      {row.reason}
                    </span>
                  </div>

                  <div className="admin-info-box" style={{ marginTop: "12px" }}>
                    <p className="admin-info-text">
                      {row.details?.trim() || "No extra details shared."}
                    </p>
                  </div>

                  <p className="admin-section-subtitle" style={{ marginTop: "12px" }}>
                    {formatDate(row.created_at)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
