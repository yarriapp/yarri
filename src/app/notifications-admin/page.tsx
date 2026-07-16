"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { isAllowedAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  city: string | null;
  dating_mode: string | null;
};

type CampaignRow = {
  id: string;
  admin_email: string;
  audience: string;
  recipient_count: number;
  mode: string | null;
  notification_type: string;
  title: string;
  body: string;
  navigation_path: string | null;
  created_at: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string" && value.trim()) return value;
  }
  return "Could not send notification.";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

export default function NotificationsAdminPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [mode, setMode] = useState("all");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [navigationPath, setNavigationPath] = useState("/notifications");
  const [notificationType, setNotificationType] = useState("promotion");
  const [sending, setSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

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
    void loadData();
  }, [checkingAccess]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const [{ data: profilesData, error: profilesError }, { data: campaignsData, error: campaignsError }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id, full_name, email, city, dating_mode")
            .order("created_at", { ascending: false }),
          supabase
            .from("admin_notification_campaigns")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

      if (profilesError) throw profilesError;
      if (campaignsError) throw campaignsError;

      setProfiles((profilesData || []) as ProfileRow[]);
      setCampaigns((campaignsData || []) as CampaignRow[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load notification tools."
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredProfiles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return profiles.filter((profile) => {
      if (mode !== "all" && (profile.dating_mode || "solo") !== mode) {
        return false;
      }

      if (!query) return true;

      const haystack = [
        profile.full_name,
        profile.email,
        profile.city,
        profile.dating_mode,
        profile.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [profiles, searchTerm, mode]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
  };

  const selectFiltered = () => {
    setSelectedUserIds(filteredProfiles.map((profile) => profile.id));
  };

  const clearSelection = () => {
    setSelectedUserIds([]);
  };

  const handleSend = async () => {
    if (!selectedUserIds.length) {
      setError("Select at least one user.");
      return;
    }

    if (!title.trim() || !body.trim()) {
      setError("Title and body are required.");
      return;
    }

    try {
      setSending(true);
      setError("");
      setSuccessMessage("");

      const selectedProfiles = profiles.filter((profile) =>
        selectedUserIds.includes(profile.id)
      );
      const selectedModes = Array.from(
        new Set(
          selectedProfiles
            .map((profile) => String(profile.dating_mode || "").trim().toLowerCase())
            .filter(Boolean)
        )
      );

      const normalizedMode =
        mode === "solo" || mode === "duo" || mode === "group"
          ? mode
          : selectedModes.length === 1 &&
            (selectedModes[0] === "solo" ||
              selectedModes[0] === "duo" ||
              selectedModes[0] === "group")
          ? selectedModes[0]
          : "solo";

      const { data, error: rpcError } = await supabase.rpc(
        "admin_send_notification",
        {
          p_recipient_user_ids: selectedUserIds,
          p_title: title.trim(),
          p_body: body.trim(),
          p_mode: normalizedMode,
          p_navigation_path: navigationPath.trim() || "/notifications",
          p_navigation_params: {},
          p_notification_type: notificationType.trim() || "promotion",
        }
      );

      if (rpcError) throw rpcError;

      setSuccessMessage(`Notification sent to ${data || 0} users.`);
      setTitle("");
      setBody("");
      setSelectedUserIds([]);
      await loadData();
    } catch (sendError) {
      setError(getErrorMessage(sendError));
    } finally {
      setSending(false);
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
                <h2 className="admin-section-title">Recipients</h2>
                <p className="admin-section-subtitle">
                  Select users to send custom promotions or alerts.
                </p>
              </div>
            </div>

            <div className="admin-search-wrap">
              <input
                className="admin-input"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by name, email, city, mode, or id..."
              />
            </div>

            <div className="admin-tabs-row" style={{ marginBottom: "12px", flexWrap: "wrap" }}>
              {["all", "solo", "duo", "group"].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`admin-tab-button ${mode === item ? "admin-tab-button-active" : ""}`}
                  onClick={() => setMode(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="admin-form-actions" style={{ marginBottom: "12px" }}>
              <button type="button" className="admin-secondary-button" onClick={selectFiltered}>
                Select Filtered
              </button>
              <button type="button" className="admin-secondary-button" onClick={clearSelection}>
                Clear
              </button>
            </div>

            {loading ? (
              <div className="admin-mini-card">
                <h3 className="admin-section-title">Loading users...</h3>
              </div>
            ) : (
              <div className="admin-user-list">
                {filteredProfiles.map((profile) => {
                  const isSelected = selectedUserIds.includes(profile.id);

                  return (
                    <button
                      key={profile.id}
                      type="button"
                      className={`admin-user-card ${isSelected ? "admin-user-card-active" : ""}`}
                      onClick={() => toggleUser(profile.id)}
                    >
                      <div className="admin-user-card-main">
                        <h3 className="admin-user-card-name">
                          {profile.full_name || "Unnamed User"}
                        </h3>
                        <p className="admin-user-card-subline">
                          {profile.email || "No email"} • {profile.city || "No city"}
                        </p>
                        <p className="admin-user-card-subline">
                          {profile.dating_mode || "unknown"} • {isSelected ? "Selected" : "Tap to select"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <section className="admin-main-card admin-detail-panel">
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title">Send notification</h2>
                <p className="admin-section-subtitle">
                  Create a custom promotion, reminder, or system message.
                </p>
              </div>
            </div>

            {error ? <div className="admin-error-box">{error}</div> : null}
            {successMessage ? <div className="admin-success-box">{successMessage}</div> : null}

            <div className="admin-grid admin-grid-two">
              <article className="admin-mini-card">
                <div className="admin-field">
                  <label className="admin-label">Title</label>
                  <input
                    className="admin-input"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Promotion title"
                  />
                </div>

                <div className="admin-field">
                  <label className="admin-label">Body</label>
                  <textarea
                    className="admin-textarea"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Write the notification body..."
                  />
                </div>

                <div className="admin-field">
                  <label className="admin-label">Notification type</label>
                  <input
                    className="admin-input"
                    value={notificationType}
                    onChange={(event) => setNotificationType(event.target.value)}
                    placeholder="promotion"
                  />
                </div>

                <div className="admin-field">
                  <label className="admin-label">Open path</label>
                  <input
                    className="admin-input"
                    value={navigationPath}
                    onChange={(event) => setNavigationPath(event.target.value)}
                    placeholder="/notifications"
                  />
                </div>

                <div className="admin-form-actions">
                  <button
                    type="button"
                    className="admin-primary-button admin-button-fit"
                    onClick={handleSend}
                    disabled={sending}
                  >
                    {sending ? "Sending..." : `Send To ${selectedUserIds.length} Users`}
                  </button>
                </div>
              </article>

              <article className="admin-mini-card">
                <h3 className="admin-section-title">Recent campaigns</h3>

                {campaigns.length === 0 ? (
                  <p className="admin-section-subtitle">No campaigns sent yet.</p>
                ) : (
                  <div className="admin-user-list">
                    {campaigns.map((campaign) => (
                      <div key={campaign.id} className="admin-user-card">
                        <div className="admin-user-card-main">
                          <h3 className="admin-user-card-name">{campaign.title}</h3>
                          <p className="admin-user-card-subline">
                            {campaign.notification_type} • {campaign.mode || "solo"} • {campaign.recipient_count} users
                          </p>
                          <p className="admin-user-card-subline">{campaign.body}</p>
                          <p className="admin-user-card-subline">
                            {formatDate(campaign.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
