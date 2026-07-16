"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { isAllowedAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

type ModeFilter = "solo" | "duo" | "group";

type ProfileLite = {
  id: string;
  full_name: string | null;
  age: number | null;
  gender?: string | null;
  dating_mode?: string | null;
  city: string | null;
  photos: string[] | null;
  is_banned?: boolean | null;
  is_verified?: boolean | null;
};

type DuoRow = {
  id: string;
  created_at?: string | null;
  user1?: ProfileLite | ProfileLite[] | null;
  user2?: ProfileLite | ProfileLite[] | null;
};

type GroupRow = {
  id: string;
  created_at?: string | null;
  members?: { user?: ProfileLite | ProfileLite[] | null }[] | null;
};

type LocationShowRow = {
  id: string;
  mode: ModeFilter;
  entity_id: string;
  is_active: boolean;
  note?: string | null;
  updated_at?: string | null;
};

type DisplayCard = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  photo: string;
  mode: ModeFilter;
};

function normalizeProfile(profile?: ProfileLite | ProfileLite[] | null) {
  if (Array.isArray(profile)) return profile[0] || null;
  return profile || null;
}

function formatValue(value?: string | number | null) {
  if (value === null || value === undefined) return "-";
  const clean = String(value).trim();
  return clean || "-";
}

function firstPhoto(profile?: ProfileLite | null) {
  return (profile?.photos || []).find((photo) => typeof photo === "string" && photo.trim()) || "";
}

function profileTitle(profile?: ProfileLite | null) {
  if (!profile) return "Unknown profile";
  const age = profile.age ? `, ${profile.age}` : "";
  return `${formatValue(profile.full_name)}${age}`;
}

function profileMeta(profile?: ProfileLite | null) {
  if (!profile) return "Profile not found";
  return [profile.gender, profile.city, profile.is_verified ? "Verified" : ""]
    .map(formatValue)
    .filter((item) => item !== "-")
    .join(" / ") || "No profile details";
}

function getErrorMessage(error: unknown) {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const maybeError = error as { message?: string; details?: string; hint?: string; code?: string };
    return [maybeError.message, maybeError.details, maybeError.hint, maybeError.code]
      .filter(Boolean)
      .join(" ");
  }
  return String(error);
}

function Avatar({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);
  const fallback = label.trim().slice(0, 1).toUpperCase() || "V";

  if (!src || failed) {
    return (
      <span className="admin-user-avatar-fallback" style={{ width: 58, height: 58 }}>
        {fallback}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label}
      className="admin-user-avatar-image"
      style={{ width: 58, height: 58 }}
      onError={() => setFailed(true)}
    />
  );
}

export default function LocationShowPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [adminUserId, setAdminUserId] = useState("");
  const [activeMode, setActiveMode] = useState<ModeFilter>("solo");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [cards, setCards] = useState<DisplayCard[]>([]);
  const [locationRows, setLocationRows] = useState<LocationShowRow[]>([]);

  useEffect(() => {
    let mounted = true;

    const verifyAccess = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.email || !isAllowedAdminEmail(session.user.email)) {
        router.replace("/admin");
        return;
      }

      if (mounted) {
        setAdminUserId(session.user.id);
        setCheckingAccess(false);
      }
    };

    void verifyAccess();

    return () => {
      mounted = false;
    };
  }, [router]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const locationRes = await supabase
        .from("admin_location_show_profiles")
        .select("id, mode, entity_id, is_active, note, updated_at")
        .eq("mode", activeMode)
        .order("updated_at", { ascending: false });

      if (locationRes.error) throw locationRes.error;

      let nextCards: DisplayCard[] = [];

      if (activeMode === "solo") {
        const soloRes = await supabase
          .from("profiles")
          .select("id, full_name, age, gender, dating_mode, city, photos, is_banned, is_verified")
          .eq("dating_mode", "solo")
          .order("full_name", { ascending: true });

        if (soloRes.error) throw soloRes.error;

        nextCards = ((soloRes.data || []) as ProfileLite[]).map((profile) => ({
          id: profile.id,
          title: profileTitle(profile),
          subtitle: profileMeta(profile),
          meta: profile.is_banned ? "Banned profile" : "Solo discovery profile",
          photo: firstPhoto(profile),
          mode: "solo",
        }));
      }

      if (activeMode === "duo") {
        const duoRes = await supabase
          .from("duos")
          .select(`
            id,
            created_at,
            user1:profiles!duos_user1_id_fkey(id, full_name, age, gender, city, photos, is_banned, is_verified),
            user2:profiles!duos_user2_id_fkey(id, full_name, age, gender, city, photos, is_banned, is_verified)
          `)
          .order("created_at", { ascending: false });

        if (duoRes.error) throw duoRes.error;

        nextCards = ((duoRes.data || []) as DuoRow[]).map((duo) => {
          const user1 = normalizeProfile(duo.user1);
          const user2 = normalizeProfile(duo.user2);
          const title = [profileTitle(user1), profileTitle(user2)].filter(Boolean).join(" & ");
          const cities = [user1?.city, user2?.city].map(formatValue).filter((item) => item !== "-");

          return {
            id: duo.id,
            title: title || `Duo ${duo.id.slice(0, 6)}`,
            subtitle: cities.length ? cities.join(" / ") : "No city saved",
            meta: "Duo profile",
            photo: firstPhoto(user1) || firstPhoto(user2),
            mode: "duo",
          };
        });
      }

      if (activeMode === "group") {
        const groupRes = await supabase
          .from("groups")
          .select(`
            id,
            created_at,
            members:group_members(
              user:profiles(id, full_name, age, gender, city, photos, is_banned, is_verified)
            )
          `)
          .order("created_at", { ascending: false });

        if (groupRes.error) throw groupRes.error;

        nextCards = ((groupRes.data || []) as GroupRow[]).map((group) => {
          const members = (group.members || [])
            .map((member) => normalizeProfile(member.user))
            .filter((member): member is ProfileLite => Boolean(member));
          const names = members.map((member) => formatValue(member.full_name)).filter((name) => name !== "-");
          const cities = members.map((member) => formatValue(member.city)).filter((city) => city !== "-");

          return {
            id: group.id,
            title: names.length ? names.join(" & ") : `Group ${group.id.slice(0, 6)}`,
            subtitle: `${members.length} member${members.length === 1 ? "" : "s"}${cities[0] ? ` / ${cities[0]}` : ""}`,
            meta: "Group profile",
            photo: members.map(firstPhoto).find(Boolean) || "",
            mode: "group",
          };
        });
      }

      const locationRows = (locationRes.data || []) as LocationShowRow[];
      const activeIds = new Set(
        locationRows.filter((row) => row.is_active).map((row) => row.entity_id)
      );

      setCards(
        nextCards.sort((a, b) => {
          const aActive = activeIds.has(a.id) ? 1 : 0;
          const bActive = activeIds.has(b.id) ? 1 : 0;
          if (aActive !== bActive) return bActive - aActive;
          return a.title.localeCompare(b.title);
        })
      );
      setLocationRows(locationRows);
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || "Could not load location show profiles.");
    } finally {
      setLoading(false);
    }
  }, [activeMode]);

  useEffect(() => {
    if (!checkingAccess) void loadRows();
  }, [checkingAccess, loadRows]);

  const activeMap = useMemo(() => {
    const map = new Map<string, LocationShowRow>();
    locationRows.forEach((row) => {
      if (row.is_active) map.set(row.entity_id, row);
    });
    return map;
  }, [locationRows]);

  const filteredCards = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return cards;
    return cards.filter((card) =>
      [card.title, card.subtitle, card.meta, card.id]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [cards, searchTerm]);

  const activeCount = activeMap.size;

  const toggleLocationShow = async (card: DisplayCard) => {
    setSavingId(card.id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const isActive = activeMap.has(card.id);
      const payload = {
        mode: activeMode,
        entity_id: card.id,
        is_active: !isActive,
        created_by: adminUserId || null,
        note: !isActive ? "Pinned by admin for nearby discovery." : null,
      };

      const { error } = await supabase
        .from("admin_location_show_profiles")
        .upsert(payload, { onConflict: "mode,entity_id" });

      if (error) throw error;

      setSuccessMessage(
        !isActive
          ? `${card.title} will now show in nearby discovery.`
          : `${card.title} was removed from Location Show.`
      );
      await loadRows();
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || "Could not update Location Show.");
    } finally {
      setSavingId("");
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
              <h2 className="admin-section-title">Location Show</h2>
              <p className="admin-section-subtitle">
                Selected profiles are forced into nearby discovery. Everyone else follows city, distance, and search-mile settings.
              </p>
            </div>
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => void loadRows()}
              disabled={loading}
            >
              Refresh
            </button>
          </div>

          <div className="admin-tabs-row" style={{ marginTop: 16 }}>
            {(["solo", "duo", "group"] as ModeFilter[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`admin-tab-button ${activeMode === mode ? "admin-tab-button-active" : ""}`}
                onClick={() => {
                  setActiveMode(mode);
                  setSearchTerm("");
                }}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
        </section>

        {errorMessage ? <div className="admin-error-box">{errorMessage}</div> : null}
        {successMessage ? <div className="admin-success-box">{successMessage}</div> : null}

        <section className="admin-stats-grid" style={{ marginBottom: 18 }}>
          <article className="admin-mini-card">
            <p className="admin-stat-label">Active Pins</p>
            <h3 className="admin-stat-value">{activeCount}</h3>
            <p className="admin-section-subtitle">Profiles currently forced into nearby discovery.</p>
          </article>
          <article className="admin-mini-card">
            <p className="admin-stat-label">Mode</p>
            <h3 className="admin-stat-value">{activeMode.toUpperCase()}</h3>
            <p className="admin-section-subtitle">Solo, duo, and group stay separated.</p>
          </article>
          <article className="admin-mini-card">
            <p className="admin-stat-label">Default Flow</p>
            <h3 className="admin-stat-value">Distance</h3>
            <p className="admin-section-subtitle">No pin means city/radius discovery decides visibility.</p>
          </article>
        </section>

        <section className="admin-main-card">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Profiles</h2>
              <p className="admin-section-subtitle">
                Turn on Location Show for any {activeMode} profile you want to push into nearby discovery.
              </p>
            </div>
            <input
              className="admin-input"
              style={{ maxWidth: 420 }}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name, city, or profile id..."
            />
          </div>

          {loading ? (
            <div className="admin-mini-card">
              <h3 className="admin-section-title">Loading profiles...</h3>
              <p className="admin-section-subtitle">Pulling live profile data.</p>
            </div>
          ) : filteredCards.length === 0 ? (
            <div className="admin-mini-card">
              <h3 className="admin-section-title">No profiles found</h3>
              <p className="admin-section-subtitle">Try another mode or search term.</p>
            </div>
          ) : (
            <div className="admin-form-grid" style={{ marginTop: 16 }}>
              {filteredCards.map((card) => {
                const isActive = activeMap.has(card.id);

                return (
                  <article key={card.id} className="admin-mini-card">
                    <div className="admin-section-header" style={{ alignItems: "center", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Avatar src={card.photo} label={card.title} />
                        <div>
                          <h3 className="admin-section-title" style={{ fontSize: 18 }}>
                            {card.title}
                          </h3>
                          <p className="admin-section-subtitle">{card.subtitle}</p>
                        </div>
                      </div>
                      <span className="admin-tab-button admin-tab-button-active">
                        {isActive ? "Showing" : "Normal"}
                      </span>
                    </div>

                    <p className="admin-section-subtitle" style={{ marginTop: 12 }}>
                      {card.meta}
                    </p>
                    <p className="admin-section-subtitle" style={{ marginTop: 4 }}>
                      ID: {card.id}
                    </p>

                    <button
                      type="button"
                      className={isActive ? "admin-secondary-button" : "admin-primary-button"}
                      style={{ width: "100%", marginTop: 16 }}
                      onClick={() => void toggleLocationShow(card)}
                      disabled={savingId === card.id}
                    >
                      {savingId === card.id
                        ? "Saving..."
                        : isActive
                        ? "Remove from Location Show"
                        : "Show Nearby"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
