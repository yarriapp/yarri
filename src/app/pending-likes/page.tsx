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
  gender: string | null;
  dating_mode: string | null;
  photos: string[] | null;
  city?: string | null;
};

type DuoRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  user1?: ProfileLite | ProfileLite[] | null;
  user2?: ProfileLite | ProfileLite[] | null;
};

type GroupMemberRow = {
  group_id: string;
  user_id: string;
};

type GroupRow = {
  id: string;
  created_at?: string | null;
};

type GroupWithMembers = GroupRow & {
  members: { user_id: string; user: ProfileLite | null }[];
};

type SoloLikeRow = {
  id: string;
  user_id: string;
  target_user_id: string;
  action: string | null;
  created_at?: string | null;
};

type DuoLikeRow = {
  id: string;
  duo_id: string;
  target_duo_id: string;
  actor_user_id?: string | null;
  action: string | null;
  created_at?: string | null;
};

type GroupLikeRow = {
  id: string;
  group_id: string;
  target_group_id: string;
  actor_user_id?: string | null;
  action: string | null;
  created_at?: string | null;
};

type SoloMatchRow = {
  user1_id: string;
  user2_id: string;
};

type DuoMatchRow = {
  duo1_id: string;
  duo2_id: string;
};

type GroupMatchRow = {
  group1_id: string;
  group2_id: string;
};

type PendingLikeCard = {
  id: string;
  mode: ModeFilter;
  action: string;
  actorLabel: string;
  targetLabel: string;
  actorMeta: string;
  targetMeta: string;
  createdAt?: string | null;
  note?: string;
};

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

function formatValue(value?: string | number | null) {
  if (value === null || value === undefined) return "-";
  const clean = String(value).trim();
  if (!clean) return "-";
  return clean.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleString();
}

function normalizeProfile(profile?: ProfileLite | ProfileLite[] | null) {
  if (Array.isArray(profile)) return profile[0] || null;
  return profile || null;
}

function getPairKey(a?: string | null, b?: string | null) {
  return [String(a || ""), String(b || "")].sort().join(":");
}

function getProfileLabel(profile?: ProfileLite | null, fallback = "Unknown user") {
  if (!profile) return fallback;
  const name = formatValue(profile.full_name);
  const age = profile.age ? `, ${profile.age}` : "";
  return `${name}${age}`;
}

function getProfileMeta(profile?: ProfileLite | null) {
  if (!profile) return "Profile not found";
  return [formatValue(profile.gender), formatValue(profile.dating_mode), formatValue(profile.city)]
    .filter((item) => item !== "-")
    .join(" / ") || "No profile meta";
}

function getDuoLabel(duo?: DuoRow | null) {
  if (!duo) return "Unknown duo";
  const user1 = normalizeProfile(duo.user1);
  const user2 = normalizeProfile(duo.user2);
  const names = [user1, user2].map((profile) => formatValue(profile?.full_name)).filter((name) => name !== "-");
  return names.length ? names.join(" & ") : `Duo ${duo.id.slice(0, 6)}`;
}

function getDuoMeta(duo?: DuoRow | null) {
  if (!duo) return "Duo not found";
  const user1 = normalizeProfile(duo.user1);
  const user2 = normalizeProfile(duo.user2);
  const cities = [user1?.city, user2?.city].map(formatValue).filter((item) => item !== "-");
  return `Duo / ${cities[0] || "Nearby"}`;
}

function getGroupLabel(group?: GroupWithMembers | null) {
  if (!group) return "Unknown group";
  const names = group.members.map((member) => formatValue(member.user?.full_name)).filter((name) => name !== "-");
  return names.length ? names.join(" & ") : `Group ${group.id.slice(0, 6)}`;
}

function getGroupMeta(group?: GroupWithMembers | null) {
  if (!group) return "Group not found";
  const city = group.members.map((member) => formatValue(member.user?.city)).find((value) => value !== "-");
  return `${group.members.length} member${group.members.length === 1 ? "" : "s"}${city ? ` / ${city}` : ""}`;
}

export default function PendingLikesPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("solo");
  const [searchTerm, setSearchTerm] = useState("");

  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [duos, setDuos] = useState<DuoRow[]>([]);
  const [groups, setGroups] = useState<GroupWithMembers[]>([]);
  const [soloLikes, setSoloLikes] = useState<SoloLikeRow[]>([]);
  const [duoLikes, setDuoLikes] = useState<DuoLikeRow[]>([]);
  const [groupLikes, setGroupLikes] = useState<GroupLikeRow[]>([]);
  const [soloMatches, setSoloMatches] = useState<SoloMatchRow[]>([]);
  const [duoMatches, setDuoMatches] = useState<DuoMatchRow[]>([]);
  const [groupMatches, setGroupMatches] = useState<GroupMatchRow[]>([]);

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

  const loadPendingLikes = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const [
        profilesResult,
        duosResult,
        groupsResult,
        groupMembersResult,
        soloLikesResult,
        duoLikesResult,
        groupLikesResult,
        soloMatchesResult,
        duoMatchesResult,
        groupMatchesResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, age, gender, dating_mode, photos, city")
          .order("created_at", { ascending: false }),
        supabase
          .from("duos")
          .select(`
            id,
            user1_id,
            user2_id,
            user1:profiles!duos_user1_id_fkey(id, full_name, age, gender, dating_mode, photos, city),
            user2:profiles!duos_user2_id_fkey(id, full_name, age, gender, dating_mode, photos, city)
          `),
        supabase.from("groups").select("id, created_at"),
        supabase.from("group_members").select("group_id, user_id"),
        supabase
          .from("likes")
          .select("id, user_id, target_user_id, action, created_at")
          .in("action", ["like", "vibe"])
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("duo_likes")
          .select("id, duo_id, target_duo_id, actor_user_id, action, created_at")
          .in("action", ["like", "vibe"])
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("group_likes")
          .select("id, group_id, target_group_id, actor_user_id, action, created_at")
          .in("action", ["like", "vibe"])
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("matches").select("user1_id, user2_id"),
        supabase.from("duo_matches").select("duo1_id, duo2_id"),
        supabase.from("group_matches").select("group1_id, group2_id"),
      ]);

      const loadErrors = [
        profilesResult.error ? `Profiles: ${getErrorMessage(profilesResult.error)}` : "",
        duosResult.error ? `Duos: ${getErrorMessage(duosResult.error)}` : "",
        groupsResult.error ? `Groups: ${getErrorMessage(groupsResult.error)}` : "",
        groupMembersResult.error ? `Group members: ${getErrorMessage(groupMembersResult.error)}` : "",
        soloLikesResult.error ? `Solo likes: ${getErrorMessage(soloLikesResult.error)}` : "",
        duoLikesResult.error ? `Duo likes: ${getErrorMessage(duoLikesResult.error)}` : "",
        groupLikesResult.error ? `Group likes: ${getErrorMessage(groupLikesResult.error)}` : "",
        soloMatchesResult.error ? `Solo matches: ${getErrorMessage(soloMatchesResult.error)}` : "",
        duoMatchesResult.error ? `Duo matches: ${getErrorMessage(duoMatchesResult.error)}` : "",
        groupMatchesResult.error ? `Group matches: ${getErrorMessage(groupMatchesResult.error)}` : "",
      ].filter(Boolean);

      if (loadErrors.length) {
        setErrorMessage(loadErrors.join(" "));
      }

      const loadedProfiles = profilesResult.error ? [] : ((profilesResult.data || []) as ProfileLite[]);
      const profileMap = new Map(loadedProfiles.map((profile) => [profile.id, profile]));
      const loadedMembers = groupMembersResult.error ? [] : ((groupMembersResult.data || []) as GroupMemberRow[]);

      setProfiles(loadedProfiles);
      setDuos((duosResult.error ? [] : (duosResult.data || [])) as DuoRow[]);
      setGroups(
        groupsResult.error
          ? []
          : ((groupsResult.data || []) as GroupRow[]).map((group) => ({
              ...group,
              members: loadedMembers
                .filter((member) => member.group_id === group.id)
                .map((member) => ({
                  user_id: member.user_id,
                  user: profileMap.get(member.user_id) || null,
                })),
            }))
      );
      setSoloLikes(soloLikesResult.error ? [] : ((soloLikesResult.data || []) as SoloLikeRow[]));
      setDuoLikes(duoLikesResult.error ? [] : ((duoLikesResult.data || []) as DuoLikeRow[]));
      setGroupLikes(groupLikesResult.error ? [] : ((groupLikesResult.data || []) as GroupLikeRow[]));
      setSoloMatches(soloMatchesResult.error ? [] : ((soloMatchesResult.data || []) as SoloMatchRow[]));
      setDuoMatches(duoMatchesResult.error ? [] : ((duoMatchesResult.data || []) as DuoMatchRow[]));
      setGroupMatches(groupMatchesResult.error ? [] : ((groupMatchesResult.data || []) as GroupMatchRow[]));
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || "Could not load pending likes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkingAccess) return;
    void loadPendingLikes();
  }, [checkingAccess, loadPendingLikes]);

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const duoById = useMemo(() => new Map(duos.map((duo) => [duo.id, duo])), [duos]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);

  const pendingCards = useMemo<PendingLikeCard[]>(() => {
    const soloMatchPairs = new Set(soloMatches.map((match) => getPairKey(match.user1_id, match.user2_id)));
    const duoMatchPairs = new Set(duoMatches.map((match) => getPairKey(match.duo1_id, match.duo2_id)));
    const groupMatchPairs = new Set(groupMatches.map((match) => getPairKey(match.group1_id, match.group2_id)));
    const soloLikeKeys = new Set(soloLikes.map((like) => `${like.user_id}:${like.target_user_id}`));
    const duoLikeKeys = new Set(duoLikes.map((like) => `${like.duo_id}:${like.target_duo_id}`));
    const groupLikeKeys = new Set(groupLikes.map((like) => `${like.group_id}:${like.target_group_id}`));

    const soloCards = soloLikes
      .filter((like) => !soloLikeKeys.has(`${like.target_user_id}:${like.user_id}`))
      .filter((like) => !soloMatchPairs.has(getPairKey(like.user_id, like.target_user_id)))
      .map((like) => {
        const actor = profileById.get(like.user_id);
        const target = profileById.get(like.target_user_id);
        return {
          id: `solo-${like.id}`,
          mode: "solo" as const,
          action: like.action || "like",
          actorLabel: getProfileLabel(actor, like.user_id),
          targetLabel: getProfileLabel(target, like.target_user_id),
          actorMeta: getProfileMeta(actor),
          targetMeta: getProfileMeta(target),
          createdAt: like.created_at,
        };
      });

    const duoCards = duoLikes
      .filter((like) => !duoLikeKeys.has(`${like.target_duo_id}:${like.duo_id}`))
      .filter((like) => !duoMatchPairs.has(getPairKey(like.duo_id, like.target_duo_id)))
      .map((like) => {
        const actor = duoById.get(like.duo_id);
        const target = duoById.get(like.target_duo_id);
        return {
          id: `duo-${like.id}`,
          mode: "duo" as const,
          action: like.action || "like",
          actorLabel: getDuoLabel(actor),
          targetLabel: getDuoLabel(target),
          actorMeta: getDuoMeta(actor),
          targetMeta: getDuoMeta(target),
          createdAt: like.created_at,
          note: like.actor_user_id ? `Actor user: ${like.actor_user_id}` : undefined,
        };
      });

    const groupCards = groupLikes
      .filter((like) => !groupLikeKeys.has(`${like.target_group_id}:${like.group_id}`))
      .filter((like) => !groupMatchPairs.has(getPairKey(like.group_id, like.target_group_id)))
      .map((like) => {
        const actor = groupById.get(like.group_id);
        const target = groupById.get(like.target_group_id);
        return {
          id: `group-${like.id}`,
          mode: "group" as const,
          action: like.action || "like",
          actorLabel: getGroupLabel(actor),
          targetLabel: getGroupLabel(target),
          actorMeta: getGroupMeta(actor),
          targetMeta: getGroupMeta(target),
          createdAt: like.created_at,
          note: like.actor_user_id ? `Actor user: ${like.actor_user_id}` : undefined,
        };
      });

    return [...soloCards, ...duoCards, ...groupCards].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }, [duoById, duoLikes, duoMatches, groupById, groupLikes, groupMatches, profileById, soloLikes, soloMatches]);

  const visibleCards = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return pendingCards.filter((card) => {
      if (card.mode !== modeFilter) return false;
      if (!query) return true;
      return [card.actorLabel, card.targetLabel, card.actorMeta, card.targetMeta, card.action, card.note]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [modeFilter, pendingCards, searchTerm]);

  const stats = useMemo(
    () => ({
      solo: pendingCards.filter((card) => card.mode === "solo").length,
      duo: pendingCards.filter((card) => card.mode === "duo").length,
      group: pendingCards.filter((card) => card.mode === "group").length,
    }),
    [pendingCards]
  );

  if (checkingAccess) {
    return (
      <main className="admin-dashboard-page">
        <div className="admin-dashboard-shell">
          <div className="admin-main-card">
            <h1 className="admin-section-title">Checking admin access...</h1>
            <p className="admin-section-subtitle">Please wait while this page is verified.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-dashboard-page">
      <div className="admin-dashboard-shell">
        <Header />

        <section className="admin-action-center">
          <div className="admin-action-hero">
            <div>
              <span className="admin-page-eyebrow">One Way Likes</span>
              <h2 className="admin-section-title">Who liked who</h2>
              <p className="admin-section-subtitle">
                Likes and vibes where the target has not liked back and no match exists yet.
              </p>
            </div>
            <button type="button" className="admin-secondary-button" onClick={() => void loadPendingLikes()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {errorMessage ? <div className="admin-error-box">{errorMessage}</div> : null}

          <div className="admin-stats-grid admin-action-stats">
            <div className="admin-stat-card">
              <div className="admin-stat-label">Solo Pending</div>
              <div className="admin-stat-value">{stats.solo}</div>
              <div className="admin-stat-note">One user liked another</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Duo Pending</div>
              <div className="admin-stat-value">{stats.duo}</div>
              <div className="admin-stat-note">One duo liked another</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Group Pending</div>
              <div className="admin-stat-value">{stats.group}</div>
              <div className="admin-stat-note">One group liked another</div>
            </div>
          </div>

          <div className="admin-action-toolbar">
            <div className="admin-tabs-row">
              {(["solo", "duo", "group"] as ModeFilter[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`admin-tab-button ${modeFilter === mode ? "admin-tab-button-active" : ""}`}
                  onClick={() => setModeFilter(mode)}
                >
                  {formatValue(mode)}
                </button>
              ))}
            </div>

            <input
              className="admin-input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name, city, id..."
            />
          </div>

          <section className="admin-main-card">
            <div className="admin-section-heading-row">
              <div>
                <h3 className="admin-section-title">{formatValue(modeFilter)} Pending Likes</h3>
                <p className="admin-section-subtitle">
                  {visibleCards.length} pending like{visibleCards.length === 1 ? "" : "s"} visible.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="admin-empty-card">
                <h3>Loading pending likes...</h3>
                <p>Checking one-way likes across all modes.</p>
              </div>
            ) : visibleCards.length === 0 ? (
              <div className="admin-empty-card">
                <h3>No pending likes</h3>
                <p>No one-way likes found for this mode.</p>
              </div>
            ) : (
              <div className="admin-action-list-grid">
                {visibleCards.map((card) => (
                  <article key={card.id} className="admin-action-record">
                    <div className="admin-action-record-main">
                      <span className="admin-status-chip admin-action-chip-pass">{formatValue(card.action)}</span>
                      <div className="admin-action-pair">
                        <div>
                          <span className="admin-action-label">Liked by</span>
                          <strong>{card.actorLabel}</strong>
                          <small>{card.actorMeta}</small>
                        </div>
                        <span className="admin-action-arrow">to</span>
                        <div>
                          <span className="admin-action-label">Waiting on</span>
                          <strong>{card.targetLabel}</strong>
                          <small>{card.targetMeta}</small>
                        </div>
                      </div>
                      <div className="admin-action-record-meta">
                        <span>{formatDate(card.createdAt)}</span>
                        {card.note ? <span>{card.note}</span> : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
