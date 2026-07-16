"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { isAllowedAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

type VerificationStatus = "pending" | "approved" | "rejected" | "all";

type RequestRow = {
  id: string;
  user_id: string;
  member_user_id: string | null;
  entity_id: string | null;
  mode: string | null;
  challenge: string | null;
  selfie_url: string | null;
  status: string | null;
  admin_note: string | null;
  created_at: string | null;
  reviewed_at: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  age: number | null;
  gender: string | null;
  dating_mode: string | null;
  city: string | null;
  photos: string[] | null;
  is_verified: boolean | null;
};

type RequestWithProfile = RequestRow & {
  profile?: ProfileRow | null;
};

function formatDate(value?: string | null) {
  if (!value) return "Not yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function profileLine(profile?: ProfileRow | null) {
  if (!profile) return "Profile not found";
  return [profile.gender, profile.dating_mode, profile.city].filter(Boolean).join(" / ");
}

function normalizeMode(mode?: string | null) {
  const value = String(mode || "solo").toLowerCase();
  return value === "duo" || value === "group" ? value : "solo";
}

export default function VerificationAdminPage() {
  const [requests, setRequests] = useState<RequestWithProfile[]>([]);
  const [statusFilter, setStatusFilter] = useState<VerificationStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [adminUserId, setAdminUserId] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    void loadRequests();
  }, []);

  const counts = useMemo(() => {
    return {
      pending: requests.filter((row) => row.status === "pending").length,
      approved: requests.filter((row) => row.status === "approved").length,
      rejected: requests.filter((row) => row.status === "rejected").length,
      all: requests.length,
    };
  }, [requests]);

  const visibleRequests = useMemo(() => {
    if (statusFilter === "all") return requests;
    return requests.filter((row) => row.status === statusFilter);
  }, [requests, statusFilter]);

  const loadRequests = async () => {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.email || !isAllowedAdminEmail(session.user.email)) {
        setErrorMessage("Admin access required.");
        setRequests([]);
        return;
      }

      setAdminUserId(session.user.id);

      const { data, error } = await supabase
        .from("profile_verification_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data || []) as RequestRow[];
      const profileIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
      let profilesById = new Map<string, ProfileRow>();

      if (profileIds.length) {
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, age, gender, dating_mode, city, photos, is_verified")
          .in("id", profileIds);

        if (profileError) throw profileError;
        profilesById = new Map(
          ((profiles || []) as ProfileRow[]).map((profile) => [profile.id, profile])
        );
      }

      setRequests(
        rows.map((row) => ({
          ...row,
          profile: profilesById.get(row.user_id) || null,
        }))
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not load verification requests."
      );
    } finally {
      setLoading(false);
    }
  };

  const approveRequest = async (row: RequestWithProfile) => {
    setSavingId(row.id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const nowIso = new Date().toISOString();

      const { error: requestError } = await supabase
        .from("profile_verification_requests")
        .update({
          status: "approved",
          reviewed_at: nowIso,
          reviewed_by: adminUserId || null,
          admin_note: null,
        })
        .eq("id", row.id);

      if (requestError) throw requestError;

      await syncSharedEntityVerification(row);

      setSuccessMessage(
        normalizeMode(row.mode) === "solo"
          ? "Verification approved and blue tick enabled."
          : "Member selfie approved. Shared blue tick turns on when every member is approved."
      );
      await loadRequests();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Approval failed.");
    } finally {
      setSavingId("");
    }
  };

  const syncSharedEntityVerification = async (row: RequestWithProfile) => {
    const mode = normalizeMode(row.mode);
    const entityId = row.entity_id || row.user_id;

    if (mode === "solo") {
      const { error } = await supabase
        .from("profiles")
        .update({ is_verified: true })
        .eq("id", row.user_id);

      if (error) throw error;
      return;
    }

    let memberIds: string[] = [];

    if (mode === "duo") {
      const { data, error } = await supabase
        .from("duos")
        .select("user1_id, user2_id")
        .eq("id", entityId)
        .maybeSingle<{ user1_id: string | null; user2_id: string | null }>();

      if (error) throw error;
      memberIds = [data?.user1_id, data?.user2_id].filter(Boolean) as string[];
    } else {
      const { data, error } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", entityId);

      if (error) throw error;
      memberIds = ((data || []) as { user_id: string | null }[])
        .map((member) => member.user_id)
        .filter(Boolean) as string[];
    }

    if (!memberIds.length) return;

    const { data: approvedRows, error: approvedError } = await supabase
      .from("profile_verification_requests")
      .select("member_user_id, user_id")
      .eq("mode", mode)
      .eq("entity_id", entityId)
      .eq("status", "approved");

    if (approvedError) throw approvedError;

    const approvedMemberIds = new Set(
      ((approvedRows || []) as { member_user_id: string | null; user_id: string | null }[])
        .map((item) => item.member_user_id || item.user_id)
        .filter(Boolean) as string[]
    );

    const allApproved = memberIds.every((memberId) => approvedMemberIds.has(memberId));
    if (!allApproved) return;

    const { error: entityError } = await supabase
      .from(mode === "duo" ? "duos" : "groups")
      .update({ is_verified: true })
      .eq("id", entityId);

    if (entityError) throw entityError;
  };

  const rejectRequest = async (row: RequestWithProfile) => {
    const note =
      window.prompt("Reason shown to user (optional)", row.admin_note || "") || "";
    setSavingId(row.id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const { error } = await supabase
        .from("profile_verification_requests")
        .update({
          status: "rejected",
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminUserId || null,
          admin_note: note.trim() || "Please submit a clearer selfie with the requested pose.",
        })
        .eq("id", row.id);

      if (error) throw error;

      setSuccessMessage("Verification request rejected.");
      await loadRequests();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Reject failed.");
    } finally {
      setSavingId("");
    }
  };

  return (
    <main className="admin-dashboard-page">
      <div className="admin-dashboard-shell">
        <Header />

        <section className="admin-main-card" style={{ marginBottom: 18 }}>
        <div className="admin-section-header">
          <div>
            <h2 className="admin-section-title">Profile Verification</h2>
            <p className="admin-section-subtitle">
              Review selfie challenge submissions, then approve the blue tick when the pose matches.
            </p>
          </div>
          <button type="button" className="admin-secondary-button" onClick={() => void loadRequests()}>
            Refresh
          </button>
        </div>

        <div className="admin-tabs-row" style={{ marginTop: 16, flexWrap: "wrap" }}>
          {(["pending", "approved", "rejected", "all"] as VerificationStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              className={`admin-tab-button ${
                statusFilter === status ? "admin-tab-button-active" : ""
              }`}
              onClick={() => setStatusFilter(status)}
            >
              {status[0].toUpperCase() + status.slice(1)} ({counts[status]})
            </button>
          ))}
        </div>
        </section>

        {errorMessage ? <div className="admin-error-box">{errorMessage}</div> : null}
        {successMessage ? <div className="admin-success-box">{successMessage}</div> : null}

        <section className="admin-main-card">
        {loading ? (
          <div className="admin-empty-card">
            <h3 className="admin-section-title">Loading verification requests...</h3>
          </div>
        ) : visibleRequests.length === 0 ? (
          <div className="admin-empty-card">
            <h3 className="admin-section-title">No requests found</h3>
            <p className="admin-section-subtitle">This filter is clean right now.</p>
          </div>
        ) : (
          <div className="admin-form-grid">
            {visibleRequests.map((row) => {
              const profile = row.profile;
              const profilePhoto = profile?.photos?.[0] || "";
              const isSaving = savingId === row.id;

              return (
                <article key={row.id} className="admin-mini-card">
                  <div className="admin-section-header" style={{ alignItems: "flex-start", gap: 14 }}>
                    <button
                      type="button"
                      className="admin-user-avatar"
                      style={{ width: 76, height: 76, border: 0, padding: 0, cursor: row.selfie_url ? "zoom-in" : "default" }}
                      onClick={() => row.selfie_url && setImagePreview(row.selfie_url)}
                    >
                      {row.selfie_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.selfie_url}
                          alt="Verification selfie"
                          className="admin-user-avatar-image"
                          style={{ width: 76, height: 76, borderRadius: 18, objectFit: "cover" }}
                        />
                      ) : (
                        <span className="admin-user-avatar-fallback">?</span>
                      )}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div className="admin-chip-row">
                        <span className="admin-tag">{row.status || "pending"}</span>
                        <span className="admin-tag">{row.mode || profile?.dating_mode || "solo"}</span>
                        {profile?.is_verified ? <span className="admin-tag">Already verified</span> : null}
                      </div>
                      <h3 className="admin-section-title" style={{ marginTop: 8 }}>
                        {profile?.full_name || "Unknown profile"}
                        {profile?.age ? `, ${profile.age}` : ""}
                      </h3>
                      <p className="admin-section-subtitle">{profileLine(profile)}</p>
                      <p className="admin-section-subtitle" style={{ marginTop: 8 }}>
                        Challenge: <strong>{row.challenge || "No challenge saved"}</strong>
                      </p>
                      <p className="admin-section-subtitle">Submitted: {formatDate(row.created_at)}</p>
                    </div>
                    {profilePhoto ? (
                      <button
                        type="button"
                        className="admin-user-avatar"
                        style={{ width: 58, height: 58, border: 0, padding: 0, cursor: "zoom-in" }}
                        onClick={() => setImagePreview(profilePhoto)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={profilePhoto}
                          alt="Profile"
                          className="admin-user-avatar-image"
                          style={{ width: 58, height: 58, borderRadius: 16, objectFit: "cover" }}
                        />
                      </button>
                    ) : null}
                  </div>

                  {row.admin_note ? (
                    <p className="admin-section-subtitle" style={{ marginTop: 12 }}>
                      Admin note: {row.admin_note}
                    </p>
                  ) : null}

                  <div className="admin-actions-row" style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className="admin-primary-button"
                      onClick={() => void approveRequest(row)}
                      disabled={isSaving || row.status === "approved"}
                    >
                      {isSaving ? "Saving..." : "Approve Blue Tick"}
                    </button>
                    <button
                      type="button"
                      className="admin-secondary-button admin-danger-button"
                      onClick={() => void rejectRequest(row)}
                      disabled={isSaving || row.status === "rejected"}
                    >
                      Reject
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        </section>
      </div>

      {imagePreview ? (
        <button
          type="button"
          onClick={() => setImagePreview(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            border: 0,
            background: "rgba(10, 15, 25, 0.82)",
            padding: 32,
            cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagePreview}
            alt="Full preview"
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              borderRadius: 18,
              boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
            }}
          />
        </button>
      ) : null}
    </main>
  );
}
