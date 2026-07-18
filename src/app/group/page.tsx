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
  ADMIN_SEARCH_ID_BATCH_SIZE,
  UUID_PATTERN,
  findMatchingProfileIds,
  sanitizeAdminSearch,
} from "@/lib/admin-account-pagination";

type ProfileLite = {
  id: string;
  full_name: string | null;
  age: number | null;
  photos: string[] | null;
  prompts?: ProfilePrompt[] | null;
  city?: string | null;
  gender?: string | null;
  interested_in?: string | null;
  bio?: string | null;
  height?: string | null;
  occupation?: string | null;
  education?: string | null;
  lifestyle?: string | null;
  dating_mode?: string | null;
  vibe?: string | null;
  intent?: string | null;
  looking_for?: string | null;
  interests?: string[] | null;
  is_admin?: boolean | null;
  is_banned?: boolean | null;
  is_verified?: boolean | null;
  created_at?: string | null;
  last_seen?: string | null;
};

type GroupMember = {
  user_id: string;
  user?: ProfileLite | null;
};

type GroupRow = {
  id: string;
  created_at: string;
  members: GroupMember[];
};

type GroupBaseRow = {
  id: string;
  created_at: string;
};

type GroupMemberRecord = {
  group_id: string;
  user_id: string;
};

type GroupMatchRow = {
  id: string;
  group1_id: string;
  group2_id: string;
};

type GroupMatchWithDetails = GroupMatchRow & {
  other_group_id: string;
  other_group: GroupRow | null;
};

type GroupMessageRow = {
  id: string;
  group_match_id?: string;
  private_thread_id?: string;
  sender_id: string | null;
  text: string;
  created_at: string;
};

type ConversationPreview = {
  text: string;
  created_at: string | null;
};

type PrivateThreadWithDetails = {
  id: string;
  participant_low_id: string;
  participant_high_id: string;
  source_mode: string | null;
  source_match_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  participants: ProfileLite[];
};

type ChatSelectionKind = "group" | "private";

type GroupTabKey =
  | "overview"
  | "members"
  | "photos"
  | "edit"
  | "actions"
  | "matches"
  | "chats";

type EditProfileForm = {
  full_name: string;
  age: string;
  city: string;
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
};

type PhotoViewerState = {
  src: string;
  alt: string;
  title: string;
  meta: string;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function getFirstValidPhoto(profile?: ProfileLite | null) {
  if (!profile?.photos || !Array.isArray(profile.photos)) return "";
  return (
    profile.photos.find((photo) => typeof photo === "string" && photo.trim()) || ""
  );
}

function getProfilePhotos(profile?: ProfileLite | null) {
  if (!profile?.photos || !Array.isArray(profile.photos)) return [];
  return profile.photos.filter((photo): photo is string => typeof photo === "string" && Boolean(photo.trim()));
}

function getInitialEditForm(profile?: ProfileLite | null): EditProfileForm {
  return {
    full_name: profile?.full_name ?? "",
    age: profile?.age ? String(profile.age) : "",
    city: profile?.city ?? "",
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
  };
}

async function loadGroupRows(groupIds?: string[]) {
  if (groupIds && groupIds.length === 0) return [];

  const groupsQuery = supabase
    .from("groups")
    .select("id, created_at")
    .order("created_at", { ascending: false });

  const { data: groupsData, error: groupsError } = groupIds?.length
    ? await groupsQuery.in("id", groupIds)
    : await groupsQuery;

  if (groupsError) throw groupsError;

  const baseGroups = (groupsData || []) as GroupBaseRow[];
  const loadedGroupIds = baseGroups.map((group) => group.id).filter(Boolean);

  if (loadedGroupIds.length === 0) return [];

  const { data: membersData, error: membersError } = await supabase
    .from("group_members")
    .select("group_id, user_id")
    .in("group_id", loadedGroupIds);

  if (membersError) throw membersError;

  const members = (membersData || []) as GroupMemberRecord[];
  const userIds = Array.from(new Set(members.map((member) => member.user_id).filter(Boolean)));
  let profiles: ProfileLite[] = [];

  if (userIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select(
        "id, full_name, age, photos, city, gender, interested_in, bio, height, occupation, education, prompts, lifestyle, dating_mode, vibe, intent, looking_for, interests, is_admin, is_banned, is_verified, created_at, last_seen"
      )
      .in("id", userIds);

    if (profilesError) throw profilesError;
    profiles = (profilesData || []) as ProfileLite[];
  }

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const membersByGroup = new Map<string, GroupMember[]>();

  members.forEach((member) => {
    const groupMembers = membersByGroup.get(member.group_id) || [];
    groupMembers.push({
      user_id: member.user_id,
      user: profileById.get(member.user_id) || null,
    });
    membersByGroup.set(member.group_id, groupMembers);
  });

  return baseGroups.map((group) => ({
    ...group,
    members: membersByGroup.get(group.id) || [],
  })) as GroupRow[];
}

function buildGroupTitle(group?: GroupRow | null) {
  if (!group) return "Group";
  const names = group.members
    .map((member) => String(member.user?.full_name || "").trim())
    .filter(Boolean);
  return names.length ? names.join(" & ") : `Group ${group.id.slice(0, 6)}`;
}

function buildGroupSubtitle(group?: GroupRow | null) {
  if (!group) return "No group selected.";
  const cities = group.members
    .map((member) => String(member.user?.city || "").trim())
    .filter(Boolean);
  const uniqueCities = Array.from(new Set(cities));
  return uniqueCities[0] || "Nearby";
}

function buildGroupBio(group?: GroupRow | null) {
  if (!group) return "No group selected.";
  const bios = group.members
    .map((member) => String(member.user?.bio || "").trim())
    .filter(Boolean);
  return bios[0] || "No bio added yet.";
}

function buildPrivateThreadTitle(thread?: PrivateThreadWithDetails | null) {
  const names = (thread?.participants || [])
    .map((profile) => String(profile.full_name || "").trim())
    .filter(Boolean);
  return names.length ? names.join(" & ") : "Private chat";
}

function buildPrivateParticipantNameMap(thread?: PrivateThreadWithDetails | null) {
  const map: Record<string, string> = {};
  (thread?.participants || []).forEach((profile) => {
    map[profile.id] = profile.full_name || "Member";
  });
  return map;
}

function GroupTabButton({
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
      className="admin-secondary-button"
      style={{
        borderColor: isActive ? "#FF5C8A" : "#F1C7D5",
        color: isActive ? "#FF5C8A" : "#1F1632",
        background: isActive ? "#FFF1F5" : "#FFFFFF",
      }}
    >
      {label}
    </button>
  );
}

export default function AdminGroupPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingError, setLoadingError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [groupPage, setGroupPage] = useState(1);
  const [groupAccountTotal, setGroupAccountTotal] = useState(0);
  const [groupResultTotal, setGroupResultTotal] = useState(0);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [activeTab, setActiveTab] = useState<GroupTabKey>("overview");

  const [selectedGroupMatches, setSelectedGroupMatches] = useState<GroupMatchWithDetails[]>([]);
  const [loadingSelectedGroupMatches, setLoadingSelectedGroupMatches] = useState(false);
  const [selectedGroupMatchesError, setSelectedGroupMatchesError] = useState("");

  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [selectedChatKind, setSelectedChatKind] = useState<ChatSelectionKind>("group");
  const [selectedPrivateThreadId, setSelectedPrivateThreadId] = useState("");
  const [conversationMessages, setConversationMessages] = useState<GroupMessageRow[]>([]);
  const [loadingConversationMessages, setLoadingConversationMessages] = useState(false);
  const [conversationMessagesError, setConversationMessagesError] = useState("");
  const [conversationPreviews, setConversationPreviews] = useState<Record<string, ConversationPreview>>({});
  const [privateThreads, setPrivateThreads] = useState<PrivateThreadWithDetails[]>([]);
  const [loadingPrivateThreads, setLoadingPrivateThreads] = useState(false);
  const [privateThreadsError, setPrivateThreadsError] = useState("");
  const [privateThreadPreviews, setPrivateThreadPreviews] = useState<Record<string, ConversationPreview>>({});
  const [editForms, setEditForms] = useState<Record<string, EditProfileForm>>({});
  const [savingProfileId, setSavingProfileId] = useState("");
  const [editSuccess, setEditSuccess] = useState("");
  const [editError, setEditError] = useState("");
  const [updatingProfileId, setUpdatingProfileId] = useState("");
  const [actionsSuccess, setActionsSuccess] = useState("");
  const [actionsError, setActionsError] = useState("");
  const [photoViewer, setPhotoViewer] = useState<PhotoViewerState | null>(null);

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

    verifyAccess();
  }, [router]);

  useEffect(() => {
    if (checkingAccess) return;
    void loadGroups(groupPage, debouncedSearchTerm);
  }, [checkingAccess, debouncedSearchTerm, groupPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setGroupPage(1);
  }, [debouncedSearchTerm]);

  const loadGroups = async (page: number, search: string) => {
    try {
      setLoadingGroups(true);
      setLoadingError("");

      const query = sanitizeAdminSearch(search);
      const globalCountResult = await supabase
        .from("groups")
        .select("id", { count: "exact", head: true });
      if (globalCountResult.error) throw globalCountResult.error;
      setGroupAccountTotal(globalCountResult.count || 0);

      let matchingGroupIds: string[] | null = null;
      if (query) {
        const matchingProfiles = await findMatchingProfileIds(query, "group");
        const groupIds = new Set<string>();
        for (let index = 0; index < matchingProfiles.length; index += ADMIN_SEARCH_ID_BATCH_SIZE) {
          const profileIds = matchingProfiles.slice(index, index + ADMIN_SEARCH_ID_BATCH_SIZE);
          const { data, error } = await supabase
            .from("group_members")
            .select("group_id")
            .in("user_id", profileIds);
          if (error) throw error;
          (data || []).forEach((member) => groupIds.add(String(member.group_id)));
        }
        if (UUID_PATTERN.test(query)) {
          const { data: idMatch, error: idError } = await supabase
            .from("groups")
            .select("id")
            .eq("id", query)
            .maybeSingle();
          if (idError) throw idError;
          if (idMatch) groupIds.add(idMatch.id);
        }

        const datedGroups: GroupBaseRow[] = [];
        const collectedIds = Array.from(groupIds);
        for (let index = 0; index < collectedIds.length; index += ADMIN_SEARCH_ID_BATCH_SIZE) {
          const { data, error } = await supabase
            .from("groups")
            .select("id, created_at")
            .in("id", collectedIds.slice(index, index + ADMIN_SEARCH_ID_BATCH_SIZE));
          if (error) throw error;
          datedGroups.push(...((data || []) as GroupBaseRow[]));
        }
        matchingGroupIds = datedGroups
          .sort((left, right) => {
            const dateDifference = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
            return dateDifference || left.id.localeCompare(right.id);
          })
          .map((group) => group.id);
      }

      const resultTotal = matchingGroupIds ? matchingGroupIds.length : globalCountResult.count || 0;
      const pageCount = Math.max(1, Math.ceil(resultTotal / ADMIN_ACCOUNT_PAGE_SIZE));
      setGroupResultTotal(resultTotal);
      if (page > pageCount) {
        setGroupPage(pageCount);
        return;
      }

      const from = (page - 1) * ADMIN_ACCOUNT_PAGE_SIZE;
      let pageIds = matchingGroupIds?.slice(from, from + ADMIN_ACCOUNT_PAGE_SIZE) || null;
      if (!matchingGroupIds) {
        const { data, error } = await supabase
          .from("groups")
          .select("id")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, from + ADMIN_ACCOUNT_PAGE_SIZE - 1);
        if (error) throw error;
        pageIds = (data || []).map((group) => String(group.id));
      }

      const resolvedPageIds = pageIds || [];
      const normalized = resolvedPageIds.length ? await loadGroupRows(resolvedPageIds) : [];
      setGroups(normalized);

      setSelectedGroupId((current) => {
        if (current && normalized.some((group) => group.id === current)) return current;
        return normalized[0]?.id || "";
      });
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : "Could not load groups.");
    } finally {
      setLoadingGroups(false);
    }
  };

  const filteredGroups = groups;

  useEffect(() => {
    if (!selectedGroupId) return;
    if (filteredGroups.some((group) => group.id === selectedGroupId)) return;
    setSelectedGroupId(filteredGroups[0]?.id || "");
  }, [filteredGroups, selectedGroupId]);

  const selectedGroup =
    filteredGroups.find((group) => group.id === selectedGroupId) ||
    groups.find((group) => group.id === selectedGroupId) ||
    null;

  useEffect(() => {
    const nextForms: Record<string, EditProfileForm> = {};
    (selectedGroup?.members || []).forEach((member) => {
      nextForms[member.user_id] = getInitialEditForm(member.user || null);
    });
    setEditForms(nextForms);
    setEditSuccess("");
    setEditError("");
    setActionsSuccess("");
    setActionsError("");
  }, [selectedGroupId, selectedGroup]);

  useEffect(() => {
    if (!selectedGroupId) {
      setSelectedGroupMatches([]);
      setSelectedConversationId("");
      setSelectedChatKind("group");
      setSelectedPrivateThreadId("");
      setConversationMessages([]);
      setConversationPreviews({});
      setPrivateThreads([]);
      setPrivateThreadPreviews({});
      return;
    }

    const loadSelectedGroupMatches = async () => {
      try {
        setLoadingSelectedGroupMatches(true);
        setSelectedGroupMatchesError("");
        setSelectedConversationId("");
        setSelectedChatKind("group");
        setSelectedPrivateThreadId("");
        setConversationMessages([]);
        setConversationPreviews({});
        setPrivateThreads([]);
        setPrivateThreadPreviews({});

        const { data: matchRows, error: matchesError } = await supabase
          .from("group_matches")
          .select("id, group1_id, group2_id")
          .or(`group1_id.eq.${selectedGroupId},group2_id.eq.${selectedGroupId}`);

        if (matchesError) {
          setSelectedGroupMatchesError(matchesError.message);
          setSelectedGroupMatches([]);
          return;
        }

        const normalizedMatches = ((matchRows || []) as GroupMatchRow[]).map((match) => ({
          ...match,
          other_group_id:
            match.group1_id === selectedGroupId ? match.group2_id : match.group1_id,
        }));

        const otherGroupIds = normalizedMatches
          .map((match) => match.other_group_id)
          .filter(Boolean);

        let otherGroupMap = new Map<string, GroupRow>();

        if (otherGroupIds.length > 0) {
          otherGroupMap = new Map(
            (await loadGroupRows(otherGroupIds)).map((group) => [group.id, group])
          );
        }

        const finalMatches = normalizedMatches.map((match) => ({
          ...match,
          other_group: otherGroupMap.get(match.other_group_id) || null,
        }));

        setSelectedGroupMatches(finalMatches);

        if (finalMatches.length > 0) {
          setSelectedChatKind("group");
          setSelectedConversationId(finalMatches[0].id);
          const matchIds = finalMatches.map((match) => match.id);

          const { data: allMessagesData, error: allMessagesError } = await supabase
            .from("group_messages")
            .select("id, group_match_id, sender_id, text, created_at")
            .in("group_match_id", matchIds)
            .order("created_at", { ascending: false });

          if (!allMessagesError) {
            const previewMap: Record<string, ConversationPreview> = {};

            ((allMessagesData || []) as GroupMessageRow[]).forEach((message) => {
              const matchId = message.group_match_id;
              if (matchId && !previewMap[matchId]) {
                previewMap[matchId] = {
                  text: message.text || "",
                  created_at: message.created_at || null,
                };
              }
            });

            setConversationPreviews(previewMap);
          }
        }
      } catch (error) {
        setSelectedGroupMatchesError(
          error instanceof Error ? error.message : "Could not load group matches."
        );
      } finally {
        setLoadingSelectedGroupMatches(false);
      }
    };

    void loadSelectedGroupMatches();
  }, [selectedGroupId]);

  useEffect(() => {
    const selectedMemberIds = (selectedGroup?.members || [])
      .map((member) => member.user_id)
      .filter(Boolean);

    if (!selectedGroupId || selectedMemberIds.length === 0) {
      setPrivateThreads([]);
      setPrivateThreadPreviews({});
      setPrivateThreadsError("");
      return;
    }

    const loadPrivateThreads = async () => {
      try {
        setLoadingPrivateThreads(true);
        setPrivateThreadsError("");
        setPrivateThreads([]);
        setPrivateThreadPreviews({});

        const matchedMemberIds = selectedGroupMatches.flatMap((match) =>
          (match.other_group?.members || []).map((member) => member.user_id)
        );
        const allowedParticipantIds = new Set([
          ...selectedMemberIds,
          ...matchedMemberIds.filter(Boolean),
        ]);

        const [lowRes, highRes] = await Promise.all([
          supabase
            .from("private_threads")
            .select("id, participant_low_id, participant_high_id, source_mode, source_match_id, created_at, updated_at")
            .in("participant_low_id", selectedMemberIds),
          supabase
            .from("private_threads")
            .select("id, participant_low_id, participant_high_id, source_mode, source_match_id, created_at, updated_at")
            .in("participant_high_id", selectedMemberIds),
        ]);

        if (lowRes.error) throw lowRes.error;
        if (highRes.error) throw highRes.error;

        const rawThreads = [...(lowRes.data || []), ...(highRes.data || [])] as Omit<
          PrivateThreadWithDetails,
          "participants"
        >[];
        const threads = Array.from(new Map(rawThreads.map((thread) => [thread.id, thread])).values())
          .filter((thread) => {
            if (thread.source_mode === "group") return true;
            return (
              allowedParticipantIds.has(thread.participant_low_id) &&
              allowedParticipantIds.has(thread.participant_high_id)
            );
          });

        if (threads.length === 0) return;

        const participantIds = Array.from(
          new Set(
            threads.flatMap((thread) => [
              thread.participant_low_id,
              thread.participant_high_id,
            ])
          )
        );

        const [{ data: profileData, error: profileError }, { data: messageData, error: messageError }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select(
                "id, full_name, age, photos, city, gender, interested_in, bio, height, occupation, education, prompts, lifestyle, dating_mode, vibe, intent, looking_for, interests, is_admin, is_banned, is_verified, created_at, last_seen"
              )
              .in("id", participantIds),
            supabase
              .from("private_messages")
              .select("id, private_thread_id, sender_id, text, created_at")
              .in(
                "private_thread_id",
                threads.map((thread) => thread.id)
              )
              .order("created_at", { ascending: false }),
          ]);

        if (profileError) throw profileError;
        if (messageError) throw messageError;

        const profileMap = new Map(
          ((profileData || []) as ProfileLite[]).map((profile) => [profile.id, profile])
        );
        const previewMap: Record<string, ConversationPreview> = {};

        ((messageData || []) as GroupMessageRow[]).forEach((message) => {
          const threadId = message.private_thread_id;
          if (threadId && !previewMap[threadId]) {
            previewMap[threadId] = {
              text: message.text || "",
              created_at: message.created_at || null,
            };
          }
        });

        const finalThreads = threads.map((thread) => ({
          ...thread,
          participants: [
            profileMap.get(thread.participant_low_id),
            profileMap.get(thread.participant_high_id),
          ].filter(Boolean) as ProfileLite[],
        }));

        setPrivateThreads(finalThreads);
        setPrivateThreadPreviews(previewMap);
      } catch (error) {
        setPrivateThreadsError(
          error instanceof Error ? error.message : "Could not load private chats."
        );
      } finally {
        setLoadingPrivateThreads(false);
      }
    };

    void loadPrivateThreads();
  }, [selectedGroupId, selectedGroup, selectedGroupMatches]);

  useEffect(() => {
    if (selectedChatKind !== "group") return;

    if (!selectedConversationId) {
      setConversationMessages([]);
      return;
    }

    const loadConversationMessages = async () => {
      try {
        setLoadingConversationMessages(true);
        setConversationMessagesError("");

        const { data, error } = await supabase
          .from("group_messages")
          .select("id, group_match_id, sender_id, text, created_at")
          .eq("group_match_id", selectedConversationId)
          .order("created_at", { ascending: true });

        if (error) {
          setConversationMessagesError(error.message);
          setConversationMessages([]);
          return;
        }

        setConversationMessages((data || []) as GroupMessageRow[]);
      } catch (error) {
        setConversationMessagesError(
          error instanceof Error ? error.message : "Could not load group chat."
        );
      } finally {
        setLoadingConversationMessages(false);
      }
    };

    void loadConversationMessages();
  }, [selectedConversationId, selectedChatKind]);

  useEffect(() => {
    if (selectedChatKind !== "private") return;

    if (!selectedPrivateThreadId) {
      setConversationMessages([]);
      return;
    }

    const loadPrivateMessages = async () => {
      try {
        setLoadingConversationMessages(true);
        setConversationMessagesError("");

        const { data, error } = await supabase
          .from("private_messages")
          .select("id, private_thread_id, sender_id, text, created_at")
          .eq("private_thread_id", selectedPrivateThreadId)
          .order("created_at", { ascending: true });

        if (error) {
          setConversationMessagesError(error.message);
          setConversationMessages([]);
          return;
        }

        setConversationMessages((data || []) as GroupMessageRow[]);
      } catch (error) {
        setConversationMessagesError(
          error instanceof Error ? error.message : "Could not load private chat."
        );
      } finally {
        setLoadingConversationMessages(false);
      }
    };

    void loadPrivateMessages();
  }, [selectedPrivateThreadId, selectedChatKind]);

  if (checkingAccess) {
    return <div className="p-10">Checking access...</div>;
  }

  const selectedPrivateThread =
    privateThreads.find((thread) => thread.id === selectedPrivateThreadId) || null;
  const selectedPrivateParticipantNameMap =
    buildPrivateParticipantNameMap(selectedPrivateThread);

  const buildProfileUpdatePayload = (
    form: EditProfileForm,
    profile?: ProfileLite | null
  ): Partial<ProfileLite> => {
    const age = Number.parseInt(form.age, 10);

    return {
      full_name: form.full_name.trim(),
      age: Number.isNaN(age) ? null : age,
      city: form.city.trim(),
      gender: form.gender.trim(),
      interested_in: form.interested_in.trim(),
      bio: form.bio.trim(),
      height: form.height.trim(),
      occupation: form.occupation.trim(),
      education: form.education.trim(),
      prompts: updateSchoolPrompt(profile?.prompts, form.school),
      lifestyle: form.lifestyle.trim(),
      dating_mode: form.dating_mode.trim(),
      vibe: form.vibe.trim(),
      intent: form.intent.trim(),
      looking_for: form.looking_for.trim(),
    };
  };

  const applyProfilePatchToGroup = (
    group: GroupRow,
    profileId: string,
    patch: Partial<ProfileLite>
  ): GroupRow => ({
    ...group,
    members: group.members.map((member) => {
      if (member.user_id !== profileId) return member;

      const existingProfile: ProfileLite =
        member.user || {
          id: profileId,
          full_name: null,
          age: null,
          photos: null,
        };

      return {
        ...member,
        user: {
          ...existingProfile,
          ...patch,
        },
      };
    }),
  });

  const updateGroupProfileInState = (profileId: string, patch: Partial<ProfileLite>) => {
    setGroups((current) =>
      current.map((group) => applyProfilePatchToGroup(group, profileId, patch))
    );
    setSelectedGroupMatches((current) =>
      current.map((match) => ({
        ...match,
        other_group: match.other_group
          ? applyProfilePatchToGroup(match.other_group, profileId, patch)
          : match.other_group,
      }))
    );
    setPrivateThreads((current) =>
      current.map((thread) => ({
        ...thread,
        participants: thread.participants.map((profile) =>
          profile.id === profileId ? { ...profile, ...patch } : profile
        ),
      }))
    );
  };

  const handleGroupEditChange = (
    profileId: string,
    field: keyof EditProfileForm,
    value: string
  ) => {
    setEditForms((current) => ({
      ...current,
      [profileId]: {
        ...(current[profileId] || getInitialEditForm(null)),
        [field]: value,
      },
    }));
  };

  const handleSaveGroupMember = async (profileId: string) => {
    const form = editForms[profileId];
    if (!form) return;

    try {
      setSavingProfileId(profileId);
      setEditSuccess("");
      setEditError("");

      const profile = selectedGroup?.members.find((member) => member.user_id === profileId)?.user;
      const payload = buildProfileUpdatePayload(form, profile);
      const { error } = await supabase.from("profiles").update(payload).eq("id", profileId);

      if (error) {
        setEditError(error.message);
        return;
      }

      updateGroupProfileInState(profileId, payload);
      setEditSuccess("Group member profile saved.");
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not save member profile.");
    } finally {
      setSavingProfileId("");
    }
  };

  const updateGroupMemberFlag = async (
    profileId: string,
    key: "is_verified" | "is_banned",
    value: boolean
  ) => {
    try {
      setUpdatingProfileId(profileId);
      setActionsSuccess("");
      setActionsError("");

      const { error } = await supabase
        .from("profiles")
        .update({ [key]: value })
        .eq("id", profileId);

      if (error) {
        setActionsError(error.message);
        return;
      }

      if (key === "is_verified") {
        await syncSharedVerificationForProfile(profileId);
      }

      updateGroupProfileInState(profileId, { [key]: value });
      setActionsSuccess("Group member action saved.");
    } catch (error) {
      setActionsError(error instanceof Error ? error.message : "Could not save group action.");
    } finally {
      setUpdatingProfileId("");
    }
  };

  const renderOverviewTab = () => {
    if (!selectedGroup) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No group selected</h3>
          <p className="admin-section-subtitle">Choose a group from the list to inspect it.</p>
        </div>
      );
    }

    return (
      <div className="admin-grid admin-grid-two">
        <div className="admin-section-card">
          <h3 className="admin-section-title">Group overview</h3>
          <p className="admin-section-subtitle">{buildGroupBio(selectedGroup)}</p>
          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            <div>
              <strong>Group ID:</strong> {selectedGroup.id}
            </div>
            <div>
              <strong>Created:</strong> {formatDate(selectedGroup.created_at)}
            </div>
            <div>
              <strong>City:</strong> {buildGroupSubtitle(selectedGroup)}
            </div>
            <div>
              <strong>Members:</strong> {selectedGroup.members.length}
            </div>
            <div>
              <strong>Matches:</strong> {selectedGroupMatches.length}
            </div>
          </div>
        </div>

        <div className="admin-section-card">
          <h3 className="admin-section-title">Member preview</h3>
          <div className="admin-user-list">
            {selectedGroup.members.map((member) => {
              const photo = getFirstValidPhoto(member.user || null);
              return (
                <div key={member.user_id} className="admin-user-card">
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <div className="admin-user-avatar" style={{ width: 54, height: 54 }}>
                      {photo ? (
                        <img
                          src={photo}
                          alt={member.user?.full_name || "Member"}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span>{(member.user?.full_name || "U").slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <p style={{ fontWeight: 700 }}>{member.user?.full_name || "Unknown member"}</p>
                      <p className="admin-section-subtitle" style={{ margin: 0 }}>
                        {member.user?.age ? `${member.user.age}` : "Age not set"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderMembersTab = () => {
    if (!selectedGroup) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No members to show</h3>
          <p className="admin-section-subtitle">Choose a group from the left panel first.</p>
        </div>
      );
    }

    return (
      <div className="admin-user-list">
        {selectedGroup.members.map((member) => {
          const photo = getFirstValidPhoto(member.user || null);
          return (
            <div key={member.user_id} className="admin-user-card">
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div className="admin-user-avatar" style={{ width: 60, height: 60 }}>
                  {photo ? (
                    <img
                      src={photo}
                      alt={member.user?.full_name || "Member"}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span>{(member.user?.full_name || "U").slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>
                    {member.user?.full_name || "Unknown member"}
                  </p>
                  <p className="admin-section-subtitle" style={{ margin: 0 }}>
                    {member.user?.age ? `Age ${member.user.age}` : "Age not set"}
                    {member.user?.city ? ` • ${member.user.city}` : ""}
                  </p>
                  <p className="admin-section-subtitle" style={{ marginTop: 6 }}>
                    {member.user?.bio || "No bio added yet."}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPhotosTab = () => {
    if (!selectedGroup) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No group selected</h3>
          <p className="admin-section-subtitle">Choose a group from the left panel first.</p>
        </div>
      );
    }

    return (
      <div className="admin-user-list">
        {selectedGroup.members.map((member) => {
          const profile = member.user;
          const photos = getProfilePhotos(profile || null);
          const memberName = profile?.full_name || "Unknown member";

          return (
            <section key={member.user_id} className="admin-mini-card">
              <div className="admin-section-header">
                <div>
                  <h3 className="admin-section-title">{memberName}</h3>
                  <p className="admin-section-subtitle">
                    {photos.length} photo{photos.length === 1 ? "" : "s"} in this member gallery.
                  </p>
                </div>
                <AdminPhotoUpload
                  profileId={profile?.id}
                  currentPhotoCount={photos.length}
                  onUploaded={(updatedPhotos) =>
                    setGroups((current) =>
                      current.map((group) =>
                        group.id === selectedGroup.id
                          ? {
                              ...group,
                              members: group.members.map((groupMember) =>
                                groupMember.user_id === member.user_id && groupMember.user
                                  ? {
                                      ...groupMember,
                                      user: { ...groupMember.user, photos: updatedPhotos },
                                    }
                                  : groupMember
                              ),
                            }
                          : group
                      )
                    )
                  }
                />
              </div>

              {photos.length > 0 ? (
                <div className="admin-photo-grid-large">
                  {photos.map((photo, index) => (
                    <div className="admin-photo-item" key={`${member.user_id}-${photo}-${index}`}>
                      <button
                        type="button"
                        className="admin-photo-card-large admin-photo-card-button"
                        onClick={() =>
                          setPhotoViewer({
                            src: photo,
                            alt: `${memberName} photo ${index + 1}`,
                            title: memberName,
                            meta: `Photo ${index + 1} of ${photos.length}`,
                          })
                        }
                      >
                        <img
                          src={photo}
                          alt={`${memberName} photo ${index + 1}`}
                          className="admin-photo-image-large"
                        />
                      </button>
                      <AdminPhotoEditButton
                        profileId={profile!.id}
                        photoUrl={photo}
                        onUpdated={(updatedPhotos) =>
                          setGroups((current) =>
                            current.map((group) =>
                              group.id === selectedGroup.id
                                ? {
                                    ...group,
                                    members: group.members.map((groupMember) =>
                                      groupMember.user_id === member.user_id && groupMember.user
                                        ? {
                                            ...groupMember,
                                            user: { ...groupMember.user, photos: updatedPhotos },
                                          }
                                        : groupMember
                                    ),
                                  }
                                : group
                            )
                          )
                        }
                      />
                      <AdminPhotoDeleteButton
                        profileId={profile!.id}
                        photoUrl={photo}
                        onDeleted={(updatedPhotos) =>
                          setGroups((current) =>
                            current.map((group) =>
                              group.id === selectedGroup.id
                                ? {
                                    ...group,
                                    members: group.members.map((groupMember) =>
                                      groupMember.user_id === member.user_id && groupMember.user
                                        ? {
                                            ...groupMember,
                                            user: { ...groupMember.user, photos: updatedPhotos },
                                          }
                                        : groupMember
                                    ),
                                  }
                                : group
                            )
                          )
                        }
                      />
                      <AdminPhotoOrderControls
                        profileId={profile!.id}
                        photos={photos}
                        photoIndex={index}
                        onReordered={(updatedPhotos) =>
                          setGroups((current) =>
                            current.map((group) =>
                              group.id === selectedGroup.id
                                ? {
                                    ...group,
                                    members: group.members.map((groupMember) =>
                                      groupMember.user_id === member.user_id && groupMember.user
                                        ? {
                                            ...groupMember,
                                            user: { ...groupMember.user, photos: updatedPhotos },
                                          }
                                        : groupMember
                                    ),
                                  }
                                : group
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
                  <p className="admin-section-subtitle">This member has no photos yet.</p>
                </div>
              )}
            </section>
          );
        })}
      </div>
    );
  };

  const renderEditTab = () => {
    if (!selectedGroup) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No group selected</h3>
          <p className="admin-section-subtitle">Choose a group from the left panel first.</p>
        </div>
      );
    }

    const fields: Array<{
      key: keyof EditProfileForm;
      label: string;
      multiline?: boolean;
    }> = [
      { key: "full_name", label: "Full name" },
      { key: "age", label: "Age" },
      { key: "city", label: "City" },
      { key: "gender", label: "Gender" },
      { key: "interested_in", label: "Interested in" },
      { key: "height", label: "Height" },
      { key: "occupation", label: "Work" },
      { key: "education", label: "Education" },
      { key: "school", label: "School / University" },
      { key: "lifestyle", label: "Lifestyle" },
      { key: "dating_mode", label: "Dating mode" },
      { key: "vibe", label: "Vibe" },
      { key: "intent", label: "Intent" },
      { key: "looking_for", label: "Looking for" },
      { key: "bio", label: "Bio", multiline: true },
    ];

    return (
      <section className="admin-mini-card">
        <div className="admin-section-header">
          <div>
            <h3 className="admin-section-title">Edit group members</h3>
            <p className="admin-section-subtitle">
              Update each member profile without leaving the group workspace.
            </p>
          </div>
        </div>

        {editError ? <div className="admin-error-box">{editError}</div> : null}
        {editSuccess ? <div className="admin-success-box">{editSuccess}</div> : null}

        <div className="admin-user-list">
          {selectedGroup.members.map((member) => {
            const profile = member.user;
            const form = editForms[member.user_id] || getInitialEditForm(profile || null);

            return (
              <article key={member.user_id} className="admin-mini-card">
                <div className="admin-section-header">
                  <div>
                    <h4 className="admin-section-title" style={{ fontSize: 18 }}>
                      {profile?.full_name || "Unknown member"}
                    </h4>
                    <p className="admin-section-subtitle">Profile ID: {member.user_id}</p>
                  </div>
                  <button
                    type="button"
                    className="admin-primary-button"
                    disabled={savingProfileId === member.user_id}
                    onClick={() => handleSaveGroupMember(member.user_id)}
                  >
                    {savingProfileId === member.user_id ? "Saving..." : "Save member"}
                  </button>
                </div>

                <div className="admin-form-grid">
                  {fields.map((field) => (
                    <label
                      key={field.key}
                      className={`admin-field ${field.multiline ? "admin-field-full" : ""}`}
                    >
                      <span className="admin-label">{field.label}</span>
                      {field.multiline ? (
                        <textarea
                          className="admin-textarea"
                          value={form[field.key]}
                          rows={4}
                          onChange={(event) =>
                            handleGroupEditChange(member.user_id, field.key, event.target.value)
                          }
                        />
                      ) : (
                        <input
                          className="admin-input"
                          value={form[field.key]}
                          onChange={(event) =>
                            handleGroupEditChange(member.user_id, field.key, event.target.value)
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  };

  const renderActionsTab = () => {
    if (!selectedGroup) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No group selected</h3>
          <p className="admin-section-subtitle">Choose a group from the left panel first.</p>
        </div>
      );
    }

    return (
      <section className="admin-mini-card">
        <div className="admin-section-header">
          <div>
            <h3 className="admin-section-title">Group admin actions</h3>
            <p className="admin-section-subtitle">
              Verify, ban, or open account controls for every member in this group.
            </p>
          </div>
        </div>

        {actionsError ? <div className="admin-error-box">{actionsError}</div> : null}
        {actionsSuccess ? <div className="admin-success-box">{actionsSuccess}</div> : null}

        <div className="admin-actions-grid">
          {selectedGroup.members.map((member) => {
            const profile = member.user;

            return (
              <article key={member.user_id} className="admin-mini-card">
                <div className="admin-user-title-row">
                  <div>
                    <h4 className="admin-section-title" style={{ fontSize: 18 }}>
                      {profile?.full_name || "Unknown member"}
                    </h4>
                    <p className="admin-section-subtitle">Profile ID: {member.user_id}</p>
                  </div>
                  <div className="admin-badge-group">
                    {profile?.is_verified ? (
                      <span className="admin-status-chip admin-status-verified">Verified</span>
                    ) : null}
                    {profile?.is_banned ? (
                      <span className="admin-status-chip admin-status-banned">Banned</span>
                    ) : (
                      <span className="admin-status-chip admin-status-active">Active</span>
                    )}
                  </div>
                </div>

                <div className="admin-action-stack">
                  <button
                    type="button"
                    className="admin-primary-button"
                    disabled={updatingProfileId === member.user_id}
                    onClick={() =>
                      updateGroupMemberFlag(member.user_id, "is_verified", !profile?.is_verified)
                    }
                  >
                    {profile?.is_verified ? "Remove verified tick" : "Give verified tick"}
                  </button>
                  <button
                    type="button"
                    className="admin-secondary-button"
                    disabled={updatingProfileId === member.user_id}
                    onClick={() =>
                      updateGroupMemberFlag(member.user_id, "is_banned", !profile?.is_banned)
                    }
                  >
                    {profile?.is_banned ? "Unban member" : "Ban member"}
                  </button>
                  <button
                    type="button"
                    className="admin-secondary-button"
                    onClick={() => router.push("/accounts")}
                  >
                    Open account tools
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  };

  const renderMatchesTab = () => {
    if (selectedGroupMatchesError) {
      return <div className="admin-error-box">{selectedGroupMatchesError}</div>;
    }

    if (loadingSelectedGroupMatches) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">Loading group matches...</h3>
          <p className="admin-section-subtitle">Please wait while match data is loading.</p>
        </div>
      );
    }

    if (selectedGroupMatches.length === 0) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No group matches yet</h3>
          <p className="admin-section-subtitle">This group currently has no matches.</p>
        </div>
      );
    }

    return (
      <div className="admin-user-list">
        {selectedGroupMatches.map((match) => {
          const otherGroup = match.other_group;
          const previewPhoto =
            otherGroup?.members.map((member) => getFirstValidPhoto(member.user || null)).find(Boolean) || "";

          return (
            <div
              key={match.id}
              className="admin-user-card"
              style={{ cursor: "pointer" }}
              onClick={() => {
                setSelectedConversationId(match.id);
                setActiveTab("chats");
              }}
            >
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div className="admin-user-avatar" style={{ width: 60, height: 60 }}>
                  {previewPhoto ? (
                    <img
                      src={previewPhoto}
                      alt={buildGroupTitle(otherGroup)}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span>{buildGroupTitle(otherGroup).slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>{buildGroupTitle(otherGroup)}</p>
                  <p className="admin-section-subtitle" style={{ margin: 0 }}>
                    {buildGroupSubtitle(otherGroup)}
                  </p>
                  <p className="admin-section-subtitle" style={{ marginTop: 6 }}>
                    Match ID: {match.id}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderChatsTab = () => {
    if (selectedGroupMatchesError) {
      return <div className="admin-error-box">{selectedGroupMatchesError}</div>;
    }

    return (
      <div className="admin-grid admin-grid-two">
        <div className="admin-section-card">
          <h3 className="admin-section-title">Conversations</h3>
          {loadingSelectedGroupMatches ? (
            <p className="admin-section-subtitle">Loading conversations...</p>
          ) : selectedGroupMatches.length === 0 ? (
            <p className="admin-section-subtitle">No group conversations found.</p>
          ) : (
            <div className="admin-user-list">
              {selectedGroupMatches.map((match) => {
                const otherGroup = match.other_group;
                const isActive = selectedConversationId === match.id;
                const preview = conversationPreviews[match.id];
                return (
                  <button
                    key={match.id}
                    type="button"
                    className="admin-user-card"
                    onClick={() => {
                      setSelectedChatKind("group");
                      setSelectedConversationId(match.id);
                    }}
                    style={{
                      textAlign: "left",
                      borderColor:
                        selectedChatKind === "group" && isActive ? "#FF5C8A" : "#F7DCE6",
                      background:
                        selectedChatKind === "group" && isActive ? "#FFF1F5" : "#FFFFFF",
                    }}
                  >
                    <p style={{ fontWeight: 700, marginBottom: 4 }}>{buildGroupTitle(otherGroup)}</p>
                    <p className="admin-section-subtitle" style={{ margin: 0 }}>
                      {preview?.text || "No messages yet."}
                    </p>
                    <p className="admin-section-subtitle" style={{ marginTop: 6 }}>
                      {formatDate(preview?.created_at)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          <div className="admin-section-header" style={{ marginTop: 22 }}>
            <div>
              <h3 className="admin-section-title">Private member chats</h3>
              <p className="admin-section-subtitle">
                Member-to-member private chats connected to this group.
              </p>
            </div>
          </div>

          {privateThreadsError ? <div className="admin-error-box">{privateThreadsError}</div> : null}

          {loadingPrivateThreads ? (
            <p className="admin-section-subtitle">Loading private chats...</p>
          ) : privateThreads.length === 0 ? (
            <p className="admin-section-subtitle">No private chats found.</p>
          ) : (
            <div className="admin-user-list">
              {privateThreads.map((thread) => {
                const preview = privateThreadPreviews[thread.id];
                const isActive =
                  selectedChatKind === "private" && selectedPrivateThreadId === thread.id;

                return (
                  <button
                    key={thread.id}
                    type="button"
                    className="admin-user-card"
                    onClick={() => {
                      setSelectedChatKind("private");
                      setSelectedPrivateThreadId(thread.id);
                    }}
                    style={{
                      textAlign: "left",
                      borderColor: isActive ? "#FF5C8A" : "#F7DCE6",
                      background: isActive ? "#FFF1F5" : "#FFFFFF",
                    }}
                  >
                    <p style={{ fontWeight: 700, marginBottom: 4 }}>
                      {buildPrivateThreadTitle(thread)}
                    </p>
                    <p className="admin-section-subtitle" style={{ margin: 0 }}>
                      {preview?.text || "No messages yet."}
                    </p>
                    <p className="admin-section-subtitle" style={{ marginTop: 6 }}>
                      {preview?.created_at ? formatDate(preview.created_at) : `Thread ID: ${thread.id}`}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="admin-section-card">
          <h3 className="admin-section-title">
            {selectedChatKind === "private" ? "Private chat messages" : "Chat messages"}
          </h3>
          {conversationMessagesError ? (
            <div className="admin-error-box">{conversationMessagesError}</div>
          ) : loadingConversationMessages ? (
            <p className="admin-section-subtitle">Loading messages...</p>
          ) : selectedChatKind === "group" && !selectedConversationId ? (
            <p className="admin-section-subtitle">Choose a conversation to inspect it.</p>
          ) : selectedChatKind === "private" && !selectedPrivateThread ? (
            <p className="admin-section-subtitle">Choose a private member chat to inspect it.</p>
          ) : conversationMessages.length === 0 ? (
            <p className="admin-section-subtitle">No messages in this conversation yet.</p>
          ) : (
            <div className="admin-user-list">
              {conversationMessages.map((message) => {
                const senderName =
                  selectedChatKind === "private"
                    ? selectedPrivateParticipantNameMap[message.sender_id || ""] || "Member"
                    : message.sender_id || "Unknown";

                return (
                  <div key={message.id} className="admin-user-card">
                    <p style={{ fontWeight: 700, marginBottom: 6 }}>
                      Sender: {senderName}
                    </p>
                    <p style={{ marginBottom: 8 }}>{message.text}</p>
                    <p className="admin-section-subtitle" style={{ margin: 0 }}>
                      {formatDate(message.created_at)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className="admin-dashboard-page">
      <div className="admin-dashboard-shell">
        <Header />

        <section className="admin-main-card">
          <div className="admin-grid admin-grid-sidebar">
            <aside className="admin-section-card">
              <h2 className="admin-section-title">Groups</h2>
              <p className="admin-section-subtitle">
                Each row is one group profile with all of its members together.
              </p>

              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search group by name, city, bio, or group id."
                className="admin-search-input"
              />

              <div className="admin-list-count-row" aria-live="polite">
                <span className="admin-list-count-primary">All Groups ({groupAccountTotal})</span>
                {debouncedSearchTerm.trim() ? (
                  <span className="admin-list-count-filtered">
                    Search results ({groupResultTotal})
                  </span>
                ) : null}
              </div>

              {loadingError ? <div className="admin-error-box">{loadingError}</div> : null}

              {loadingGroups ? (
                <p className="admin-section-subtitle">Loading groups...</p>
              ) : filteredGroups.length === 0 ? (
                <div className="admin-empty-card">
                  <h3 className="admin-section-title">No groups found</h3>
                  <p className="admin-section-subtitle">
                    Try a different search or create a group in the app first.
                  </p>
                </div>
              ) : (
                <div className="admin-user-list">
                  {filteredGroups.map((group) => {
                    const isSelected = selectedGroupId === group.id;
                    const previewPhoto =
                      group.members.map((member) => getFirstValidPhoto(member.user || null)).find(Boolean) || "";

                    return (
                      <button
                        key={group.id}
                        type="button"
                        className="admin-user-card"
                        onClick={() => setSelectedGroupId(group.id)}
                        style={{
                          textAlign: "left",
                          borderColor: isSelected ? "#FF5C8A" : "#F7DCE6",
                          background: isSelected ? "#FFF1F5" : "#FFFFFF",
                        }}
                      >
                        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                          <div className="admin-user-avatar" style={{ width: 48, height: 48 }}>
                            {previewPhoto ? (
                              <img
                                src={previewPhoto}
                                alt={buildGroupTitle(group)}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : (
                              <span>{buildGroupTitle(group).slice(0, 1).toUpperCase()}</span>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: 700, marginBottom: 4 }}>{buildGroupTitle(group)}</p>
                            <p className="admin-section-subtitle" style={{ margin: 0 }}>
                              {buildGroupSubtitle(group)}
                            </p>
                            <p className="admin-section-subtitle" style={{ marginTop: 6 }}>
                              Group ID: {group.id}
                            </p>
                            <p className="admin-section-subtitle" style={{ marginTop: 6 }}>
                              Created: {formatDate(group.created_at)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <AdminPagination
                page={groupPage}
                pageSize={ADMIN_ACCOUNT_PAGE_SIZE}
                total={groupResultTotal}
                loading={loadingGroups}
                onPageChange={setGroupPage}
              />
            </aside>

            <div className="admin-section-card">
              <h2 className="admin-section-title">Selected group</h2>
              <p className="admin-section-subtitle">
                Open the group together, inspect members, and review group matches/chats.
              </p>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
                <GroupTabButton
                  label="Overview"
                  isActive={activeTab === "overview"}
                  onClick={() => setActiveTab("overview")}
                />
                <GroupTabButton
                  label="Members"
                  isActive={activeTab === "members"}
                  onClick={() => setActiveTab("members")}
                />
                <GroupTabButton
                  label="Photos"
                  isActive={activeTab === "photos"}
                  onClick={() => setActiveTab("photos")}
                />
                <GroupTabButton
                  label="Edit"
                  isActive={activeTab === "edit"}
                  onClick={() => setActiveTab("edit")}
                />
                <GroupTabButton
                  label="Actions"
                  isActive={activeTab === "actions"}
                  onClick={() => setActiveTab("actions")}
                />
                <GroupTabButton
                  label="Matches"
                  isActive={activeTab === "matches"}
                  onClick={() => setActiveTab("matches")}
                />
                <GroupTabButton
                  label="Chats"
                  isActive={activeTab === "chats"}
                  onClick={() => setActiveTab("chats")}
                />
              </div>

              <div className="admin-tab-content">
                {activeTab === "overview" ? renderOverviewTab() : null}
                {activeTab === "members" ? renderMembersTab() : null}
                {activeTab === "photos" ? renderPhotosTab() : null}
                {activeTab === "edit" ? renderEditTab() : null}
                {activeTab === "actions" ? renderActionsTab() : null}
                {activeTab === "matches" ? renderMatchesTab() : null}
                {activeTab === "chats" ? renderChatsTab() : null}
              </div>
            </div>
          </div>
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
                x
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
