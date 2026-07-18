"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { isAllowedAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

type ModeFilter = "solo" | "duo" | "group";
type ActionTab = "passes" | "unmatches" | "blocks";
type GenderFilter = "all" | "male" | "female";

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
  created_at: string;
  user1?: ProfileLite | null;
  user2?: ProfileLite | null;
};

type GroupMember = {
  user_id: string;
  user?: ProfileLite | null;
};

type GroupMemberRow = {
  group_id: string;
  user_id: string;
};

type GroupRow = {
  id: string;
  created_at: string;
  members: GroupMember[];
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

type MatchActionRow = {
  id: string;
  mode: ModeFilter;
  match_id: string;
  action_type: "unmatch" | "block";
  actor_user_id: string;
  actor_entity_id: string | null;
  target_entity_id: string | null;
  notes?: string | null;
  created_at?: string | null;
};

type BlockRow = {
  id: string;
  mode: ModeFilter;
  actor_user_id: string;
  actor_entity_id: string | null;
  target_entity_id: string;
  target_user_id: string | null;
  reason?: string | null;
  created_at?: string | null;
};

type ActionCard = {
  id: string;
  tableName: "likes" | "duo_likes" | "group_likes" | "match_actions" | "profile_blocks";
  mode: ModeFilter;
  type: "pass" | "unmatch" | "block";
  actorLabel: string;
  targetLabel: string;
  actorMeta: string;
  targetMeta: string;
  action: string;
  createdAt?: string | null;
  note?: string;
  actorGender?: string | null;
  rawId: string;
};

function formatDate(value?: string | null) {
  if (!value) return "No date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No date";
  return parsed.toLocaleString();
}

function getErrorMessage(error: unknown) {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const maybeError = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    return [
      maybeError.message,
      maybeError.details,
      maybeError.hint ? `Hint: ${maybeError.hint}` : "",
      maybeError.code ? `Code: ${maybeError.code}` : "",
    ]
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

function normalizeProfile(profile?: ProfileLite | ProfileLite[] | null) {
  if (Array.isArray(profile)) return profile[0] || null;
  return profile || null;
}

type DuoQueryRow = Omit<DuoRow, "user1" | "user2"> & {
  user1?: ProfileLite | ProfileLite[] | null;
  user2?: ProfileLite | ProfileLite[] | null;
};

function normalizeDuoRows(rows: DuoQueryRow[]) {
  return rows.map((duo) => ({
    ...duo,
    user1: normalizeProfile(duo.user1),
    user2: normalizeProfile(duo.user2),
  })) as DuoRow[];
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
  const names = [duo.user1, duo.user2]
    .map((profile) => formatValue(profile?.full_name))
    .filter((name) => name !== "-");
  return names.length ? names.join(" & ") : `Duo ${duo.id.slice(0, 6)}`;
}

function getDuoMeta(duo?: DuoRow | null) {
  if (!duo) return "Duo not found";
  const cities = [duo.user1?.city, duo.user2?.city].map(formatValue).filter((item) => item !== "-");
  return `Duo / ${cities[0] || "Nearby"}`;
}

function getGroupLabel(group?: GroupRow | null) {
  if (!group) return "Unknown group";
  const names = group.members
    .map((member) => formatValue(member.user?.full_name))
    .filter((name) => name !== "-");
  return names.length ? names.join(" & ") : `Group ${group.id.slice(0, 6)}`;
}

function getGroupMeta(group?: GroupRow | null) {
  if (!group) return "Group not found";
  return `${group.members.length} member${group.members.length === 1 ? "" : "s"}`;
}

function genderMatches(profile?: ProfileLite | null, genderFilter?: GenderFilter) {
  if (!genderFilter || genderFilter === "all") return true;
  const gender = String(profile?.gender || "").trim().toLowerCase();
  if (genderFilter === "male") return gender === "male" || gender === "man" || gender.includes("man");
  return gender === "female" || gender === "woman" || gender.includes("woman");
}

export default function AdminUserActionsPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("solo");
  const [actionTab, setActionTab] = useState<ActionTab>("passes");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [processingId, setProcessingId] = useState("");

  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [duos, setDuos] = useState<DuoRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [soloLikes, setSoloLikes] = useState<SoloLikeRow[]>([]);
  const [duoLikes, setDuoLikes] = useState<DuoLikeRow[]>([]);
  const [groupLikes, setGroupLikes] = useState<GroupLikeRow[]>([]);
  const [matchActions, setMatchActions] = useState<MatchActionRow[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);

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

  const loadActions = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const [
        profilesResult,
        duosResult,
        groupsResult,
        groupMembersResult,
        soloPassResult,
        duoPassResult,
        groupPassResult,
        matchActionsResult,
        blocksResult,
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
            created_at,
            user1:profiles!duos_user1_id_fkey(id, full_name, age, gender, dating_mode, photos, city),
            user2:profiles!duos_user2_id_fkey(id, full_name, age, gender, dating_mode, photos, city)
          `)
          .order("created_at", { ascending: false }),
        supabase
          .from("groups")
          .select("id, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("group_members")
          .select("group_id, user_id"),
        supabase
          .from("likes")
          .select("id, user_id, target_user_id, action, created_at")
          .eq("action", "pass")
          .order("created_at", { ascending: false })
          .limit(250),
        supabase
          .from("duo_likes")
          .select("id, duo_id, target_duo_id, actor_user_id, action, created_at")
          .eq("action", "pass")
          .order("created_at", { ascending: false })
          .limit(250),
        supabase
          .from("group_likes")
          .select("id, group_id, target_group_id, actor_user_id, action, created_at")
          .eq("action", "pass")
          .order("created_at", { ascending: false })
          .limit(250),
        supabase
          .from("match_actions")
          .select("id, mode, match_id, action_type, actor_user_id, actor_entity_id, target_entity_id, notes, created_at")
          .order("created_at", { ascending: false })
          .limit(250),
        supabase
          .from("profile_blocks")
          .select("id, mode, actor_user_id, actor_entity_id, target_entity_id, target_user_id, reason, created_at")
          .order("created_at", { ascending: false })
          .limit(250),
      ]);

      const loadErrors = [
        profilesResult.error ? `Profiles: ${getErrorMessage(profilesResult.error)}` : "",
        duosResult.error ? `Duos: ${getErrorMessage(duosResult.error)}` : "",
        groupsResult.error ? `Groups: ${getErrorMessage(groupsResult.error)}` : "",
        groupMembersResult.error ? `Group members: ${getErrorMessage(groupMembersResult.error)}` : "",
        soloPassResult.error ? `Solo passes: ${getErrorMessage(soloPassResult.error)}` : "",
        duoPassResult.error ? `Duo passes: ${getErrorMessage(duoPassResult.error)}` : "",
        groupPassResult.error ? `Group passes: ${getErrorMessage(groupPassResult.error)}` : "",
        matchActionsResult.error ? `Unmatch/block logs: ${getErrorMessage(matchActionsResult.error)}` : "",
        blocksResult.error ? `Blocks: ${getErrorMessage(blocksResult.error)}` : "",
      ].filter(Boolean);

      if (loadErrors.length) {
        setErrorMessage(
          `${loadErrors.join(" ")} The database permissions for action history need to be updated before these records can be shown.`
        );
      }

      const loadedProfiles = profilesResult.error ? [] : ((profilesResult.data || []) as ProfileLite[]);
      const loadedProfileMap = new Map(loadedProfiles.map((profile) => [profile.id, profile]));
      const loadedGroupMembers = groupMembersResult.error ? [] : ((groupMembersResult.data || []) as GroupMemberRow[]);
      const loadedGroups = groupsResult.error
        ? []
        : ((groupsResult.data || []) as { id: string; created_at: string }[]).map((group) => ({
            ...group,
            members: loadedGroupMembers
              .filter((member) => member.group_id === group.id)
              .map((member) => ({
                user_id: member.user_id,
                user: loadedProfileMap.get(member.user_id) || null,
              })),
          }));

      setProfiles(loadedProfiles);
      setDuos(duosResult.error ? [] : normalizeDuoRows((duosResult.data || []) as DuoQueryRow[]));
      setGroups(loadedGroups);
      setSoloLikes(soloPassResult.error ? [] : ((soloPassResult.data || []) as SoloLikeRow[]));
      setDuoLikes(duoPassResult.error ? [] : ((duoPassResult.data || []) as DuoLikeRow[]));
      setGroupLikes(groupPassResult.error ? [] : ((groupPassResult.data || []) as GroupLikeRow[]));
      setMatchActions(matchActionsResult.error ? [] : ((matchActionsResult.data || []) as MatchActionRow[]));
      setBlocks(blocksResult.error ? [] : ((blocksResult.data || []) as BlockRow[]));
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || "Could not load user actions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkingAccess) return;
    void loadActions();
  }, [checkingAccess, loadActions]);

  const profileById = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }, [profiles]);

  const duoById = useMemo(() => {
    return new Map(duos.map((duo) => [duo.id, duo]));
  }, [duos]);

  const groupById = useMemo(() => {
    return new Map(groups.map((group) => [group.id, group]));
  }, [groups]);

  const actionCards = useMemo<ActionCard[]>(() => {
    const soloPasses = soloLikes.map((row) => {
      const actor = profileById.get(row.user_id);
      const target = profileById.get(row.target_user_id);
      return {
        id: row.id,
        rawId: row.id,
        tableName: "likes" as const,
        mode: "solo" as const,
        type: "pass" as const,
        actorLabel: getProfileLabel(actor, row.user_id),
        targetLabel: getProfileLabel(target, row.target_user_id),
        actorMeta: getProfileMeta(actor),
        targetMeta: getProfileMeta(target),
        actorGender: actor?.gender || null,
        action: row.action || "pass",
        createdAt: row.created_at,
      };
    });

    const duoPasses = duoLikes.map((row) => {
      const actor = duoById.get(row.duo_id);
      const target = duoById.get(row.target_duo_id);
      return {
        id: row.id,
        rawId: row.id,
        tableName: "duo_likes" as const,
        mode: "duo" as const,
        type: "pass" as const,
        actorLabel: getDuoLabel(actor),
        targetLabel: getDuoLabel(target),
        actorMeta: getDuoMeta(actor),
        targetMeta: getDuoMeta(target),
        action: row.action || "pass",
        createdAt: row.created_at,
        note: row.actor_user_id ? `Actor user: ${row.actor_user_id}` : undefined,
      };
    });

    const groupPasses = groupLikes.map((row) => {
      const actor = groupById.get(row.group_id);
      const target = groupById.get(row.target_group_id);
      return {
        id: row.id,
        rawId: row.id,
        tableName: "group_likes" as const,
        mode: "group" as const,
        type: "pass" as const,
        actorLabel: getGroupLabel(actor),
        targetLabel: getGroupLabel(target),
        actorMeta: getGroupMeta(actor),
        targetMeta: getGroupMeta(target),
        action: row.action || "pass",
        createdAt: row.created_at,
        note: row.actor_user_id ? `Actor user: ${row.actor_user_id}` : undefined,
      };
    });

    const unmatches = matchActions
      .filter((row) => row.action_type === "unmatch")
      .map((row) => {
        const actorProfile = profileById.get(row.actor_user_id);
        const actorEntity =
          row.mode === "duo"
            ? duoById.get(row.actor_entity_id || "")
            : row.mode === "group"
            ? groupById.get(row.actor_entity_id || "")
            : null;
        const targetEntity =
          row.mode === "duo"
            ? duoById.get(row.target_entity_id || "")
            : row.mode === "group"
            ? groupById.get(row.target_entity_id || "")
            : null;
        const targetProfile = row.mode === "solo" ? profileById.get(row.target_entity_id || "") : null;

        return {
          id: row.id,
          rawId: row.id,
          tableName: "match_actions" as const,
          mode: row.mode,
          type: "unmatch" as const,
          actorLabel:
            row.mode === "solo" ? getProfileLabel(actorProfile, row.actor_user_id) : row.mode === "duo" ? getDuoLabel(actorEntity as DuoRow | null) : getGroupLabel(actorEntity as GroupRow | null),
          targetLabel:
            row.mode === "solo" ? getProfileLabel(targetProfile, row.target_entity_id || "") : row.mode === "duo" ? getDuoLabel(targetEntity as DuoRow | null) : getGroupLabel(targetEntity as GroupRow | null),
          actorMeta: row.mode === "solo" ? getProfileMeta(actorProfile) : row.mode,
          targetMeta: row.mode === "solo" ? getProfileMeta(targetProfile) : row.mode,
          action: row.action_type,
          createdAt: row.created_at,
          note: row.notes || `Original match: ${row.match_id}`,
        };
      });

    const blockCards = blocks.map((row) => {
      const actorProfile = profileById.get(row.actor_user_id);
      const targetProfile = row.target_user_id ? profileById.get(row.target_user_id) : null;
      const actorEntity =
        row.mode === "duo"
          ? duoById.get(row.actor_entity_id || "")
          : row.mode === "group"
          ? groupById.get(row.actor_entity_id || "")
          : null;
      const targetEntity =
        row.mode === "duo"
          ? duoById.get(row.target_entity_id)
          : row.mode === "group"
          ? groupById.get(row.target_entity_id)
          : null;

      return {
        id: row.id,
        rawId: row.id,
        tableName: "profile_blocks" as const,
        mode: row.mode,
        type: "block" as const,
        actorLabel:
          row.mode === "solo" ? getProfileLabel(actorProfile, row.actor_user_id) : row.mode === "duo" ? getDuoLabel(actorEntity as DuoRow | null) : getGroupLabel(actorEntity as GroupRow | null),
        targetLabel:
          row.mode === "solo" ? getProfileLabel(targetProfile, row.target_entity_id) : row.mode === "duo" ? getDuoLabel(targetEntity as DuoRow | null) : getGroupLabel(targetEntity as GroupRow | null),
        actorMeta: row.mode === "solo" ? getProfileMeta(actorProfile) : row.mode,
        targetMeta: row.mode === "solo" ? getProfileMeta(targetProfile) : row.mode,
        action: "block",
        createdAt: row.created_at,
        note: row.reason || "No reason saved",
      };
    });

    return [...soloPasses, ...duoPasses, ...groupPasses, ...unmatches, ...blockCards];
  }, [blocks, duoById, duoLikes, groupById, groupLikes, matchActions, profileById, soloLikes]);

  const visibleCards = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return actionCards.filter((card) => {
      if (card.mode !== modeFilter) return false;
      if (actionTab === "passes" && card.type !== "pass") return false;
      if (actionTab === "unmatches" && card.type !== "unmatch") return false;
      if (actionTab === "blocks" && card.type !== "block") return false;

      if (modeFilter === "solo" && actionTab === "passes") {
        const source = soloLikes.find((row) => row.id === card.id);
        const actor = source ? profileById.get(source.user_id) : null;
        if (!genderMatches(actor, genderFilter)) return false;
      }

      if (!query) return true;
      return [card.actorLabel, card.targetLabel, card.actorMeta, card.targetMeta, card.note, card.rawId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [actionCards, actionTab, genderFilter, modeFilter, profileById, searchTerm, soloLikes]);

  const stats = useMemo(() => {
    return {
      soloPasses: soloLikes.length,
      duoPasses: duoLikes.length,
      groupPasses: groupLikes.length,
      unmatches: matchActions.filter((row) => row.action_type === "unmatch").length,
      blocks: blocks.length,
    };
  }, [blocks.length, duoLikes.length, groupLikes.length, matchActions, soloLikes.length]);

  const handleReverse = async (card: ActionCard) => {
    try {
      setProcessingId(card.id);
      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase.rpc("admin_reverse_user_action", {
        p_action_table: card.tableName,
        p_action_id: card.rawId,
      });

      if (error) throw error;

      setSuccessMessage(`${formatValue(card.type)} pair reversed. Both directions can enter discovery again.`);
      await loadActions();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not reverse action.");
    } finally {
      setProcessingId("");
    }
  };

  const handleSetAction = async (card: ActionCard, action: "like" | "vibe" | "pass") => {
    try {
      setProcessingId(card.id);
      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase.rpc("admin_set_discovery_action", {
        p_action_table: card.tableName,
        p_action_id: card.rawId,
        p_action: action,
      });

      if (error) throw error;

      setSuccessMessage(`Action changed to ${action}.`);
      await loadActions();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update action.");
    } finally {
      setProcessingId("");
    }
  };

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
              <span className="admin-page-eyebrow">Discovery Repair</span>
              <h2 className="admin-section-title">Passes, unmatches, and blocks</h2>
              <p className="admin-section-subtitle">
                Review actions that hide profiles from each other. Reverse a pair when demo users need to appear again.
              </p>
            </div>
            <button type="button" className="admin-secondary-button" onClick={() => void loadActions()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {errorMessage ? <div className="admin-error-box">{errorMessage}</div> : null}
          {successMessage ? <div className="admin-success-box">{successMessage}</div> : null}

          <div className="admin-stats-grid admin-action-stats">
            <div className="admin-stat-card">
              <div className="admin-stat-label">Solo Passes</div>
              <div className="admin-stat-value">{stats.soloPasses}</div>
              <div className="admin-stat-note">Male/female filter below</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Duo Passes</div>
              <div className="admin-stat-value">{stats.duoPasses}</div>
              <div className="admin-stat-note">Duo to duo hidden rows</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Group Passes</div>
              <div className="admin-stat-value">{stats.groupPasses}</div>
              <div className="admin-stat-note">Group discovery passes</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Unmatches</div>
              <div className="admin-stat-value">{stats.unmatches}</div>
              <div className="admin-stat-note">From match action logs</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Blocks</div>
              <div className="admin-stat-value">{stats.blocks}</div>
              <div className="admin-stat-note">Profile block records</div>
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

            <div className="admin-tabs-row">
              {(["passes", "unmatches", "blocks"] as ActionTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`admin-tab-button ${actionTab === tab ? "admin-tab-button-active" : ""}`}
                  onClick={() => setActionTab(tab)}
                >
                  {formatValue(tab)}
                </button>
              ))}
            </div>

            {modeFilter === "solo" && actionTab === "passes" ? (
              <div className="admin-tabs-row">
                {(["all", "male", "female"] as GenderFilter[]).map((gender) => (
                  <button
                    key={gender}
                    type="button"
                    className={`admin-tab-button ${genderFilter === gender ? "admin-tab-button-active" : ""}`}
                    onClick={() => setGenderFilter(gender)}
                  >
                    {formatValue(gender)}
                  </button>
                ))}
              </div>
            ) : null}

            <input
              className="admin-input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name, id, city, note..."
            />
          </div>

          <section className="admin-main-card">
            <div className="admin-section-heading-row">
              <div>
                <h3 className="admin-section-title">
                  {formatValue(modeFilter)} {formatValue(actionTab)}
                </h3>
                <p className="admin-section-subtitle">
                  {visibleCards.length} action{visibleCards.length === 1 ? "" : "s"} visible.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="admin-empty-card">
                <h3>Loading actions...</h3>
                <p>Fetching passes, unmatches, and block records.</p>
              </div>
            ) : visibleCards.length === 0 ? (
              <div className="admin-empty-card">
                <h3>No actions found</h3>
                <p>This section is clean for the current filters.</p>
              </div>
            ) : (
              <div className="admin-action-list-grid">
                {visibleCards.map((card) => (
                  <article key={`${card.tableName}-${card.id}`} className="admin-action-record">
                    <div className="admin-action-record-main">
                      <span className={`admin-status-chip admin-action-chip-${card.type}`}>
                        {formatValue(card.type)}
                      </span>
                      <div className="admin-action-pair">
                        <div>
                          <span className="admin-action-label">Actor</span>
                          <strong>{card.actorLabel}</strong>
                          <small>{card.actorMeta}</small>
                        </div>
                        <span className="admin-action-arrow">to</span>
                        <div>
                          <span className="admin-action-label">Target</span>
                          <strong>{card.targetLabel}</strong>
                          <small>{card.targetMeta}</small>
                        </div>
                      </div>
                      <div className="admin-action-record-meta">
                        <span>{formatDate(card.createdAt)}</span>
                        <span>{card.tableName}</span>
                        <span>{card.rawId}</span>
                      </div>
                      {card.note ? <p className="admin-action-note">{card.note}</p> : null}
                    </div>

                    <div className="admin-action-record-buttons">
                      {card.type === "pass" ? (
                        <>
                          <button
                            type="button"
                            className="admin-secondary-button"
                            onClick={() => void handleSetAction(card, "like")}
                            disabled={!!processingId}
                          >
                            {processingId === card.id ? "Saving..." : "Set to Like"}
                          </button>
                          <button
                            type="button"
                            className="admin-secondary-button"
                            onClick={() => void handleSetAction(card, "vibe")}
                            disabled={!!processingId}
                          >
                            Set to Vibe
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="admin-primary-button"
                        onClick={() => void handleReverse(card)}
                        disabled={!!processingId}
                      >
                        {processingId === card.id ? "Reversing..." : "Reverse Pair"}
                      </button>
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
