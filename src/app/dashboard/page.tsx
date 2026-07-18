"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAllowedAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase";
import Header from "@/components/Header";
import AdminPhotoUpload from "@/components/AdminPhotoUpload";
import AdminPhotoEditButton from "@/components/AdminPhotoEditButton";
import AdminPhotoDeleteButton from "@/components/AdminPhotoDeleteButton";
import AdminPhotoOrderControls from "@/components/AdminPhotoOrderControls";
import AdminPagination from "@/components/AdminPagination";
import { getSchoolPromptAnswer, updateSchoolPrompt, type ProfilePrompt } from "@/lib/profile-prompts";
import { syncSharedVerificationForProfile } from "@/lib/shared-verification";
import {
  ADMIN_ACCOUNT_PAGE_SIZE,
  UUID_PATTERN,
  sanitizeAdminSearch,
} from "@/lib/admin-account-pagination";

const SOLO_WORKSPACE_MODE_FILTER =
  "dating_mode.ilike.solo,dating_mode.ilike.single,dating_mode.ilike.one,dating_mode.ilike.individual,dating_mode.is.null";

type ProfileRow = {
  id: string;
  full_name: string | null;
  age: number | null;
  gender: string | null;
  interested_in: string | null;
  bio: string | null;
  height: string | null;
  occupation: string | null;
  education: string | null;
  lifestyle: string | null;
  dating_mode: string | null;
  vibe: string | null;
  intent: string | null;
  looking_for: string | null;
  city: string | null;
  interests: string[] | null;
  photos: string[] | null;
  prompts: ProfilePrompt[] | null;
  is_admin: boolean | null;
  is_banned: boolean | null;
  is_verified: boolean | null;
  created_at?: string | null;
  last_seen?: string | null;
};

type SoloMatchRow = {
  id: string;
  user1_id: string;
  user2_id: string;
};

type UserMatchWithProfile = {
  id: string;
  user1_id: string;
  user2_id: string;
  other_user_id: string;
  other_profile: ProfileRow | null;
};

type MessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  text: string;
  created_at: string;
};

type ConversationPreview = {
  text: string;
  created_at: string | null;
};

type StatCardProps = {
  label: string;
  value: string;
  note: string;
};

type AdminSectionKey = "overview" | "users" | "matches" | "chats";
type UserDetailTabKey = "profile" | "photos" | "edit" | "actions" | "matches" | "chats";
type UserModeFilter = "all" | "solo";

type EditFormState = {
  full_name: string;
  age: string;
  gender: string;
  interested_in: string;
  bio: string;
  height: string;
  occupation: string;
  education: string;
  school: string;
  lifestyle: string;
  dating_mode: string;
  vibe: string;
  intent: string;
  looking_for: string;
  city: string;
};

type PhotoViewerState = {
  src: string;
  alt: string;
  title: string;
  meta: string;
};

type DashboardCounts = {
  users: number;
  verified: number;
  banned: number;
  admins: number;
  solo: number;
  soloWorkspace: number;
  duoMembers: number;
  groupMembers: number;
};

const emptyDashboardCounts: DashboardCounts = {
  users: 0,
  verified: 0,
  banned: 0,
  admins: 0,
  solo: 0,
  soloWorkspace: 0,
  duoMembers: 0,
  groupMembers: 0,
};

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";

  const stringValue = String(value).trim();
  if (!stringValue) return "—";

  return stringValue
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleString();
}

function getInitialLetter(name?: string | null) {
  return (name || "U").trim().slice(0, 1).toUpperCase() || "U";
}

function getFirstValidPhoto(profile?: ProfileRow | null) {
  if (!profile?.photos || !Array.isArray(profile.photos)) return "";
  return profile.photos.find((photo) => typeof photo === "string" && photo.trim()) || "";
}

function getConversationPreviewText(text?: string | null) {
  const normalized = (text || "").trim();
  if (!normalized) return "No messages yet.";

  if (normalized.length <= 90) return normalized;
  return `${normalized.slice(0, 90).trim()}...`;
}

function normalizeDatingMode(value?: string | null): "solo" | "duo" | "group" | "unknown" {
  const normalized = (value || "").trim().toLowerCase();

  if (!normalized) return "unknown";

  if (
    normalized === "solo" ||
    normalized === "single" ||
    normalized === "one" ||
    normalized === "individual"
  ) {
    return "solo";
  }

  if (
    normalized === "duo" ||
    normalized === "pair" ||
    normalized === "couple" ||
    normalized === "double" ||
    normalized === "two"
  ) {
    return "duo";
  }

  if (
    normalized === "group" ||
    normalized === "trio" ||
    normalized === "squad" ||
    normalized === "team" ||
    normalized === "party"
  ) {
    return "group";
  }

  return "unknown";
}

function isSoloWorkspaceProfile(profile: ProfileRow) {
  const normalized = normalizeDatingMode(profile.dating_mode);
  return normalized === "solo" || normalized === "unknown";
}

function getModeBadgeText(profile: ProfileRow) {
  const normalized = normalizeDatingMode(profile.dating_mode);

  if (normalized === "solo") return "Solo";
  if (normalized === "duo") return "Duo";
  if (normalized === "group") return "Group";

  return formatValue(profile.dating_mode);
}

function StatCard({ label, value, note }: StatCardProps) {
  return (
    <article className="admin-stat-card">
      <div className="admin-stat-label">{label}</div>
      <div className="admin-stat-value">{value}</div>
      <div className="admin-stat-note">{note}</div>
    </article>
  );
}

function SectionButton({
  title,
  description,
  isActive,
  onClick,
}: {
  title: string;
  description: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`admin-sidebar-link ${isActive ? "admin-sidebar-link-active" : ""}`}
      onClick={onClick}
    >
      <span className="admin-sidebar-link-title">{title}</span>
      <span className="admin-sidebar-link-text">{description}</span>
    </button>
  );
}

function UserDetailTabButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`admin-tab-button ${isActive ? "admin-tab-button-active" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function UserModeFilterButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`admin-tab-button ${isActive ? "admin-tab-button-active" : ""}`}
    >
      {label}
    </button>
  );
}

function SafeAvatarImage({
  src,
  alt,
  className,
  fallbackText,
}: {
  src?: string;
  alt: string;
  className?: string;
  fallbackText: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return <span className="admin-user-avatar-fallback">{fallbackText}</span>;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  );
}

function SafePhotoImage({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fdeaf4",
          color: "#a44a6b",
          fontWeight: 800,
          fontSize: "14px",
          textAlign: "center",
          padding: "12px",
        }}
      >
        Photo not available
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  );
}

function getInitialEditForm(profile: ProfileRow | null): EditFormState {
  return {
    full_name: profile?.full_name ?? "",
    age: profile?.age ? String(profile.age) : "",
    gender: profile?.gender ?? "",
    interested_in: profile?.interested_in ?? "",
    bio: profile?.bio ?? "",
    height: profile?.height ?? "",
    occupation: profile?.occupation ?? "",
    education: profile?.education ?? "",
    school: getSchoolPromptAnswer(profile?.prompts),
    lifestyle: profile?.lifestyle ?? "",
    dating_mode: profile?.dating_mode ?? "",
    vibe: profile?.vibe ?? "",
    intent: profile?.intent ?? "",
    looking_for: profile?.looking_for ?? "",
    city: profile?.city ?? "",
  };
}

export default function DashboardPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [modeAccountCounts, setModeAccountCounts] = useState({ duo: 0, group: 0 });
  const [dashboardCounts, setDashboardCounts] = useState<DashboardCounts>(emptyDashboardCounts);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [profilesError, setProfilesError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [soloPage, setSoloPage] = useState(1);
  const [soloResultTotal, setSoloResultTotal] = useState(0);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [updatingUserId, setUpdatingUserId] = useState<string>("");
  const [userModeFilter, setUserModeFilter] = useState<UserModeFilter>("all");

  const [activeSection, setActiveSection] =
    useState<AdminSectionKey>("users");
  const [activeUserTab, setActiveUserTab] =
    useState<UserDetailTabKey>("profile");

  const [selectedUserMatches, setSelectedUserMatches] = useState<UserMatchWithProfile[]>([]);
  const [loadingSelectedUserMatches, setLoadingSelectedUserMatches] = useState(false);
  const [selectedUserMatchesError, setSelectedUserMatchesError] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<string>("");

  const [conversationMessages, setConversationMessages] = useState<MessageRow[]>([]);
  const [loadingConversationMessages, setLoadingConversationMessages] = useState(false);
  const [conversationMessagesError, setConversationMessagesError] = useState("");
  const [conversationPreviews, setConversationPreviews] = useState<Record<string, ConversationPreview>>({});

  const [editForm, setEditForm] = useState<EditFormState>(getInitialEditForm(null));
  const [savingEdit, setSavingEdit] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [editError, setEditError] = useState("");

  const [fullMatchProfileId, setFullMatchProfileId] = useState<string | null>(null);
  const [photoViewer, setPhotoViewer] = useState<PhotoViewerState | null>(null);

  useEffect(() => {
    let mounted = true;

    const verifyAccess = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const sessionEmail = session?.user?.email?.toLowerCase() ?? "";

        if (!sessionEmail || !isAllowedAdminEmail(sessionEmail)) {
          router.replace("/admin");
          return;
        }

        if (mounted) {
          setCheckingAccess(false);
        }
      } catch {
        router.replace("/admin");
      }
    };

    verifyAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionEmail = session?.user?.email?.toLowerCase() ?? "";

      if (!sessionEmail || !isAllowedAdminEmail(sessionEmail)) {
        router.replace("/admin");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!photoViewer) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPhotoViewer(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [photoViewer]);

  useEffect(() => {
    if (checkingAccess) return;

    const loadDashboardCounts = async () => {
      try {
        const results = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_verified", true),
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_banned", true),
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_admin", true),
          supabase.from("profiles").select("id", { count: "exact", head: true }).ilike("dating_mode", "solo"),
          supabase.from("profiles").select("id", { count: "exact", head: true }).or(SOLO_WORKSPACE_MODE_FILTER),
          supabase.from("profiles").select("id", { count: "exact", head: true }).ilike("dating_mode", "duo"),
          supabase.from("profiles").select("id", { count: "exact", head: true }).ilike("dating_mode", "group"),
          supabase.from("duos").select("id", { count: "exact", head: true }),
          supabase.from("groups").select("id", { count: "exact", head: true }),
        ]);
        const failedResult = results.find((result) => result.error);
        if (failedResult?.error) throw failedResult.error;

        setDashboardCounts({
          users: results[0].count || 0,
          verified: results[1].count || 0,
          banned: results[2].count || 0,
          admins: results[3].count || 0,
          solo: results[4].count || 0,
          soloWorkspace: results[5].count || 0,
          duoMembers: results[6].count || 0,
          groupMembers: results[7].count || 0,
        });
        setModeAccountCounts({ duo: results[8].count || 0, group: results[9].count || 0 });
      } catch (error) {
        setProfilesError(
          error instanceof Error ? error.message : "Could not load dashboard totals."
        );
      }
    };

    void loadDashboardCounts();
  }, [checkingAccess]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setSoloPage(1);
  }, [debouncedSearchTerm, userModeFilter]);

  useEffect(() => {
    if (checkingAccess) return;

    const loadProfilesPage = async () => {
      try {
        setLoadingProfiles(true);
        setProfilesError("");
        const from = (soloPage - 1) * ADMIN_ACCOUNT_PAGE_SIZE;
        let request = supabase
          .from("profiles")
          .select(
            "id, full_name, age, gender, interested_in, bio, height, occupation, education, lifestyle, dating_mode, vibe, intent, looking_for, city, interests, photos, prompts, is_admin, is_banned, is_verified, created_at, last_seen",
            { count: "exact" }
          );

        request = userModeFilter === "solo"
          ? request.ilike("dating_mode", "solo")
          : request.or(SOLO_WORKSPACE_MODE_FILTER);

        const query = sanitizeAdminSearch(debouncedSearchTerm);
        if (query) {
          const pattern = `%${query}%`;
          const searchFilters = [
            `full_name.ilike.${pattern}`,
            `bio.ilike.${pattern}`,
            `city.ilike.${pattern}`,
            `gender.ilike.${pattern}`,
            `interested_in.ilike.${pattern}`,
            `occupation.ilike.${pattern}`,
            `education.ilike.${pattern}`,
            `lifestyle.ilike.${pattern}`,
            `vibe.ilike.${pattern}`,
            `intent.ilike.${pattern}`,
            `looking_for.ilike.${pattern}`,
          ];
          if (UUID_PATTERN.test(query)) searchFilters.push(`id.eq.${query}`);
          request = request.or(searchFilters.join(","));
        }

        const { data, error, count } = await request
          .order("last_seen", { ascending: false, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, from + ADMIN_ACCOUNT_PAGE_SIZE - 1);
        if (error) throw error;

        const total = count || 0;
        const pageCount = Math.max(1, Math.ceil(total / ADMIN_ACCOUNT_PAGE_SIZE));
        setSoloResultTotal(total);
        if (soloPage > pageCount) {
          setSoloPage(pageCount);
          return;
        }

        const rows = (data || []) as ProfileRow[];
        setProfiles(rows);
        setSelectedProfileId((current) =>
          rows.some((profile) => profile.id === current) ? current : rows[0]?.id || ""
        );
      } catch (error) {
        setProfiles([]);
        setProfilesError(error instanceof Error ? error.message : "Could not load profiles.");
      } finally {
        setLoadingProfiles(false);
      }
    };

    void loadProfilesPage();
  }, [checkingAccess, debouncedSearchTerm, soloPage, userModeFilter]);

  const filteredProfiles = profiles;

  const selectedProfile =
    filteredProfiles.find((profile) => profile.id === selectedProfileId) ||
    profiles.find((profile) => profile.id === selectedProfileId && isSoloWorkspaceProfile(profile)) ||
    null;

  useEffect(() => {
    if (!selectedProfileId) return;

    const selectedExistsInsideCurrentFilter = filteredProfiles.some(
      (profile) => profile.id === selectedProfileId
    );

    if (!selectedExistsInsideCurrentFilter) {
      if (filteredProfiles.length > 0) {
        setSelectedProfileId(filteredProfiles[0].id);
      } else {
        setSelectedProfileId("");
      }
    }
  }, [filteredProfiles, selectedProfileId]);

  useEffect(() => {
    if (!selectedProfileId) {
      const fallbackSoloProfile = profiles.find(isSoloWorkspaceProfile);
      if (fallbackSoloProfile) {
        setSelectedProfileId(fallbackSoloProfile.id);
      }
    }
  }, [profiles, selectedProfileId]);

  useEffect(() => {
    setEditForm(getInitialEditForm(selectedProfile));
    setEditMessage("");
    setEditError("");
  }, [selectedProfileId, selectedProfile]);

  useEffect(() => {
    if (!selectedProfileId || !selectedProfile || !isSoloWorkspaceProfile(selectedProfile)) {
      setSelectedUserMatches([]);
      setSelectedConversationId("");
      setConversationMessages([]);
      setConversationPreviews({});
      return;
    }

    const loadSelectedUserMatches = async () => {
      try {
        setLoadingSelectedUserMatches(true);
        setSelectedUserMatchesError("");
        setSelectedConversationId("");
        setConversationMessages([]);
        setConversationPreviews({});

        const { data: matchesData, error: matchesError } = await supabase
          .from("matches")
          .select("id, user1_id, user2_id")
          .or(`user1_id.eq.${selectedProfileId},user2_id.eq.${selectedProfileId}`);

        if (matchesError) {
          setSelectedUserMatchesError(matchesError.message);
          setSelectedUserMatches([]);
          return;
        }

        const normalizedMatches = ((matchesData || []) as SoloMatchRow[]).map((match) => {
          const otherUserId =
            match.user1_id === selectedProfileId ? match.user2_id : match.user1_id;

          return {
            ...match,
            other_user_id: otherUserId,
          };
        });

        const otherUserIds = normalizedMatches.map((match) => match.other_user_id);

        let profilesMap = new Map<string, ProfileRow>();

        if (otherUserIds.length > 0) {
          const { data: profilesData, error: otherProfilesError } = await supabase
            .from("profiles")
            .select(
              "id, full_name, age, gender, interested_in, bio, height, occupation, education, lifestyle, dating_mode, vibe, intent, looking_for, city, interests, photos, prompts, is_admin, is_banned, is_verified, created_at, last_seen"
            )
            .in("id", otherUserIds);

          if (otherProfilesError) {
            setSelectedUserMatchesError(otherProfilesError.message);
          }

          profilesMap = new Map(
            ((profilesData || []) as ProfileRow[]).map((profile) => [profile.id, profile])
          );
        }

        const finalMatches: UserMatchWithProfile[] = normalizedMatches.map((match) => ({
          ...match,
          other_profile: profilesMap.get(match.other_user_id) || null,
        }));

        setSelectedUserMatches(finalMatches);

        if (finalMatches.length > 0) {
          setSelectedConversationId(finalMatches[0].id);
        }

        if (finalMatches.length > 0) {
          const matchIds = finalMatches.map((match) => match.id);

          const { data: allMessagesData, error: allMessagesError } = await supabase
            .from("messages")
            .select("id, match_id, sender_id, text, created_at")
            .in("match_id", matchIds)
            .order("created_at", { ascending: false });

          if (!allMessagesError) {
            const previewMap: Record<string, ConversationPreview> = {};

            ((allMessagesData || []) as MessageRow[]).forEach((message) => {
              if (!previewMap[message.match_id]) {
                previewMap[message.match_id] = {
                  text: message.text || "",
                  created_at: message.created_at || null,
                };
              }
            });

            setConversationPreviews(previewMap);
          }
        }
      } catch (error) {
        setSelectedUserMatchesError(
          error instanceof Error ? error.message : "Could not load user matches."
        );
      } finally {
        setLoadingSelectedUserMatches(false);
      }
    };

    loadSelectedUserMatches();
  }, [selectedProfileId, selectedProfile]);

  useEffect(() => {
    if (!selectedConversationId) {
      setConversationMessages([]);
      return;
    }

    const loadConversationMessages = async () => {
      try {
        setLoadingConversationMessages(true);
        setConversationMessagesError("");

        const { data, error } = await supabase
          .from("messages")
          .select("id, match_id, sender_id, text, created_at")
          .eq("match_id", selectedConversationId)
          .order("created_at", { ascending: true });

        if (error) {
          setConversationMessagesError(error.message);
          setConversationMessages([]);
          return;
        }

        setConversationMessages((data || []) as MessageRow[]);
      } catch (error) {
        setConversationMessagesError(
          error instanceof Error ? error.message : "Could not load messages."
        );
      } finally {
        setLoadingConversationMessages(false);
      }
    };

    loadConversationMessages();
  }, [selectedConversationId]);

  const totalUsers = dashboardCounts.users;
  const totalVerified = dashboardCounts.verified;
  const totalBanned = dashboardCounts.banned;
  const totalAdmins = dashboardCounts.admins;
  const totalSoloUsers = dashboardCounts.solo;
  const totalDuoMemberProfiles = dashboardCounts.duoMembers;
  const totalGroupMemberProfiles = dashboardCounts.groupMembers;
  const totalSoloWorkspaceUsers = dashboardCounts.soloWorkspace;

  const updateProfileFlag = async (
    profileId: string,
    field: "is_verified" | "is_banned",
    nextValue: boolean
  ) => {
    try {
      setUpdatingUserId(profileId);
      setProfilesError("");

      const { error } = await supabase
        .from("profiles")
        .update({ [field]: nextValue })
        .eq("id", profileId);

      if (error) {
        setProfilesError(error.message);
        return;
      }

      if (field === "is_verified") {
        await syncSharedVerificationForProfile(profileId);
      }

      setProfiles((current) =>
        current.map((profile) =>
          profile.id === profileId
            ? { ...profile, [field]: nextValue }
            : profile
        )
      );
    } catch (error) {
      setProfilesError(
        error instanceof Error ? error.message : "Could not update user."
      );
    } finally {
      setUpdatingUserId("");
    }
  };

  const handleEditInputChange = (field: keyof EditFormState, value: string) => {
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
    setEditMessage("");
    setEditError("");
  };

  const handleSaveProfileEdits = async () => {
    if (!selectedProfile) return;

    try {
      setSavingEdit(true);
      setEditMessage("");
      setEditError("");

      const trimmedAge = editForm.age.trim();
      let parsedAge: number | null = null;

      if (trimmedAge) {
        const numericAge = Number(trimmedAge);
        if (Number.isNaN(numericAge) || numericAge < 18 || numericAge > 100) {
          setEditError("Age must be between 18 and 100.");
          return;
        }
        parsedAge = numericAge;
      }

      const payload = {
        full_name: editForm.full_name.trim() || null,
        age: parsedAge,
        gender: editForm.gender.trim() || null,
        interested_in: editForm.interested_in.trim() || null,
        bio: editForm.bio.trim() || null,
        height: editForm.height.trim() || null,
        occupation: editForm.occupation.trim() || null,
        education: editForm.education.trim() || null,
        prompts: updateSchoolPrompt(selectedProfile.prompts, editForm.school),
        lifestyle: editForm.lifestyle.trim() || null,
        dating_mode: editForm.dating_mode.trim() || null,
        vibe: editForm.vibe.trim() || null,
        intent: editForm.intent.trim() || null,
        looking_for: editForm.looking_for.trim() || null,
        city: editForm.city.trim() || null,
      };

      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", selectedProfile.id);

      if (error) {
        setEditError(error.message);
        return;
      }

      setProfiles((current) =>
        current.map((profile) =>
          profile.id === selectedProfile.id
            ? {
                ...profile,
                ...payload,
              }
            : profile
        )
      );

      setEditMessage("Profile updated successfully.");
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "Could not save profile edits."
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const selectedConversation =
    selectedUserMatches.find((match) => match.id === selectedConversationId) || null;

  const renderOverviewSection = () => {
    return (
      <section className="admin-clean-dashboard">
        <section className="admin-stats-grid admin-home-stats">
          <StatCard
            label="Users"
            value={String(totalUsers)}
            note="Profiles currently visible in admin panel"
          />
          <StatCard
            label="Verified"
            value={String(totalVerified)}
            note="Profiles with verify tick enabled"
          />
          <StatCard
            label="Banned"
            value={String(totalBanned)}
            note="Profiles currently blocked"
          />
          <StatCard
            label="Admins"
            value={String(totalAdmins)}
            note="Profiles marked as admin in database"
          />
          <StatCard
            label="Solo"
            value={String(totalSoloUsers)}
            note="Profiles marked as solo mode"
          />
          <StatCard
            label="Duo"
            value={String(modeAccountCounts.duo)}
            note={`${totalDuoMemberProfiles} members paired into Duo accounts`}
          />
          <StatCard
            label="Group"
            value={String(modeAccountCounts.group)}
            note={`${totalGroupMemberProfiles} members across Group accounts`}
          />
        </section>

        <section className="admin-dashboard-content-grid">
          <article className="admin-panel-card admin-panel-card-large">
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title">Dating Modes</h2>
                <p className="admin-section-subtitle">
                  Each mode has its own match and chat logic. Solo never mixes with duo or group.
                </p>
              </div>
            </div>

            <div className="admin-mode-table">
              <button type="button" className="admin-mode-row" onClick={() => setActiveSection("users")}>
                <span>
                  <strong>Solo</strong>
                  <small>Profiles, solo matches, and solo chats</small>
                </span>
                <span>{totalSoloWorkspaceUsers} profiles</span>
              </button>
              <button type="button" className="admin-mode-row" onClick={() => router.push("/duo")}>
                <span>
                  <strong>Duo</strong>
                  <small>Shared Duo accounts, matches, and conversations</small>
                </span>
                <span>{modeAccountCounts.duo} accounts</span>
              </button>
              <button type="button" className="admin-mode-row" onClick={() => router.push("/group")}>
                <span>
                  <strong>Group</strong>
                  <small>Shared Group accounts, matches, and conversations</small>
                </span>
                <span>{modeAccountCounts.group} accounts</span>
              </button>
            </div>
          </article>

          <article className="admin-panel-card">
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title">Revenue</h2>
                <p className="admin-section-subtitle">Premium products and wallets.</p>
              </div>
            </div>
            <div className="admin-action-list">
              <button type="button" onClick={() => router.push("/plans")}>Plan Builder</button>
            </div>
          </article>

          <article className="admin-panel-card">
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title">Operations</h2>
                <p className="admin-section-subtitle">Content, safety, and growth.</p>
              </div>
            </div>
            <div className="admin-action-list">
              <button type="button" onClick={() => router.push("/interests")}>Interests & Prompts</button>
              <button type="button" onClick={() => router.push("/user-actions")}>User Actions</button>
              <button type="button" onClick={() => router.push("/accounts")}>Accounts</button>
              <button type="button" onClick={() => router.push("/exit-feedback")}>Exit Feedback</button>
              <button type="button" onClick={() => router.push("/notifications-admin")}>Notifications</button>
              <button type="button" onClick={() => router.push("/settings")}>Settings</button>
            </div>
          </article>
        </section>
      </section>
    );
  };

  const renderUserProfileTab = () => {
    if (!selectedProfile) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No solo user selected</h3>
          <p className="admin-section-subtitle">
            Pick a solo user from the left side to view profile details.
          </p>
        </div>
      );
    }

    return (
      <div className="admin-user-detail-grid">
        <article className="admin-mini-card">
          <div className="admin-user-title-row">
            <div>
              <h3 className="admin-section-title">
                {selectedProfile.full_name || "Unnamed User"}
              </h3>
              <p className="admin-section-subtitle">
                Profile ID: {selectedProfile.id}
              </p>
            </div>

            <div className="admin-badge-group">
              <span className="admin-status-chip admin-status-active">
                {getModeBadgeText(selectedProfile)}
              </span>
              {selectedProfile.is_admin ? (
                <span className="admin-status-chip admin-status-admin">Admin</span>
              ) : null}
              {selectedProfile.is_verified ? (
                <span className="admin-status-chip admin-status-verified">
                  Verified
                </span>
              ) : null}
              {selectedProfile.is_banned ? (
                <span className="admin-status-chip admin-status-banned">Banned</span>
              ) : (
                <span className="admin-status-chip admin-status-active">Active</span>
              )}
            </div>
          </div>

          <div className="admin-kv-grid">
            <div className="admin-kv-item">
              <span className="admin-kv-label">Age</span>
              <span className="admin-kv-value">{formatValue(selectedProfile.age)}</span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Gender</span>
              <span className="admin-kv-value">{formatValue(selectedProfile.gender)}</span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Interested In</span>
              <span className="admin-kv-value">
                {formatValue(selectedProfile.interested_in)}
              </span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Dating Mode</span>
              <span className="admin-kv-value">
                {formatValue(selectedProfile.dating_mode)}
              </span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">City</span>
              <span className="admin-kv-value">{formatValue(selectedProfile.city)}</span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Height</span>
              <span className="admin-kv-value">{formatValue(selectedProfile.height)}</span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Occupation</span>
              <span className="admin-kv-value">
                {formatValue(selectedProfile.occupation)}
              </span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Education</span>
              <span className="admin-kv-value">
                {formatValue(selectedProfile.education)}
              </span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Lifestyle</span>
              <span className="admin-kv-value">
                {formatValue(selectedProfile.lifestyle)}
              </span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Vibe</span>
              <span className="admin-kv-value">{formatValue(selectedProfile.vibe)}</span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Intent</span>
              <span className="admin-kv-value">{formatValue(selectedProfile.intent)}</span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Looking For</span>
              <span className="admin-kv-value">
                {formatValue(selectedProfile.looking_for)}
              </span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Created</span>
              <span className="admin-kv-value">
                {formatDate(selectedProfile.created_at)}
              </span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Last Seen</span>
              <span className="admin-kv-value">
                {formatDate(selectedProfile.last_seen)}
              </span>
            </div>
          </div>
        </article>

        <article className="admin-mini-card">
          <h3 className="admin-section-title">Bio</h3>
          <div className="admin-info-box">
            <p className="admin-info-text">
              {selectedProfile.bio?.trim() || "No bio added yet."}
            </p>
          </div>

          <h3 className="admin-section-title admin-subsection-spacing">Interests</h3>
          {(selectedProfile.interests || []).length > 0 ? (
            <div className="admin-tag-wrap">
              {(selectedProfile.interests || []).map((interest, index) => (
                <span key={`${interest}-${index}`} className="admin-tag">
                  {formatValue(interest)}
                </span>
              ))}
            </div>
          ) : (
            <p className="admin-section-subtitle">No interests saved.</p>
          )}
        </article>
      </div>
    );
  };

  const renderUserPhotosTab = () => {
    if (!selectedProfile) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No solo user selected</h3>
          <p className="admin-section-subtitle">
            Pick a solo user first to see their photos.
          </p>
        </div>
      );
    }

    return (
      <section className="admin-mini-card">
        <div className="admin-section-header">
          <div>
            <h3 className="admin-section-title">Photos</h3>
            <p className="admin-section-subtitle">
              Full photo gallery for {selectedProfile.full_name || "this user"}.
            </p>
          </div>
          <AdminPhotoUpload
            profileId={selectedProfile.id}
            currentPhotoCount={(selectedProfile.photos || []).length}
            onUploaded={(photos) =>
              setProfiles((current) =>
                current.map((profile) =>
                  profile.id === selectedProfile.id ? { ...profile, photos } : profile
                )
              )
            }
          />
        </div>

        {(selectedProfile.photos || []).length > 0 ? (
          <div className="admin-photo-grid-large">
            {(selectedProfile.photos || []).map((photo, index) => (
              <div className="admin-photo-item" key={`${photo}-${index}`}>
                <button
                  type="button"
                  className="admin-photo-card-large admin-photo-card-button"
                  onClick={() =>
                    setPhotoViewer({
                      src: photo,
                      alt: `${selectedProfile.full_name || "User"} photo ${index + 1}`,
                      title: selectedProfile.full_name || "User photo",
                      meta: `Photo ${index + 1} of ${(selectedProfile.photos || []).length}`,
                    })
                  }
                >
                  <SafePhotoImage
                    src={photo}
                    alt={`User photo ${index + 1}`}
                    className="admin-photo-image-large"
                  />
                </button>
                <AdminPhotoEditButton
                  profileId={selectedProfile.id}
                  photoUrl={photo}
                  onUpdated={(photos) =>
                    setProfiles((current) =>
                      current.map((profile) =>
                        profile.id === selectedProfile.id ? { ...profile, photos } : profile
                      )
                    )
                  }
                />
                <AdminPhotoDeleteButton
                  profileId={selectedProfile.id}
                  photoUrl={photo}
                  onDeleted={(photos) =>
                    setProfiles((current) =>
                      current.map((profile) =>
                        profile.id === selectedProfile.id ? { ...profile, photos } : profile
                      )
                    )
                  }
                />
                <AdminPhotoOrderControls
                  profileId={selectedProfile.id}
                  photos={selectedProfile.photos || []}
                  photoIndex={index}
                  onReordered={(photos) =>
                    setProfiles((current) =>
                      current.map((profile) =>
                        profile.id === selectedProfile.id ? { ...profile, photos } : profile
                      )
                    )
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-empty-card">
            <h3 className="admin-section-title">No photos uploaded</h3>
            <p className="admin-section-subtitle">
              This user has not uploaded any profile photos yet.
            </p>
          </div>
        )}
      </section>
    );
  };

  const renderUserEditTab = () => {
    if (!selectedProfile) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No solo user selected</h3>
          <p className="admin-section-subtitle">
            Pick a solo user first to edit their profile.
          </p>
        </div>
      );
    }

    return (
      <section className="admin-mini-card">
        <div className="admin-section-header">
          <div>
            <h3 className="admin-section-title">Edit profile</h3>
            <p className="admin-section-subtitle">
              Update basic solo user profile details from admin.
            </p>
          </div>
        </div>

        <div className="admin-form-grid">
          <div className="admin-field">
            <label className="admin-label">Full name</label>
            <input
              className="admin-input"
              value={editForm.full_name}
              onChange={(e) => handleEditInputChange("full_name", e.target.value)}
            />
          </div>

          <div className="admin-field">
            <label className="admin-label">Age</label>
            <input
              className="admin-input"
              value={editForm.age}
              onChange={(e) => handleEditInputChange("age", e.target.value)}
            />
          </div>

          <div className="admin-field">
            <label className="admin-label">Gender</label>
            <input
              className="admin-input"
              value={editForm.gender}
              onChange={(e) => handleEditInputChange("gender", e.target.value)}
            />
          </div>

          <div className="admin-field">
            <label className="admin-label">Interested in</label>
            <input
              className="admin-input"
              value={editForm.interested_in}
              onChange={(e) => handleEditInputChange("interested_in", e.target.value)}
            />
          </div>

          <div className="admin-field">
            <label className="admin-label">Height</label>
            <input
              className="admin-input"
              value={editForm.height}
              onChange={(e) => handleEditInputChange("height", e.target.value)}
            />
          </div>

          <div className="admin-field">
            <label className="admin-label">Occupation</label>
            <input
              className="admin-input"
              value={editForm.occupation}
              onChange={(e) => handleEditInputChange("occupation", e.target.value)}
            />
          </div>

          <div className="admin-field">
            <label className="admin-label">Education</label>
            <input
              className="admin-input"
              value={editForm.education}
              onChange={(e) => handleEditInputChange("education", e.target.value)}
            />
          </div>

          <div className="admin-field">
            <label className="admin-label">School / University</label>
            <input
              className="admin-input"
              value={editForm.school}
              onChange={(e) => handleEditInputChange("school", e.target.value)}
            />
          </div>

          <div className="admin-field">
            <label className="admin-label">Lifestyle</label>
            <input
              className="admin-input"
              value={editForm.lifestyle}
              onChange={(e) => handleEditInputChange("lifestyle", e.target.value)}
            />
          </div>

          <div className="admin-field">
            <label className="admin-label">Dating mode</label>
            <input
              className="admin-input"
              value={editForm.dating_mode}
              onChange={(e) => handleEditInputChange("dating_mode", e.target.value)}
            />
          </div>

          <div className="admin-field">
            <label className="admin-label">Vibe</label>
            <input
              className="admin-input"
              value={editForm.vibe}
              onChange={(e) => handleEditInputChange("vibe", e.target.value)}
            />
          </div>

          <div className="admin-field">
            <label className="admin-label">Intent</label>
            <input
              className="admin-input"
              value={editForm.intent}
              onChange={(e) => handleEditInputChange("intent", e.target.value)}
            />
          </div>

          <div className="admin-field">
            <label className="admin-label">Looking for</label>
            <input
              className="admin-input"
              value={editForm.looking_for}
              onChange={(e) => handleEditInputChange("looking_for", e.target.value)}
            />
          </div>

          <div className="admin-field admin-field-full">
            <label className="admin-label">City</label>
            <input
              className="admin-input"
              value={editForm.city}
              onChange={(e) => handleEditInputChange("city", e.target.value)}
            />
          </div>

          <div className="admin-field admin-field-full">
            <label className="admin-label">Bio</label>
            <textarea
              className="admin-textarea"
              value={editForm.bio}
              onChange={(e) => handleEditInputChange("bio", e.target.value)}
            />
          </div>
        </div>

        {editError ? <div className="admin-error-box">{editError}</div> : null}
        {editMessage ? <div className="admin-success-box">{editMessage}</div> : null}

        <div className="admin-form-actions">
          <button
            type="button"
            className="admin-primary-button admin-button-fit"
            onClick={handleSaveProfileEdits}
            disabled={savingEdit}
          >
            {savingEdit ? "Saving..." : "Save Profile Changes"}
          </button>
        </div>
      </section>
    );
  };

  const renderUserActionsTab = () => {
    if (!selectedProfile) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No solo user selected</h3>
          <p className="admin-section-subtitle">
            Pick a solo user first to manage their account flags.
          </p>
        </div>
      );
    }

    return (
      <section className="admin-actions-grid">
        <article className="admin-mini-card">
          <h3 className="admin-section-title">Admin actions</h3>
          <p className="admin-section-subtitle">
            Manage verify tick and ban status for this profile.
          </p>

          <div className="admin-action-stack">
            <button
              type="button"
              className="admin-primary-button"
              disabled={updatingUserId === selectedProfile.id}
              onClick={() =>
                updateProfileFlag(
                  selectedProfile.id,
                  "is_verified",
                  !selectedProfile.is_verified
                )
              }
            >
              {updatingUserId === selectedProfile.id
                ? "Updating..."
                : selectedProfile.is_verified
                ? "Remove Verify Tick"
                : "Give Verify Tick"}
            </button>

            <button
              type="button"
              className="admin-secondary-button"
              disabled={updatingUserId === selectedProfile.id}
              onClick={() =>
                updateProfileFlag(
                  selectedProfile.id,
                  "is_banned",
                  !selectedProfile.is_banned
                )
              }
            >
              {updatingUserId === selectedProfile.id
                ? "Updating..."
                : selectedProfile.is_banned
                ? "Unban User"
                : "Ban User"}
            </button>

            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => router.push("/accounts")}
            >
              Open Account Delete Tools
            </button>
          </div>

        </article>

        <article className="admin-mini-card">
          <h3 className="admin-section-title">Status summary</h3>
          <div className="admin-kv-grid">
            <div className="admin-kv-item">
              <span className="admin-kv-label">Admin</span>
              <span className="admin-kv-value">
                {selectedProfile.is_admin ? "Yes" : "No"}
              </span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Verified</span>
              <span className="admin-kv-value">
                {selectedProfile.is_verified ? "Yes" : "No"}
              </span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Banned</span>
              <span className="admin-kv-value">
                {selectedProfile.is_banned ? "Yes" : "No"}
              </span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Mode</span>
              <span className="admin-kv-value">
                {formatValue(selectedProfile.dating_mode)}
              </span>
            </div>
          </div>
        </article>
      </section>
    );
  };

  const renderUserMatchesTab = () => {
    if (!selectedProfile) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No solo user selected</h3>
          <p className="admin-section-subtitle">
            Pick a solo user first to view their matches.
          </p>
        </div>
      );
    }

    if (fullMatchProfileId) {
      const fullProfile = selectedUserMatches.find((m) => m.other_user_id === fullMatchProfileId)?.other_profile;

      return (
        <div className="admin-mini-card">
          <button
            onClick={() => setFullMatchProfileId(null)}
            className="admin-secondary-button"
            style={{ marginBottom: "15px" }}
          >
            ← Back to Matches
          </button>
          {fullProfile ? (
            <div className="admin-user-detail-grid">
              <article>
                <h3 className="admin-section-title">
                  {fullProfile.full_name}, {fullProfile.age}
                </h3>
                <div className="admin-kv-grid" style={{ marginTop: "15px" }}>
                  <div className="admin-kv-item">
                    <span className="admin-kv-label">City</span>
                    <span className="admin-kv-value">{fullProfile.city}</span>
                  </div>
                  <div className="admin-kv-item">
                    <span className="admin-kv-label">Gender</span>
                    <span className="admin-kv-value">{fullProfile.gender}</span>
                  </div>
                  <div className="admin-kv-item">
                    <span className="admin-kv-label">Bio</span>
                    <span className="admin-kv-value">{fullProfile.bio}</span>
                  </div>
                </div>
              </article>
              <article>
                <h3 className="admin-section-title">Photos</h3>
                <div className="admin-photo-grid-large" style={{ marginTop: "15px" }}>
                  {fullProfile.photos?.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      className="admin-photo-card-large admin-photo-card-button"
                      onClick={() =>
                        setPhotoViewer({
                          src: p,
                          alt: `${fullProfile.full_name || "Match"} photo ${i + 1}`,
                          title: fullProfile.full_name || "Match photo",
                          meta: `Photo ${i + 1} of ${fullProfile.photos?.length || 0}`,
                        })
                      }
                    >
                      <SafePhotoImage
                        src={p}
                        alt={`Match photo ${i + 1}`}
                        className="admin-photo-image-large"
                      />
                    </button>
                  ))}
                </div>
              </article>
            </div>
          ) : (
            <p>Profile details not found.</p>
          )}
        </div>
      );
    }

    return (
      <section className="admin-mini-card">
        <div className="admin-section-header">
          <div>
            <h3 className="admin-section-title">Solo matches</h3>
            <p className="admin-section-subtitle">
              Match list for {selectedProfile.full_name || "this user"}.
            </p>
          </div>
        </div>

        {selectedUserMatchesError ? (
          <div className="admin-error-box">{selectedUserMatchesError}</div>
        ) : null}

        {loadingSelectedUserMatches ? (
          <div className="admin-empty-card">
            <h3 className="admin-section-title">Loading matches...</h3>
            <p className="admin-section-subtitle">
              Please wait while match data is loading.
            </p>
          </div>
        ) : selectedUserMatches.length === 0 ? (
          <div className="admin-empty-card">
            <h3 className="admin-section-title">No matches yet</h3>
            <p className="admin-section-subtitle">
              This user currently has no solo matches.
            </p>
          </div>
        ) : (
          <div
            className="admin-match-list-compact"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}
          >
            {selectedUserMatches.map((match) => {
              const otherProfile = match.other_profile;
              const photo = getFirstValidPhoto(otherProfile);

              return (
                <div
                  key={match.id}
                  className="admin-user-card"
                  style={{ padding: "10px" }}
                  onClick={() => setFullMatchProfileId(match.other_user_id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "10px",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={photo}
                        alt={otherProfile?.full_name || "User"}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontWeight: "bold",
                          fontSize: "14px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {otherProfile?.full_name || "User"}
                      </p>
                      <p style={{ fontSize: "11px", color: "#666" }}>
                        {otherProfile?.age} • {otherProfile?.city}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  const renderUserChatsTab = () => {
    if (!selectedProfile) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No solo user selected</h3>
          <p className="admin-section-subtitle">
            Pick a solo user first to view their chats.
          </p>
        </div>
      );
    }

    return (
      <section className="admin-chat-layout">
        <aside className="admin-mini-card admin-chat-conversation-list">
          <div className="admin-section-header">
            <div>
              <h3 className="admin-section-title">Conversations</h3>
              <p className="admin-section-subtitle">
                Solo chat threads for this user.
              </p>
            </div>
          </div>

          {selectedUserMatchesError ? (
            <div className="admin-error-box">{selectedUserMatchesError}</div>
          ) : null}

          {loadingSelectedUserMatches ? (
            <p className="admin-section-subtitle">Loading conversations...</p>
          ) : selectedUserMatches.length === 0 ? (
            <p className="admin-section-subtitle">No conversations found.</p>
          ) : (
            <div className="admin-user-list">
              {selectedUserMatches.map((match) => {
                const otherProfile = match.other_profile;
                const photo = getFirstValidPhoto(otherProfile);
                const isActive = selectedConversationId === match.id;
                const preview = conversationPreviews[match.id];

                return (
                  <button
                    key={match.id}
                    type="button"
                    className={`admin-user-card ${
                      isActive ? "admin-user-card-active" : ""
                    }`}
                    onClick={() => setSelectedConversationId(match.id)}
                  >
                    <div className="admin-user-card-top">
                      <div className="admin-user-avatar">
                        <SafeAvatarImage
                          src={photo}
                          alt={otherProfile?.full_name || "User"}
                          className="admin-user-avatar-image"
                          fallbackText={getInitialLetter(otherProfile?.full_name)}
                        />
                      </div>

                      <div className="admin-user-card-main">
                        <div className="admin-user-card-title-row">
                          <h3 className="admin-user-card-name">
                            {otherProfile?.full_name || "Unknown User"}
                          </h3>
                          {otherProfile?.is_verified ? (
                            <span className="admin-user-verified-dot">✓</span>
                          ) : null}
                        </div>

                        <p className="admin-user-card-subline">
                          {getConversationPreviewText(preview?.text)}
                        </p>

                        <p className="admin-user-card-subline">
                          {preview?.created_at
                            ? formatDate(preview.created_at)
                            : `Match ID: ${match.id}`}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="admin-mini-card admin-chat-thread-card">
          <div className="admin-section-header">
            <div>
              <h3 className="admin-section-title">Messages</h3>
              <p className="admin-section-subtitle">
                Read-only solo chat history.
              </p>
            </div>
          </div>

          {conversationMessagesError ? (
            <div className="admin-error-box">{conversationMessagesError}</div>
          ) : null}

          {!selectedConversation ? (
            <div className="admin-empty-card">
              <h3 className="admin-section-title">No conversation selected</h3>
              <p className="admin-section-subtitle">
                Choose a conversation from the left side.
              </p>
            </div>
          ) : loadingConversationMessages ? (
            <div className="admin-empty-card">
              <h3 className="admin-section-title">Loading messages...</h3>
              <p className="admin-section-subtitle">
                Please wait while chat history is loading.
              </p>
            </div>
          ) : conversationMessages.length === 0 ? (
            <div className="admin-empty-card">
              <h3 className="admin-section-title">No messages yet</h3>
              <p className="admin-section-subtitle">
                This match exists, but no messages have been sent yet.
              </p>
            </div>
          ) : (
            <div className="admin-chat-message-list">
              {conversationMessages.map((message) => {
                const isSelectedUser = message.sender_id === selectedProfile.id;
                const senderName = isSelectedUser
                  ? selectedProfile.full_name || "Selected User"
                  : selectedConversation.other_profile?.full_name || "Matched User";

                return (
                  <div
                    key={message.id}
                    className={`admin-chat-message ${
                      isSelectedUser
                        ? "admin-chat-message-out"
                        : "admin-chat-message-in"
                    }`}
                  >
                    <div className="admin-chat-message-header">
                      <span className="admin-chat-message-sender">{senderName}</span>
                      <span className="admin-chat-message-time">
                        {formatDate(message.created_at)}
                      </span>
                    </div>
                    <p className="admin-chat-message-text">{message.text}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </section>
    );
  };

  const renderUsersSection = () => {
    return (
      <section className="admin-workspace-grid">
        <aside className="admin-sidebar-card admin-users-panel">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Users</h2>
              <p className="admin-section-subtitle">
                Solo user workspace only. Duo and Group are managed from their own sidebar pages.
              </p>
            </div>
          </div>

          <div className="admin-search-wrap">
            <input
              type="text"
              className="admin-input"
              placeholder="Search solo user by name, city, bio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="admin-tabs-row" style={{ marginBottom: "12px", flexWrap: "wrap" }}>
            <UserModeFilterButton
              label={`All Solo Workspace (${totalSoloWorkspaceUsers})`}
              isActive={userModeFilter === "all"}
              onClick={() => setUserModeFilter("all")}
            />
            <UserModeFilterButton
              label={`Solo (${totalSoloUsers})`}
              isActive={userModeFilter === "solo"}
              onClick={() => setUserModeFilter("solo")}
            />
            {debouncedSearchTerm.trim() ? (
              <span className="admin-list-count-filtered">Search results ({soloResultTotal})</span>
            ) : null}
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "#8a6b79",
              marginBottom: "12px",
              lineHeight: 1.5,
            }}
          >
            Duo and Group profiles are intentionally removed from this section so they do not open with wrong solo logic.
          </div>

          <div className="admin-user-list">
            {loadingProfiles ? (
              <div className="admin-mini-card">
                <h3 className="admin-section-title">Loading users...</h3>
                <p className="admin-section-subtitle">
                  Please wait while profiles are being loaded.
                </p>
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="admin-mini-card">
                <h3 className="admin-section-title">No solo users found</h3>
                <p className="admin-section-subtitle">
                  Try another search term or open Duo / Group from the sidebar.
                </p>
              </div>
            ) : (
              filteredProfiles.map((profile) => {
                const isSelected = profile.id === selectedProfileId;
                const previewPhoto = getFirstValidPhoto(profile);

                return (
                  <button
                    key={profile.id}
                    type="button"
                    className={`admin-user-card ${
                      isSelected ? "admin-user-card-active" : ""
                    }`}
                    onClick={() => setSelectedProfileId(profile.id)}
                  >
                    <div className="admin-user-card-top">
                      <div className="admin-user-avatar">
                        <SafeAvatarImage
                          src={previewPhoto}
                          alt={profile.full_name || "User"}
                          className="admin-user-avatar-image"
                          fallbackText={getInitialLetter(profile.full_name)}
                        />
                      </div>

                      <div className="admin-user-card-main">
                        <div className="admin-user-card-title-row">
                          <h3 className="admin-user-card-name">
                            {profile.full_name || "Unnamed User"}
                          </h3>
                          {profile.is_verified ? (
                            <span className="admin-user-verified-dot">✓</span>
                          ) : null}
                        </div>

                        <p className="admin-user-card-subline">
                          {getModeBadgeText(profile)} • {formatValue(profile.city)}
                        </p>

                        <p className="admin-user-card-subline">
                          {profile.is_admin ? "Admin" : "User"} •{" "}
                          {profile.is_banned ? "Banned" : "Active"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <AdminPagination
            page={soloPage}
            pageSize={ADMIN_ACCOUNT_PAGE_SIZE}
            total={soloResultTotal}
            loading={loadingProfiles}
            onPageChange={setSoloPage}
          />
        </aside>

        <section className="admin-main-card admin-detail-panel">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Selected user</h2>
              <p className="admin-section-subtitle">
                Full solo user workspace with profile, photos, edit, actions, matches, and chats.
              </p>
            </div>
          </div>

          <div className="admin-tabs-row">
            <UserDetailTabButton
              label="Profile"
              isActive={activeUserTab === "profile"}
              onClick={() => setActiveUserTab("profile")}
            />
            <UserDetailTabButton
              label="Photos"
              isActive={activeUserTab === "photos"}
              onClick={() => setActiveUserTab("photos")}
            />
            <UserDetailTabButton
              label="Edit"
              isActive={activeUserTab === "edit"}
              onClick={() => setActiveUserTab("edit")}
            />
            <UserDetailTabButton
              label="Actions"
              isActive={activeUserTab === "actions"}
              onClick={() => setActiveUserTab("actions")}
            />
            <UserDetailTabButton
              label="Matches"
              isActive={activeUserTab === "matches"}
              onClick={() => setActiveUserTab("matches")}
            />
            <UserDetailTabButton
              label="Chats"
              isActive={activeUserTab === "chats"}
              onClick={() => setActiveUserTab("chats")}
            />
          </div>

          <div className="admin-tab-content">
            {activeUserTab === "profile" ? renderUserProfileTab() : null}
            {activeUserTab === "photos" ? renderUserPhotosTab() : null}
            {activeUserTab === "edit" ? renderUserEditTab() : null}
            {activeUserTab === "actions" ? renderUserActionsTab() : null}
            {activeUserTab === "matches" ? renderUserMatchesTab() : null}
            {activeUserTab === "chats" ? renderUserChatsTab() : null}
          </div>
        </section>
      </section>
    );
  };

  const renderPlatformMatchesSection = () => {
    return (
      <section className="admin-main-card">
        <div className="admin-section-header">
          <div>
            <h2 className="admin-section-title">Matches by mode</h2>
            <p className="admin-section-subtitle">
              Matches are separated by table and page so solo, duo, and group logic never mix.
            </p>
          </div>
        </div>

        <div className="admin-mode-table">
          <button
            type="button"
            className="admin-mode-row"
            onClick={() => {
              setActiveSection("users");
              setActiveUserTab("matches");
            }}
          >
            <span>
              <strong>Solo matches</strong>
              <small>Uses the `matches` table and selected solo user workspace.</small>
            </span>
            <span>Open solo</span>
          </button>
          <button type="button" className="admin-mode-row" onClick={() => router.push("/duo")}>
            <span>
              <strong>Duo matches</strong>
              <small>Uses `duo_matches` and `duo_messages` on the Duo page.</small>
            </span>
            <span>Open duo</span>
          </button>
          <button type="button" className="admin-mode-row" onClick={() => router.push("/group")}>
            <span>
              <strong>Group matches</strong>
              <small>Uses `group_matches` and `group_messages` on the Group page.</small>
            </span>
            <span>Open group</span>
          </button>
        </div>
      </section>
    );
  };

  const renderPlatformChatsSection = () => {
    return (
      <section className="admin-main-card">
        <div className="admin-section-header">
          <div>
            <h2 className="admin-section-title">Chats by mode</h2>
            <p className="admin-section-subtitle">
              Chat review is also separated by mode and message table.
            </p>
          </div>
        </div>

        <div className="admin-mode-table">
          <button
            type="button"
            className="admin-mode-row"
            onClick={() => {
              setActiveSection("users");
              setActiveUserTab("chats");
            }}
          >
            <span>
              <strong>Solo chats</strong>
              <small>Uses the `messages` table for selected solo matches.</small>
            </span>
            <span>Open solo</span>
          </button>
          <button type="button" className="admin-mode-row" onClick={() => router.push("/duo")}>
            <span>
              <strong>Duo chats</strong>
              <small>Uses `duo_messages` inside the Duo page Chats tab.</small>
            </span>
            <span>Open duo</span>
          </button>
          <button type="button" className="admin-mode-row" onClick={() => router.push("/group")}>
            <span>
              <strong>Group chats</strong>
              <small>Uses `group_messages` inside the Group page Chats tab.</small>
            </span>
            <span>Open group</span>
          </button>
        </div>
      </section>
    );
  };

  if (checkingAccess) {
    return (
      <main className="admin-dashboard-page">
        <div className="admin-dashboard-shell">
          <div className="admin-main-card">
            <h1 className="admin-section-title">Checking admin access...</h1>
            <p className="admin-section-subtitle">
              Please wait while the dashboard session is verified.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-dashboard-page">
      <div className="admin-dashboard-shell">
        <Header />

        {profilesError ? (
          <div className="admin-error-box admin-global-error">
            {profilesError}
          </div>
        ) : null}

        <section className="admin-dashboard-workspace">
          <div className="admin-dashboard-tabs">
            <SectionButton
              title="Overview"
              description="Full admin home"
              isActive={activeSection === "overview"}
              onClick={() => setActiveSection("overview")}
            />
            <SectionButton
              title="Users"
              description="Solo profile workspace"
              isActive={activeSection === "users"}
              onClick={() => setActiveSection("users")}
            />
            <SectionButton
              title="Matches"
              description="Mode-safe match review"
              isActive={activeSection === "matches"}
              onClick={() => setActiveSection("matches")}
            />
            <SectionButton
              title="Chats"
              description="Conversation review"
              isActive={activeSection === "chats"}
              onClick={() => setActiveSection("chats")}
            />
          </div>

          <section className="admin-layout-main">
            {activeSection === "overview" ? renderOverviewSection() : null}
            {activeSection === "users" ? renderUsersSection() : null}
            {activeSection === "matches" ? renderPlatformMatchesSection() : null}
            {activeSection === "chats" ? renderPlatformChatsSection() : null}
          </section>
        </section>
      </div>

      {photoViewer ? (
        <div
          className="admin-photo-viewer"
          role="dialog"
          aria-modal="true"
          aria-label="Full photo viewer"
          onClick={() => setPhotoViewer(null)}
        >
          <div className="admin-photo-viewer-panel" onClick={(event) => event.stopPropagation()}>
            <div className="admin-photo-viewer-header">
              <div>
                <h2 className="admin-photo-viewer-title">{photoViewer.title}</h2>
                <p className="admin-photo-viewer-meta">{photoViewer.meta}</p>
              </div>
              <button
                type="button"
                className="admin-photo-viewer-close"
                onClick={() => setPhotoViewer(null)}
                aria-label="Close full photo"
              >
                X
              </button>
            </div>
            <img
              src={photoViewer.src}
              alt={photoViewer.alt}
              className="admin-photo-viewer-image"
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
