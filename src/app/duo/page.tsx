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
  city: string | null;
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

type DuoRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  user1?: ProfileLite | null;
  user2?: ProfileLite | null;
};

type DuoMatchRow = {
  id: string;
  duo1_id: string;
  duo2_id: string;
};

type DuoMatchWithDetails = {
  id: string;
  duo1_id: string;
  duo2_id: string;
  other_duo_id: string;
  other_duo: DuoRow | null;
};

type DuoMessageRow = {
  id: string;
  duo_match_id?: string;
  private_thread_id?: string;
  sender_id?: string | null;
  text: string;
  created_at: string;
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

type ConversationPreview = {
  text: string;
  created_at: string | null;
};

type ChatSelectionKind = "duo" | "private";

type DuoTabKey =
  | "overview"
  | "profiles"
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

function normalizeProfile(profile?: ProfileLite | ProfileLite[] | null) {
  if (Array.isArray(profile)) return profile[0] || null;
  return profile || null;
}

type DuoQueryRow = Omit<DuoRow, "user1" | "user2"> & {
  user1?: ProfileLite | ProfileLite[] | null;
  user2?: ProfileLite | ProfileLite[] | null;
};

function normalizeDuoRows(rows: DuoQueryRow[]) {
  return (rows || []).map((duo) => ({
    ...duo,
    user1: normalizeProfile(duo.user1),
    user2: normalizeProfile(duo.user2),
  })) as DuoRow[];
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const stringValue = String(value).trim();
  if (!stringValue) return "—";

  return stringValue
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getInitialLetter(name?: string | null) {
  return (name || "U").trim().slice(0, 1).toUpperCase() || "U";
}

function getFirstValidPhoto(profile?: ProfileLite | null) {
  if (!profile?.photos || !Array.isArray(profile.photos)) return "";
  return (
    profile.photos.find((photo) => typeof photo === "string" && photo.trim()) ||
    ""
  );
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

function getConversationPreviewText(text?: string | null) {
  const normalized = (text || "").trim();
  if (!normalized) return "No messages yet.";

  if (normalized.length <= 90) return normalized;
  return `${normalized.slice(0, 90).trim()}...`;
}

function buildDuoDisplayName(duo?: DuoRow | null) {
  if (!duo) return "Unknown Duo";

  const name1 = (duo.user1?.full_name || "").trim();
  const name2 = (duo.user2?.full_name || "").trim();

  if (name1 && name2) return `${name1} & ${name2}`;
  if (name1) return name1;
  if (name2) return name2;
  return "Unnamed Duo";
}

function buildDuoMetaLine(duo?: DuoRow | null) {
  if (!duo) return "—";

  const age1 = duo.user1?.age ? String(duo.user1.age) : "—";
  const age2 = duo.user2?.age ? String(duo.user2.age) : "—";

  const city1 = (duo.user1?.city || "").trim();
  const city2 = (duo.user2?.city || "").trim();

  let cityText = "";
  if (city1 && city2) {
    cityText = city1.toLowerCase() === city2.toLowerCase() ? city1 : `${city1} / ${city2}`;
  } else {
    cityText = city1 || city2 || "";
  }

  return cityText ? `${age1} & ${age2} • ${cityText}` : `${age1} & ${age2}`;
}

function buildParticipantNameMap(selectedDuo?: DuoRow | null, otherDuo?: DuoRow | null) {
  const nameMap: Record<string, string> = {};

  const selectedUser1Id = selectedDuo?.user1?.id || selectedDuo?.user1_id;
  const selectedUser2Id = selectedDuo?.user2?.id || selectedDuo?.user2_id;
  const otherUser1Id = otherDuo?.user1?.id || otherDuo?.user1_id;
  const otherUser2Id = otherDuo?.user2?.id || otherDuo?.user2_id;

  if (selectedUser1Id) {
    nameMap[selectedUser1Id] =
      selectedDuo?.user1?.full_name?.trim() || "Selected Duo User 1";
  }

  if (selectedUser2Id) {
    nameMap[selectedUser2Id] =
      selectedDuo?.user2?.full_name?.trim() || "Selected Duo User 2";
  }

  if (otherUser1Id) {
    nameMap[otherUser1Id] =
      otherDuo?.user1?.full_name?.trim() || "Matched Duo User 1";
  }

  if (otherUser2Id) {
    nameMap[otherUser2Id] =
      otherDuo?.user2?.full_name?.trim() || "Matched Duo User 2";
  }

  return nameMap;
}

function getSenderDisplayName({
  message,
  selectedDuo,
  otherDuo,
}: {
  message: DuoMessageRow;
  selectedDuo?: DuoRow | null;
  otherDuo?: DuoRow | null;
}) {
  const participantNameMap = buildParticipantNameMap(selectedDuo, otherDuo);

  if (message.sender_id && participantNameMap[message.sender_id]) {
    return participantNameMap[message.sender_id];
  }

  return "Unknown Sender";
}

function buildPrivateThreadTitle(thread?: PrivateThreadWithDetails | null) {
  if (!thread) return "Private chat";
  const names = thread.participants
    .map((profile) => profile.full_name?.trim())
    .filter(Boolean);

  return names.length ? names.join(" & ") : "Private chat";
}

function buildPrivateParticipantNameMap(thread?: PrivateThreadWithDetails | null) {
  const nameMap: Record<string, string> = {};

  (thread?.participants || []).forEach((profile) => {
    nameMap[profile.id] = profile.full_name?.trim() || "Member";
  });

  return nameMap;
}

function SafeAvatarImage({
  src,
  alt,
  fallbackText,
  className,
}: {
  src?: string;
  alt: string;
  fallbackText: string;
  className?: string;
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
          minHeight: "180px",
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

function DuoTabButton({
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

function ProfileEditSection({
  title,
  form,
  onChange,
  onSave,
  saving,
  successMessage,
  errorMessage,
}: {
  title: string;
  form: EditProfileForm;
  onChange: (field: keyof EditProfileForm, value: string) => void;
  onSave: () => void;
  saving: boolean;
  successMessage: string;
  errorMessage: string;
}) {
  return (
    <section className="admin-mini-card">
      <div className="admin-section-header">
        <div>
          <h3 className="admin-section-title">{title}</h3>
          <p className="admin-section-subtitle">
            Edit this user profile safely from duo admin.
          </p>
        </div>
      </div>

      <div className="admin-form-grid">
        <div className="admin-field">
          <label className="admin-label">Full name</label>
          <input
            className="admin-input"
            value={form.full_name}
            onChange={(e) => onChange("full_name", e.target.value)}
          />
        </div>

        <div className="admin-field">
          <label className="admin-label">Age</label>
          <input
            className="admin-input"
            value={form.age}
            onChange={(e) => onChange("age", e.target.value)}
          />
        </div>

        <div className="admin-field">
          <label className="admin-label">City</label>
          <input
            className="admin-input"
            value={form.city}
            onChange={(e) => onChange("city", e.target.value)}
          />
        </div>

        <div className="admin-field">
          <label className="admin-label">Gender</label>
          <input
            className="admin-input"
            value={form.gender}
            onChange={(e) => onChange("gender", e.target.value)}
          />
        </div>

        <div className="admin-field">
          <label className="admin-label">Interested in</label>
          <input
            className="admin-input"
            value={form.interested_in}
            onChange={(e) => onChange("interested_in", e.target.value)}
          />
        </div>

        <div className="admin-field">
          <label className="admin-label">Height</label>
          <input
            className="admin-input"
            value={form.height}
            onChange={(e) => onChange("height", e.target.value)}
          />
        </div>

        <div className="admin-field">
          <label className="admin-label">Occupation</label>
          <input
            className="admin-input"
            value={form.occupation}
            onChange={(e) => onChange("occupation", e.target.value)}
          />
        </div>

        <div className="admin-field">
          <label className="admin-label">Education</label>
          <input
            className="admin-input"
            value={form.education}
            onChange={(e) => onChange("education", e.target.value)}
          />
        </div>

        <div className="admin-field">
          <label className="admin-label">School / University</label>
          <input
            className="admin-input"
            value={form.school}
            onChange={(e) => onChange("school", e.target.value)}
          />
        </div>

        <div className="admin-field">
          <label className="admin-label">Lifestyle</label>
          <input
            className="admin-input"
            value={form.lifestyle}
            onChange={(e) => onChange("lifestyle", e.target.value)}
          />
        </div>

        <div className="admin-field">
          <label className="admin-label">Dating mode</label>
          <input
            className="admin-input"
            value={form.dating_mode}
            onChange={(e) => onChange("dating_mode", e.target.value)}
          />
        </div>

        <div className="admin-field">
          <label className="admin-label">Vibe</label>
          <input
            className="admin-input"
            value={form.vibe}
            onChange={(e) => onChange("vibe", e.target.value)}
          />
        </div>

        <div className="admin-field">
          <label className="admin-label">Intent</label>
          <input
            className="admin-input"
            value={form.intent}
            onChange={(e) => onChange("intent", e.target.value)}
          />
        </div>

        <div className="admin-field admin-field-full">
          <label className="admin-label">Looking for</label>
          <input
            className="admin-input"
            value={form.looking_for}
            onChange={(e) => onChange("looking_for", e.target.value)}
          />
        </div>

        <div className="admin-field admin-field-full">
          <label className="admin-label">Bio</label>
          <textarea
            className="admin-textarea"
            value={form.bio}
            onChange={(e) => onChange("bio", e.target.value)}
          />
        </div>
      </div>

      {errorMessage ? <div className="admin-error-box">{errorMessage}</div> : null}
      {successMessage ? <div className="admin-success-box">{successMessage}</div> : null}

      <div className="admin-form-actions">
        <button
          type="button"
          className="admin-primary-button admin-button-fit"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving..." : `Save ${title}`}
        </button>
      </div>
    </section>
  );
}

function ProfileInfoCard({
  title,
  profile,
}: {
  title: string;
  profile?: ProfileLite | null;
}) {
  return (
    <article className="admin-mini-card">
      <div className="admin-user-title-row">
        <div>
          <h3 className="admin-section-title">
            {title}: {profile?.full_name || "Unnamed User"}
          </h3>
          <p className="admin-section-subtitle">Profile ID: {profile?.id || "—"}</p>
        </div>

        <div className="admin-badge-group">
          {profile?.is_admin ? (
            <span className="admin-status-chip admin-status-admin">Admin</span>
          ) : null}
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

      <div className="admin-kv-grid">
        <div className="admin-kv-item">
          <span className="admin-kv-label">Age</span>
          <span className="admin-kv-value">{formatValue(profile?.age)}</span>
        </div>
        <div className="admin-kv-item">
          <span className="admin-kv-label">City</span>
          <span className="admin-kv-value">{formatValue(profile?.city)}</span>
        </div>
        <div className="admin-kv-item">
          <span className="admin-kv-label">Gender</span>
          <span className="admin-kv-value">{formatValue(profile?.gender)}</span>
        </div>
        <div className="admin-kv-item">
          <span className="admin-kv-label">Interested In</span>
          <span className="admin-kv-value">{formatValue(profile?.interested_in)}</span>
        </div>
        <div className="admin-kv-item">
          <span className="admin-kv-label">Height</span>
          <span className="admin-kv-value">{formatValue(profile?.height)}</span>
        </div>
        <div className="admin-kv-item">
          <span className="admin-kv-label">Occupation</span>
          <span className="admin-kv-value">{formatValue(profile?.occupation)}</span>
        </div>
        <div className="admin-kv-item">
          <span className="admin-kv-label">Education</span>
          <span className="admin-kv-value">{formatValue(profile?.education)}</span>
        </div>
        <div className="admin-kv-item">
          <span className="admin-kv-label">Lifestyle</span>
          <span className="admin-kv-value">{formatValue(profile?.lifestyle)}</span>
        </div>
        <div className="admin-kv-item">
          <span className="admin-kv-label">Dating Mode</span>
          <span className="admin-kv-value">{formatValue(profile?.dating_mode)}</span>
        </div>
        <div className="admin-kv-item">
          <span className="admin-kv-label">Vibe</span>
          <span className="admin-kv-value">{formatValue(profile?.vibe)}</span>
        </div>
        <div className="admin-kv-item">
          <span className="admin-kv-label">Intent</span>
          <span className="admin-kv-value">{formatValue(profile?.intent)}</span>
        </div>
        <div className="admin-kv-item">
          <span className="admin-kv-label">Looking For</span>
          <span className="admin-kv-value">{formatValue(profile?.looking_for)}</span>
        </div>
        <div className="admin-kv-item">
          <span className="admin-kv-label">Created</span>
          <span className="admin-kv-value">{formatDate(profile?.created_at)}</span>
        </div>
        <div className="admin-kv-item">
          <span className="admin-kv-label">Last Seen</span>
          <span className="admin-kv-value">{formatDate(profile?.last_seen)}</span>
        </div>
      </div>

      <div className="admin-subsection-spacing">
        <h4 className="admin-section-title" style={{ fontSize: "16px" }}>Bio</h4>
        <div className="admin-info-box">
          <p className="admin-info-text">{profile?.bio?.trim() || "No bio added yet."}</p>
        </div>
      </div>

      <div className="admin-subsection-spacing">
        <h4 className="admin-section-title" style={{ fontSize: "16px" }}>Interests</h4>
        {profile?.interests && profile.interests.length > 0 ? (
          <div className="admin-tag-wrap">
            {profile.interests.map((interest, index) => (
              <span key={`${interest}-${index}`} className="admin-tag">
                {formatValue(interest)}
              </span>
            ))}
          </div>
        ) : (
          <p className="admin-section-subtitle">No interests saved.</p>
        )}
      </div>
    </article>
  );
}

export default function AdminDuoPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [duos, setDuos] = useState<DuoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [duoPage, setDuoPage] = useState(1);
  const [duoAccountTotal, setDuoAccountTotal] = useState(0);
  const [duoResultTotal, setDuoResultTotal] = useState(0);
  const [selectedDuoId, setSelectedDuoId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<DuoTabKey>("overview");

  const [user1Form, setUser1Form] = useState<EditProfileForm>(getInitialEditForm(null));
  const [user2Form, setUser2Form] = useState<EditProfileForm>(getInitialEditForm(null));

  const [savingUser1, setSavingUser1] = useState(false);
  const [savingUser2, setSavingUser2] = useState(false);
  const [updatingProfileId, setUpdatingProfileId] = useState("");
  const [actionsSuccess, setActionsSuccess] = useState("");
  const [actionsError, setActionsError] = useState("");

  const [user1Success, setUser1Success] = useState("");
  const [user2Success, setUser2Success] = useState("");
  const [user1Error, setUser1Error] = useState("");
  const [user2Error, setUser2Error] = useState("");

  const [selectedDuoMatches, setSelectedDuoMatches] = useState<DuoMatchWithDetails[]>([]);
  const [loadingSelectedDuoMatches, setLoadingSelectedDuoMatches] = useState(false);
  const [selectedDuoMatchesError, setSelectedDuoMatchesError] = useState("");

  const [selectedConversationId, setSelectedConversationId] = useState<string>("");
  const [selectedChatKind, setSelectedChatKind] = useState<ChatSelectionKind>("duo");
  const [selectedPrivateThreadId, setSelectedPrivateThreadId] = useState<string>("");
  const [conversationMessages, setConversationMessages] = useState<DuoMessageRow[]>([]);
  const [loadingConversationMessages, setLoadingConversationMessages] = useState(false);
  const [conversationMessagesError, setConversationMessagesError] = useState("");
  const [conversationPreviews, setConversationPreviews] = useState<Record<string, ConversationPreview>>({});
  const [privateThreads, setPrivateThreads] = useState<PrivateThreadWithDetails[]>([]);
  const [privateThreadPreviews, setPrivateThreadPreviews] = useState<Record<string, ConversationPreview>>({});
  const [privateThreadsError, setPrivateThreadsError] = useState("");
  const [loadingPrivateThreads, setLoadingPrivateThreads] = useState(false);
  const [photoViewer, setPhotoViewer] = useState<PhotoViewerState | null>(null);

  useEffect(() => {
    const verifyAccess = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const email = session?.user?.email?.toLowerCase() ?? "";

      if (!email || !isAllowedAdminEmail(email)) {
        router.replace("/admin");
      } else {
        setCheckingAccess(false);
      }
    };

    verifyAccess();
  }, [router]);

  useEffect(() => {
    if (checkingAccess) return;
    void loadDuos(duoPage, debouncedSearchTerm);
  }, [checkingAccess, debouncedSearchTerm, duoPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setDuoPage(1);
  }, [debouncedSearchTerm]);

  const loadDuos = async (page: number, search: string) => {
    try {
      setLoading(true);
      setLoadingError("");

      const query = sanitizeAdminSearch(search);
      const globalCountResult = await supabase
        .from("duos")
        .select("id", { count: "exact", head: true });
      if (globalCountResult.error) throw globalCountResult.error;
      setDuoAccountTotal(globalCountResult.count || 0);

      let matchingDuoIds: string[] | null = null;
      if (query) {
        const matchingProfiles = await findMatchingProfileIds(query, "duo");
        const duoMatches = new Map<string, { id: string; created_at: string }>();
        for (let index = 0; index < matchingProfiles.length; index += ADMIN_SEARCH_ID_BATCH_SIZE) {
          const profileIds = matchingProfiles.slice(index, index + ADMIN_SEARCH_ID_BATCH_SIZE);
          const [user1Result, user2Result] = await Promise.all([
            supabase.from("duos").select("id, created_at").in("user1_id", profileIds),
            supabase.from("duos").select("id, created_at").in("user2_id", profileIds),
          ]);
          if (user1Result.error) throw user1Result.error;
          if (user2Result.error) throw user2Result.error;
          [...(user1Result.data || []), ...(user2Result.data || [])].forEach((duo) => {
            duoMatches.set(duo.id, duo as { id: string; created_at: string });
          });
        }
        if (UUID_PATTERN.test(query)) {
          const { data: idMatch, error: idError } = await supabase
            .from("duos")
            .select("id, created_at")
            .eq("id", query)
            .maybeSingle();
          if (idError) throw idError;
          if (idMatch) duoMatches.set(idMatch.id, idMatch as { id: string; created_at: string });
        }
        matchingDuoIds = Array.from(duoMatches.values())
          .sort((left, right) => {
            const dateDifference = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
            return dateDifference || left.id.localeCompare(right.id);
          })
          .map((duo) => duo.id);
      }

      const resultTotal = matchingDuoIds ? matchingDuoIds.length : globalCountResult.count || 0;
      const pageCount = Math.max(1, Math.ceil(resultTotal / ADMIN_ACCOUNT_PAGE_SIZE));
      setDuoResultTotal(resultTotal);
      if (page > pageCount) {
        setDuoPage(pageCount);
        return;
      }

      const from = (page - 1) * ADMIN_ACCOUNT_PAGE_SIZE;
      const pageIds = matchingDuoIds?.slice(from, from + ADMIN_ACCOUNT_PAGE_SIZE) || null;
      if (matchingDuoIds && !pageIds?.length) {
        setDuos([]);
        setSelectedDuoId("");
        return;
      }

      let request = supabase
        .from("duos")
        .select(`
          id,
          user1_id,
          user2_id,
          created_at,
          user1:profiles!duos_user1_id_fkey(
            id,
            full_name,
            age,
            photos,
            city,
            gender,
            interested_in,
            bio,
            height,
            occupation,
            education,
            prompts,
            lifestyle,
            dating_mode,
            vibe,
            intent,
            looking_for,
            interests,
            is_admin,
            is_banned,
            is_verified,
            created_at,
            last_seen
          ),
          user2:profiles!duos_user2_id_fkey(
            id,
            full_name,
            age,
            photos,
            city,
            gender,
            interested_in,
            bio,
            height,
            occupation,
            education,
            prompts,
            lifestyle,
            dating_mode,
            vibe,
            intent,
            looking_for,
            interests,
            is_admin,
            is_banned,
            is_verified,
            created_at,
            last_seen
          )
        `, { count: "exact" });

      request = pageIds
        ? request.in("id", pageIds)
        : request.range(from, from + ADMIN_ACCOUNT_PAGE_SIZE - 1);

      const { data, error } = await request
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

      if (error) {
        setLoadingError(error.message);
        setDuos([]);
        return;
      }

      const rows = normalizeDuoRows((data || []) as DuoQueryRow[]);
      setDuos(rows);

      if (rows.length > 0) {
        setSelectedDuoId((current) => {
          if (current && rows.some((row) => row.id === current)) return current;
          return rows[0].id;
        });
      } else {
        setSelectedDuoId("");
      }
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : "Could not load duos.");
    } finally {
      setLoading(false);
    }
  };

  const filteredDuos = duos;

  useEffect(() => {
    if (!selectedDuoId) return;

    const existsInFilter = filteredDuos.some((duo) => duo.id === selectedDuoId);

    if (!existsInFilter) {
      if (filteredDuos.length > 0) {
        setSelectedDuoId(filteredDuos[0].id);
      } else {
        setSelectedDuoId("");
      }
    }
  }, [filteredDuos, selectedDuoId]);

  const selectedDuo =
    filteredDuos.find((duo) => duo.id === selectedDuoId) ||
    duos.find((duo) => duo.id === selectedDuoId) ||
    null;

  useEffect(() => {
    setUser1Form(getInitialEditForm(selectedDuo?.user1 || null));
    setUser2Form(getInitialEditForm(selectedDuo?.user2 || null));
    setUser1Success("");
    setUser2Success("");
    setUser1Error("");
    setUser2Error("");
  }, [selectedDuoId, selectedDuo]);

  useEffect(() => {
    if (!selectedDuoId) {
      setSelectedDuoMatches([]);
      setSelectedConversationId("");
      setSelectedPrivateThreadId("");
      setSelectedChatKind("duo");
      setConversationMessages([]);
      setConversationPreviews({});
      setPrivateThreads([]);
      setPrivateThreadPreviews({});
      return;
    }

    const loadSelectedDuoMatches = async () => {
      try {
        setLoadingSelectedDuoMatches(true);
        setSelectedDuoMatchesError("");
        setSelectedConversationId("");
        setSelectedPrivateThreadId("");
        setSelectedChatKind("duo");
        setConversationMessages([]);
        setConversationPreviews({});

        const { data: matchRows, error: matchesError } = await supabase
          .from("duo_matches")
          .select("id, duo1_id, duo2_id")
          .or(`duo1_id.eq.${selectedDuoId},duo2_id.eq.${selectedDuoId}`);

        if (matchesError) {
          setSelectedDuoMatchesError(matchesError.message);
          setSelectedDuoMatches([]);
          return;
        }

        const normalizedMatches = ((matchRows || []) as DuoMatchRow[]).map((match) => {
          const otherDuoId =
            match.duo1_id === selectedDuoId ? match.duo2_id : match.duo1_id;

          return {
            ...match,
            other_duo_id: otherDuoId,
          };
        });

        const otherDuoIds = normalizedMatches
          .map((match) => match.other_duo_id)
          .filter(Boolean);

        let otherDuoMap = new Map<string, DuoRow>();

        if (otherDuoIds.length > 0) {
          const { data: otherDuosData, error: otherDuosError } = await supabase
            .from("duos")
            .select(`
              id,
              user1_id,
              user2_id,
              created_at,
              user1:profiles!duos_user1_id_fkey(
                id,
                full_name,
                age,
                photos,
                city,
                gender,
                interested_in,
                bio,
                height,
                occupation,
                education,
                prompts,
                lifestyle,
                dating_mode,
                vibe,
                intent,
                looking_for,
                interests,
                is_admin,
                is_banned,
                is_verified,
                created_at,
                last_seen
              ),
              user2:profiles!duos_user2_id_fkey(
                id,
                full_name,
                age,
                photos,
                city,
                gender,
                interested_in,
                bio,
                height,
                occupation,
                education,
                prompts,
                lifestyle,
                dating_mode,
                vibe,
                intent,
                looking_for,
                interests,
                is_admin,
                is_banned,
                is_verified,
                created_at,
                last_seen
              )
            `)
            .in("id", otherDuoIds);

          if (otherDuosError) {
            setSelectedDuoMatchesError(otherDuosError.message);
          }

          otherDuoMap = new Map(
            normalizeDuoRows((otherDuosData || []) as DuoQueryRow[]).map((duo) => [duo.id, duo])
          );
        }

        const finalMatches: DuoMatchWithDetails[] = normalizedMatches.map((match) => ({
          ...match,
          other_duo: otherDuoMap.get(match.other_duo_id) || null,
        }));

        setSelectedDuoMatches(finalMatches);

        if (finalMatches.length > 0) {
          setSelectedConversationId(finalMatches[0].id);
        }

        if (finalMatches.length > 0) {
          const matchIds = finalMatches.map((match) => match.id);

          const { data: allMessagesData, error: allMessagesError } = await supabase
            .from("duo_messages")
            .select("id, duo_match_id, sender_id, text, created_at")
            .in("duo_match_id", matchIds)
            .order("created_at", { ascending: false });

          if (!allMessagesError) {
            const previewMap: Record<string, ConversationPreview> = {};

            ((allMessagesData || []) as DuoMessageRow[]).forEach((message) => {
              const matchId = message.duo_match_id;
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
        setSelectedDuoMatchesError(
          error instanceof Error ? error.message : "Could not load duo matches."
        );
      } finally {
        setLoadingSelectedDuoMatches(false);
      }
    };

    loadSelectedDuoMatches();
  }, [selectedDuoId]);

  useEffect(() => {
    const selectedUserIds = [selectedDuo?.user1_id, selectedDuo?.user2_id].filter(
      (userId): userId is string => Boolean(userId)
    );

    if (!selectedDuoId || selectedUserIds.length === 0) {
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

        const [lowRes, highRes] = await Promise.all([
          supabase
            .from("private_threads")
            .select("id, participant_low_id, participant_high_id, source_mode, source_match_id, created_at, updated_at")
            .in("participant_low_id", selectedUserIds),
          supabase
            .from("private_threads")
            .select("id, participant_low_id, participant_high_id, source_mode, source_match_id, created_at, updated_at")
            .in("participant_high_id", selectedUserIds),
        ]);

        if (lowRes.error) throw lowRes.error;
        if (highRes.error) throw highRes.error;

        const rawThreads = [...(lowRes.data || []), ...(highRes.data || [])] as Omit<
          PrivateThreadWithDetails,
          "participants"
        >[];
        const threadMap = new Map(rawThreads.map((thread) => [thread.id, thread]));
        const threads = Array.from(threadMap.values());

        if (threads.length === 0) {
          return;
        }

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
              .select("id, full_name, age, photos, city")
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

        ((messageData || []) as DuoMessageRow[]).forEach((message) => {
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

        if (!selectedConversationId && finalThreads.length > 0) {
          setSelectedChatKind("private");
          setSelectedPrivateThreadId(finalThreads[0].id);
        }
      } catch (error) {
        setPrivateThreadsError(
          error instanceof Error ? error.message : "Could not load private chats."
        );
      } finally {
        setLoadingPrivateThreads(false);
      }
    };

    loadPrivateThreads();
  }, [selectedDuoId, selectedDuo?.user1_id, selectedDuo?.user2_id, selectedConversationId]);

  useEffect(() => {
    if (selectedChatKind !== "duo") return;

    if (!selectedConversationId) {
      setConversationMessages([]);
      return;
    }

    const loadConversationMessages = async () => {
      try {
        setLoadingConversationMessages(true);
        setConversationMessagesError("");

        const { data, error } = await supabase
          .from("duo_messages")
          .select("id, duo_match_id, sender_id, text, created_at")
          .eq("duo_match_id", selectedConversationId)
          .order("created_at", { ascending: true });

        if (error) {
          setConversationMessagesError(error.message);
          setConversationMessages([]);
          return;
        }

        setConversationMessages((data || []) as DuoMessageRow[]);
      } catch (error) {
        setConversationMessagesError(
          error instanceof Error ? error.message : "Could not load duo messages."
        );
      } finally {
        setLoadingConversationMessages(false);
      }
    };

    loadConversationMessages();
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

        setConversationMessages((data || []) as DuoMessageRow[]);
      } catch (error) {
        setConversationMessagesError(
          error instanceof Error ? error.message : "Could not load private messages."
        );
      } finally {
        setLoadingConversationMessages(false);
      }
    };

    loadPrivateMessages();
  }, [selectedPrivateThreadId, selectedChatKind]);

  useEffect(() => {
    if (!photoViewer) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPhotoViewer(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [photoViewer]);

  const handleUser1Change = (field: keyof EditProfileForm, value: string) => {
    setUser1Form((current) => ({
      ...current,
      [field]: value,
    }));
    setUser1Success("");
    setUser1Error("");
  };

  const handleUser2Change = (field: keyof EditProfileForm, value: string) => {
    setUser2Form((current) => ({
      ...current,
      [field]: value,
    }));
    setUser2Success("");
    setUser2Error("");
  };

  const buildProfileUpdatePayload = (form: EditProfileForm, profile?: ProfileLite | null) => {
    const trimmedAge = form.age.trim();
    let parsedAge: number | null = null;

    if (trimmedAge) {
      const numericAge = Number(trimmedAge);
      if (Number.isNaN(numericAge) || numericAge < 18 || numericAge > 100) {
        throw new Error("Age must be between 18 and 100.");
      }
      parsedAge = numericAge;
    }

    return {
      full_name: form.full_name.trim() || null,
      age: parsedAge,
      city: form.city.trim() || null,
      gender: form.gender.trim() || null,
      interested_in: form.interested_in.trim() || null,
      bio: form.bio.trim() || null,
      height: form.height.trim() || null,
      occupation: form.occupation.trim() || null,
      education: form.education.trim() || null,
      prompts: updateSchoolPrompt(profile?.prompts, form.school),
      lifestyle: form.lifestyle.trim() || null,
      dating_mode: form.dating_mode.trim() || null,
      vibe: form.vibe.trim() || null,
      intent: form.intent.trim() || null,
      looking_for: form.looking_for.trim() || null,
    };
  };

  const handleSaveUser1 = async () => {
    if (!selectedDuo?.user1?.id) return;

    try {
      setSavingUser1(true);
      setUser1Success("");
      setUser1Error("");

      const payload = buildProfileUpdatePayload(user1Form, selectedDuo.user1);

      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", selectedDuo.user1.id);

      if (error) {
        setUser1Error(error.message);
        return;
      }

      setDuos((current) =>
        current.map((duo) =>
          duo.id === selectedDuo.id
            ? {
                ...duo,
                user1: {
                  ...(duo.user1 || {}),
                  ...payload,
                  id: duo.user1?.id || selectedDuo.user1!.id,
                  photos: duo.user1?.photos || [],
                  interests: duo.user1?.interests || [],
                  is_admin: duo.user1?.is_admin ?? false,
                  is_banned: duo.user1?.is_banned ?? false,
                  is_verified: duo.user1?.is_verified ?? false,
                  created_at: duo.user1?.created_at ?? null,
                  last_seen: duo.user1?.last_seen ?? null,
                },
              }
            : duo
        )
      );

      setUser1Success("User 1 profile updated successfully.");
    } catch (error) {
      setUser1Error(error instanceof Error ? error.message : "Could not save user 1.");
    } finally {
      setSavingUser1(false);
    }
  };

  const handleSaveUser2 = async () => {
    if (!selectedDuo?.user2?.id) return;

    try {
      setSavingUser2(true);
      setUser2Success("");
      setUser2Error("");

      const payload = buildProfileUpdatePayload(user2Form, selectedDuo.user2);

      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", selectedDuo.user2.id);

      if (error) {
        setUser2Error(error.message);
        return;
      }

      setDuos((current) =>
        current.map((duo) =>
          duo.id === selectedDuo.id
            ? {
                ...duo,
                user2: {
                  ...(duo.user2 || {}),
                  ...payload,
                  id: duo.user2?.id || selectedDuo.user2!.id,
                  photos: duo.user2?.photos || [],
                  interests: duo.user2?.interests || [],
                  is_admin: duo.user2?.is_admin ?? false,
                  is_banned: duo.user2?.is_banned ?? false,
                  is_verified: duo.user2?.is_verified ?? false,
                  created_at: duo.user2?.created_at ?? null,
                  last_seen: duo.user2?.last_seen ?? null,
                },
              }
            : duo
        )
      );

      setUser2Success("User 2 profile updated successfully.");
    } catch (error) {
      setUser2Error(error instanceof Error ? error.message : "Could not save user 2.");
    } finally {
      setSavingUser2(false);
    }
  };

  const updateDuoProfileFlag = async (
    profileId: string,
    key: "is_verified" | "is_banned",
    value: boolean
  ) => {
    if (!selectedDuo?.id) return;

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

      setDuos((current) =>
        current.map((duo) => {
          if (duo.id !== selectedDuo.id) return duo;

          return {
            ...duo,
            user1:
              duo.user1?.id === profileId
                ? { ...duo.user1, [key]: value }
                : duo.user1,
            user2:
              duo.user2?.id === profileId
                ? { ...duo.user2, [key]: value }
                : duo.user2,
          };
        })
      );

      setActionsSuccess("Duo member action saved.");
    } catch (error) {
      setActionsError(error instanceof Error ? error.message : "Could not update member.");
    } finally {
      setUpdatingProfileId("");
    }
  };

  const selectedConversation =
    selectedDuoMatches.find((match) => match.id === selectedConversationId) || null;
  const selectedPrivateThread =
    privateThreads.find((thread) => thread.id === selectedPrivateThreadId) || null;
  const selectedPrivateParticipantNameMap = buildPrivateParticipantNameMap(selectedPrivateThread);

  const renderOverviewTab = () => {
    if (!selectedDuo) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No duo selected</h3>
          <p className="admin-section-subtitle">
            Pick a duo from the left side to view full details.
          </p>
        </div>
      );
    }

    const user1Photo = getFirstValidPhoto(selectedDuo.user1);
    const user2Photo = getFirstValidPhoto(selectedDuo.user2);

    return (
      <section className="admin-user-detail-grid">
        <article className="admin-mini-card">
          <div className="admin-section-header">
            <div>
              <h3 className="admin-section-title">Duo summary</h3>
              <p className="admin-section-subtitle">Both users shown together in one admin panel.</p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              gap: 16,
              alignItems: "center",
            }}
          >
            <div className="admin-user-card" style={{ cursor: "default" }}>
              <div className="admin-user-card-top">
                <div className="admin-user-avatar">
                  <SafeAvatarImage
                    src={user1Photo}
                    alt={selectedDuo.user1?.full_name || "User 1"}
                    className="admin-user-avatar-image"
                    fallbackText={getInitialLetter(selectedDuo.user1?.full_name)}
                  />
                </div>
                <div className="admin-user-card-main">
                  <div className="admin-user-card-title-row">
                    <h3 className="admin-user-card-name">
                      {selectedDuo.user1?.full_name || "Unnamed User"}
                    </h3>
                    {selectedDuo.user1?.is_verified ? (
                      <span className="admin-user-verified-dot">✓</span>
                    ) : null}
                  </div>
                  <p className="admin-user-card-subline">
                    {formatValue(selectedDuo.user1?.age)} • {formatValue(selectedDuo.user1?.city)}
                  </p>
                  <p className="admin-user-card-subline">
                    {formatValue(selectedDuo.user1?.dating_mode)}
                  </p>
                </div>
              </div>
            </div>

            <div
              style={{
                fontWeight: 900,
                fontSize: 22,
                color: "#E85D8E",
                textAlign: "center",
              }}
            >
              &
            </div>

            <div className="admin-user-card" style={{ cursor: "default" }}>
              <div className="admin-user-card-top">
                <div className="admin-user-avatar">
                  <SafeAvatarImage
                    src={user2Photo}
                    alt={selectedDuo.user2?.full_name || "User 2"}
                    className="admin-user-avatar-image"
                    fallbackText={getInitialLetter(selectedDuo.user2?.full_name)}
                  />
                </div>
                <div className="admin-user-card-main">
                  <div className="admin-user-card-title-row">
                    <h3 className="admin-user-card-name">
                      {selectedDuo.user2?.full_name || "Unnamed User"}
                    </h3>
                    {selectedDuo.user2?.is_verified ? (
                      <span className="admin-user-verified-dot">✓</span>
                    ) : null}
                  </div>
                  <p className="admin-user-card-subline">
                    {formatValue(selectedDuo.user2?.age)} • {formatValue(selectedDuo.user2?.city)}
                  </p>
                  <p className="admin-user-card-subline">
                    {formatValue(selectedDuo.user2?.dating_mode)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="admin-kv-grid" style={{ marginTop: 18 }}>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Duo ID</span>
              <span className="admin-kv-value">{selectedDuo.id}</span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">Created</span>
              <span className="admin-kv-value">{formatDate(selectedDuo.created_at)}</span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">User 1 ID</span>
              <span className="admin-kv-value">{selectedDuo.user1_id}</span>
            </div>
            <div className="admin-kv-item">
              <span className="admin-kv-label">User 2 ID</span>
              <span className="admin-kv-value">{selectedDuo.user2_id}</span>
            </div>
          </div>
        </article>

        <article className="admin-mini-card">
          <h3 className="admin-section-title">Quick notes</h3>
          <ul className="admin-list">
            <li>One duo card now opens both users together</li>
            <li>Full user info is available in Profiles tab</li>
            <li>All duo photos are available in Photos tab</li>
            <li>Both users can be edited separately in Edit tab</li>
            <li>Duo matches are available in Matches tab</li>
            <li>4-person duo chat is readable in Chats tab</li>
          </ul>
        </article>
      </section>
    );
  };

  const renderProfilesTab = () => {
    if (!selectedDuo) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No duo selected</h3>
          <p className="admin-section-subtitle">Pick a duo first.</p>
        </div>
      );
    }

    return (
      <div className="admin-user-detail-grid">
        <ProfileInfoCard title="User 1" profile={selectedDuo.user1} />
        <ProfileInfoCard title="User 2" profile={selectedDuo.user2} />
      </div>
    );
  };

  const renderPhotosTab = () => {
    if (!selectedDuo) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No duo selected</h3>
          <p className="admin-section-subtitle">Pick a duo first.</p>
        </div>
      );
    }

    const user1Photos = selectedDuo.user1?.photos || [];
    const user2Photos = selectedDuo.user2?.photos || [];

    return (
      <div className="admin-user-detail-grid">
        <section className="admin-mini-card">
          <div className="admin-section-header">
            <div>
              <h3 className="admin-section-title">User 1 Photos</h3>
              <p className="admin-section-subtitle">
                {selectedDuo.user1?.full_name || "User 1"} photo gallery
              </p>
            </div>
            <AdminPhotoUpload
              profileId={selectedDuo.user1?.id}
              currentPhotoCount={user1Photos.length}
              onUploaded={(photos) =>
                setDuos((current) =>
                  current.map((duo) =>
                    duo.id === selectedDuo.id && duo.user1
                      ? { ...duo, user1: { ...duo.user1, photos } }
                      : duo
                  )
                )
              }
            />
          </div>

          {user1Photos.length > 0 ? (
            <div className="admin-photo-grid-large">
              {user1Photos.map((photo, index) => (
                <div className="admin-photo-item" key={`${photo}-${index}`}>
                  <button
                    type="button"
                    className="admin-photo-card-large admin-photo-card-button"
                    onClick={() =>
                      setPhotoViewer({
                        src: photo,
                        alt: `${selectedDuo.user1?.full_name || "User 1"} photo ${index + 1}`,
                        title: selectedDuo.user1?.full_name || "User 1 photo",
                        meta: `Photo ${index + 1} of ${user1Photos.length}`,
                      })
                    }
                  >
                    <SafePhotoImage
                      src={photo}
                      alt={`User 1 photo ${index + 1}`}
                      className="admin-photo-image-large"
                    />
                  </button>
                  <AdminPhotoEditButton
                    profileId={selectedDuo.user1!.id}
                    photoUrl={photo}
                    onUpdated={(photos) =>
                      setDuos((current) =>
                        current.map((duo) =>
                          duo.id === selectedDuo.id && duo.user1
                            ? { ...duo, user1: { ...duo.user1, photos } }
                            : duo
                        )
                      )
                    }
                  />
                  <AdminPhotoDeleteButton
                    profileId={selectedDuo.user1!.id}
                    photoUrl={photo}
                    onDeleted={(photos) =>
                      setDuos((current) =>
                        current.map((duo) =>
                          duo.id === selectedDuo.id && duo.user1
                            ? { ...duo, user1: { ...duo.user1, photos } }
                            : duo
                        )
                      )
                    }
                  />
                  <AdminPhotoOrderControls
                    profileId={selectedDuo.user1!.id}
                    photos={user1Photos}
                    photoIndex={index}
                    onReordered={(photos) =>
                      setDuos((current) =>
                        current.map((duo) =>
                          duo.id === selectedDuo.id && duo.user1
                            ? { ...duo, user1: { ...duo.user1, photos } }
                            : duo
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
              <p className="admin-section-subtitle">This user has no profile photos yet.</p>
            </div>
          )}
        </section>

        <section className="admin-mini-card">
          <div className="admin-section-header">
            <div>
              <h3 className="admin-section-title">User 2 Photos</h3>
              <p className="admin-section-subtitle">
                {selectedDuo.user2?.full_name || "User 2"} photo gallery
              </p>
            </div>
            <AdminPhotoUpload
              profileId={selectedDuo.user2?.id}
              currentPhotoCount={user2Photos.length}
              onUploaded={(photos) =>
                setDuos((current) =>
                  current.map((duo) =>
                    duo.id === selectedDuo.id && duo.user2
                      ? { ...duo, user2: { ...duo.user2, photos } }
                      : duo
                  )
                )
              }
            />
          </div>

          {user2Photos.length > 0 ? (
            <div className="admin-photo-grid-large">
              {user2Photos.map((photo, index) => (
                <div className="admin-photo-item" key={`${photo}-${index}`}>
                  <button
                    type="button"
                    className="admin-photo-card-large admin-photo-card-button"
                    onClick={() =>
                      setPhotoViewer({
                        src: photo,
                        alt: `${selectedDuo.user2?.full_name || "User 2"} photo ${index + 1}`,
                        title: selectedDuo.user2?.full_name || "User 2 photo",
                        meta: `Photo ${index + 1} of ${user2Photos.length}`,
                      })
                    }
                  >
                    <SafePhotoImage
                      src={photo}
                      alt={`User 2 photo ${index + 1}`}
                      className="admin-photo-image-large"
                    />
                  </button>
                  <AdminPhotoEditButton
                    profileId={selectedDuo.user2!.id}
                    photoUrl={photo}
                    onUpdated={(photos) =>
                      setDuos((current) =>
                        current.map((duo) =>
                          duo.id === selectedDuo.id && duo.user2
                            ? { ...duo, user2: { ...duo.user2, photos } }
                            : duo
                        )
                      )
                    }
                  />
                  <AdminPhotoDeleteButton
                    profileId={selectedDuo.user2!.id}
                    photoUrl={photo}
                    onDeleted={(photos) =>
                      setDuos((current) =>
                        current.map((duo) =>
                          duo.id === selectedDuo.id && duo.user2
                            ? { ...duo, user2: { ...duo.user2, photos } }
                            : duo
                        )
                      )
                    }
                  />
                  <AdminPhotoOrderControls
                    profileId={selectedDuo.user2!.id}
                    photos={user2Photos}
                    photoIndex={index}
                    onReordered={(photos) =>
                      setDuos((current) =>
                        current.map((duo) =>
                          duo.id === selectedDuo.id && duo.user2
                            ? { ...duo, user2: { ...duo.user2, photos } }
                            : duo
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
              <p className="admin-section-subtitle">This user has no profile photos yet.</p>
            </div>
          )}
        </section>
      </div>
    );
  };

  const renderEditTab = () => {
    if (!selectedDuo) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No duo selected</h3>
          <p className="admin-section-subtitle">Pick a duo first.</p>
        </div>
      );
    }

    return (
      <div className="admin-user-detail-grid">
        <ProfileEditSection
          title={`Edit User 1${selectedDuo.user1?.full_name ? ` (${selectedDuo.user1.full_name})` : ""}`}
          form={user1Form}
          onChange={handleUser1Change}
          onSave={handleSaveUser1}
          saving={savingUser1}
          successMessage={user1Success}
          errorMessage={user1Error}
        />

        <ProfileEditSection
          title={`Edit User 2${selectedDuo.user2?.full_name ? ` (${selectedDuo.user2.full_name})` : ""}`}
          form={user2Form}
          onChange={handleUser2Change}
          onSave={handleSaveUser2}
          saving={savingUser2}
          successMessage={user2Success}
          errorMessage={user2Error}
        />
      </div>
    );
  };

  const renderActionsTab = () => {
    if (!selectedDuo) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No duo selected</h3>
          <p className="admin-section-subtitle">Pick a duo first.</p>
        </div>
      );
    }

    const memberCards = [
      { label: "User 1", profile: selectedDuo.user1 },
      { label: "User 2", profile: selectedDuo.user2 },
    ];

    return (
      <section className="admin-mini-card">
        <div className="admin-section-header">
          <div>
            <h3 className="admin-section-title">Duo admin actions</h3>
            <p className="admin-section-subtitle">
              Verify, ban, or open account controls for each member in this duo.
            </p>
          </div>
        </div>

        {actionsError ? <div className="admin-error-box">{actionsError}</div> : null}
        {actionsSuccess ? <div className="admin-success-box">{actionsSuccess}</div> : null}

        <div className="admin-actions-grid">
          {memberCards.map(({ label, profile }) => (
            <article key={label} className="admin-mini-card">
              <div className="admin-user-title-row">
                <div>
                  <h4 className="admin-section-title" style={{ fontSize: 18 }}>
                    {label}: {profile?.full_name || "Unnamed member"}
                  </h4>
                  <p className="admin-section-subtitle">Profile ID: {profile?.id || "-"}</p>
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

              {profile?.id ? (
                <div className="admin-action-stack">
                  <button
                    type="button"
                    className="admin-primary-button"
                    disabled={updatingProfileId === profile.id}
                    onClick={() =>
                      updateDuoProfileFlag(profile.id, "is_verified", !profile.is_verified)
                    }
                  >
                    {profile.is_verified ? "Remove verified tick" : "Give verified tick"}
                  </button>
                  <button
                    type="button"
                    className="admin-secondary-button"
                    disabled={updatingProfileId === profile.id}
                    onClick={() =>
                      updateDuoProfileFlag(profile.id, "is_banned", !profile.is_banned)
                    }
                  >
                    {profile.is_banned ? "Unban member" : "Ban member"}
                  </button>
                  <button
                    type="button"
                    className="admin-secondary-button"
                    onClick={() => router.push("/accounts")}
                  >
                    Open account tools
                  </button>
                </div>
              ) : (
                <p className="admin-section-subtitle">This member profile is not loaded.</p>
              )}
            </article>
          ))}
        </div>
      </section>
    );
  };

  const renderMatchesTab = () => {
    if (!selectedDuo) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No duo selected</h3>
          <p className="admin-section-subtitle">Pick a duo first.</p>
        </div>
      );
    }

    return (
      <section className="admin-mini-card">
        <div className="admin-section-header">
          <div>
            <h3 className="admin-section-title">Duo matches</h3>
            <p className="admin-section-subtitle">
              Match list for {buildDuoDisplayName(selectedDuo)}.
            </p>
          </div>
        </div>

        {selectedDuoMatchesError ? (
          <div className="admin-error-box">{selectedDuoMatchesError}</div>
        ) : null}

        {loadingSelectedDuoMatches ? (
          <div className="admin-empty-card">
            <h3 className="admin-section-title">Loading duo matches...</h3>
            <p className="admin-section-subtitle">
              Please wait while match data is loading.
            </p>
          </div>
        ) : selectedDuoMatches.length === 0 ? (
          <div className="admin-empty-card">
            <h3 className="admin-section-title">No duo matches yet</h3>
            <p className="admin-section-subtitle">
              This duo currently has no matches.
            </p>
          </div>
        ) : (
          <div
            className="admin-match-list-compact"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "12px",
            }}
          >
            {selectedDuoMatches.map((match) => {
              const otherDuo = match.other_duo;
              const otherUser1Photo = getFirstValidPhoto(otherDuo?.user1);
              const otherUser2Photo = getFirstValidPhoto(otherDuo?.user2);
              const isSelected = selectedConversationId === match.id;

              return (
                <button
                  key={match.id}
                  type="button"
                  className={`admin-user-card ${isSelected ? "admin-user-card-active" : ""}`}
                  style={{ padding: "12px", textAlign: "left" }}
                  onClick={() => {
                    setSelectedConversationId(match.id);
                    setActiveTab("chats");
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto 1fr",
                      gap: "10px",
                      alignItems: "center",
                      width: "100%",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <div className="admin-user-avatar" style={{ width: 38, height: 38 }}>
                        <SafeAvatarImage
                          src={otherUser1Photo}
                          alt={otherDuo?.user1?.full_name || "User 1"}
                          className="admin-user-avatar-image"
                          fallbackText={getInitialLetter(otherDuo?.user1?.full_name)}
                        />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p
                          style={{
                            fontWeight: 700,
                            fontSize: 13,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {otherDuo?.user1?.full_name || "User 1"}
                        </p>
                      </div>
                    </div>

                    <div style={{ fontWeight: 900, color: "#E85D8E", textAlign: "center" }}>
                      &
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <div className="admin-user-avatar" style={{ width: 38, height: 38 }}>
                        <SafeAvatarImage
                          src={otherUser2Photo}
                          alt={otherDuo?.user2?.full_name || "User 2"}
                          className="admin-user-avatar-image"
                          fallbackText={getInitialLetter(otherDuo?.user2?.full_name)}
                        />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p
                          style={{
                            fontWeight: 700,
                            fontSize: 13,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {otherDuo?.user2?.full_name || "User 2"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontWeight: 800, fontSize: 14 }}>
                      {buildDuoDisplayName(otherDuo)}
                    </p>
                    <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                      {buildDuoMetaLine(otherDuo)}
                    </p>
                    <p style={{ fontSize: 11, color: "#999", marginTop: 8 }}>
                      Match ID: {match.id}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  const renderChatsTab = () => {
    if (!selectedDuo) {
      return (
        <div className="admin-empty-card">
          <h3 className="admin-section-title">No duo selected</h3>
          <p className="admin-section-subtitle">Pick a duo first.</p>
        </div>
      );
    }

    return (
      <section className="admin-chat-layout">
        <aside className="admin-mini-card admin-chat-conversation-list">
          <div className="admin-section-header">
            <div>
              <h3 className="admin-section-title">Duo conversations</h3>
              <p className="admin-section-subtitle">
                4-person group chats for this duo.
              </p>
            </div>
          </div>

          {selectedDuoMatchesError ? (
            <div className="admin-error-box">{selectedDuoMatchesError}</div>
          ) : null}

          {loadingSelectedDuoMatches ? (
            <p className="admin-section-subtitle">Loading conversations...</p>
          ) : selectedDuoMatches.length === 0 ? (
            <p className="admin-section-subtitle">No duo conversations found.</p>
          ) : (
            <div className="admin-user-list">
              {selectedDuoMatches.map((match) => {
                const otherDuo = match.other_duo;
                const previewPhoto = getFirstValidPhoto(otherDuo?.user1) || getFirstValidPhoto(otherDuo?.user2);
                const isActive = selectedChatKind === "duo" && selectedConversationId === match.id;
                const preview = conversationPreviews[match.id];

                return (
                  <button
                    key={match.id}
                    type="button"
                    className={`admin-user-card ${isActive ? "admin-user-card-active" : ""}`}
                    onClick={() => {
                      setSelectedChatKind("duo");
                      setSelectedConversationId(match.id);
                    }}
                  >
                    <div className="admin-user-card-top">
                      <div className="admin-user-avatar">
                        <SafeAvatarImage
                          src={previewPhoto}
                          alt={buildDuoDisplayName(otherDuo)}
                          className="admin-user-avatar-image"
                          fallbackText={getInitialLetter(buildDuoDisplayName(otherDuo))}
                        />
                      </div>

                      <div className="admin-user-card-main">
                        <div className="admin-user-card-title-row">
                          <h3 className="admin-user-card-name">
                            {buildDuoDisplayName(otherDuo)}
                          </h3>
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

          <div className="admin-section-header" style={{ marginTop: 22 }}>
            <div>
              <h3 className="admin-section-title">Private member chats</h3>
              <p className="admin-section-subtitle">
                Member-to-member private chats connected to this duo.
              </p>
            </div>
          </div>

          {privateThreadsError ? (
            <div className="admin-error-box">{privateThreadsError}</div>
          ) : null}

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
                const firstPhoto = getFirstValidPhoto(thread.participants[0]);

                return (
                  <button
                    key={thread.id}
                    type="button"
                    className={`admin-user-card ${isActive ? "admin-user-card-active" : ""}`}
                    onClick={() => {
                      setSelectedChatKind("private");
                      setSelectedPrivateThreadId(thread.id);
                    }}
                  >
                    <div className="admin-user-card-top">
                      <div className="admin-user-avatar">
                        <SafeAvatarImage
                          src={firstPhoto}
                          alt={buildPrivateThreadTitle(thread)}
                          className="admin-user-avatar-image"
                          fallbackText={getInitialLetter(buildPrivateThreadTitle(thread))}
                        />
                      </div>

                      <div className="admin-user-card-main">
                        <div className="admin-user-card-title-row">
                          <h3 className="admin-user-card-name">
                            {buildPrivateThreadTitle(thread)}
                          </h3>
                        </div>

                        <p className="admin-user-card-subline">
                          {getConversationPreviewText(preview?.text)}
                        </p>

                        <p className="admin-user-card-subline">
                          {preview?.created_at
                            ? formatDate(preview.created_at)
                            : `Thread ID: ${thread.id}`}
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
                {selectedChatKind === "private"
                  ? "Read-only private member chat history."
                  : "Read-only 4-person duo chat history."}
              </p>
            </div>
          </div>

          {conversationMessagesError ? (
            <div className="admin-error-box">{conversationMessagesError}</div>
          ) : null}

          {selectedChatKind === "duo" && !selectedConversation ? (
            <div className="admin-empty-card">
              <h3 className="admin-section-title">No conversation selected</h3>
              <p className="admin-section-subtitle">
                Choose a duo conversation from the left side.
              </p>
            </div>
          ) : selectedChatKind === "private" && !selectedPrivateThread ? (
            <div className="admin-empty-card">
              <h3 className="admin-section-title">No private chat selected</h3>
              <p className="admin-section-subtitle">
                Choose a private member chat from the left side.
              </p>
            </div>
          ) : loadingConversationMessages ? (
            <div className="admin-empty-card">
              <h3 className="admin-section-title">Loading messages...</h3>
              <p className="admin-section-subtitle">
                Please wait while duo chat history is loading.
              </p>
            </div>
          ) : conversationMessages.length === 0 ? (
            <div className="admin-empty-card">
              <h3 className="admin-section-title">No messages yet</h3>
              <p className="admin-section-subtitle">
                This duo match exists, but no messages have been sent yet.
              </p>
            </div>
          ) : (
            <div className="admin-chat-message-list">
              {conversationMessages.map((message) => {
                const senderName =
                  selectedChatKind === "private"
                    ? selectedPrivateParticipantNameMap[message.sender_id || ""] || "Member"
                    : getSenderDisplayName({
                        message,
                        selectedDuo,
                        otherDuo: selectedConversation?.other_duo,
                      });

                const isSelectedDuoMessage =
                  !!message.sender_id &&
                  [selectedDuo?.user1_id, selectedDuo?.user2_id].includes(message.sender_id);

                return (
                  <div
                    key={message.id}
                    className={`admin-chat-message ${
                      isSelectedDuoMessage
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

  if (checkingAccess) {
    return <div className="p-10">Checking access...</div>;
  }

  return (
    <main className="admin-dashboard-page">
      <div className="admin-dashboard-shell">
        <Header />

        {loadingError ? (
          <div className="admin-error-box admin-global-error">{loadingError}</div>
        ) : null}

        <section className="admin-workspace-grid">
          <aside className="admin-sidebar-card admin-users-panel">
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title">Duos</h2>
                <p className="admin-section-subtitle">
                  Each row is one duo profile, not two separate solo users.
                </p>
              </div>
            </div>

            <div className="admin-search-wrap">
              <input
                type="text"
                className="admin-input"
                placeholder="Search duo by name, city, bio, or duo id..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="admin-list-count-row" aria-live="polite">
              <span className="admin-list-count-primary">All Duos ({duoAccountTotal})</span>
              {debouncedSearchTerm.trim() ? (
                <span className="admin-list-count-filtered">
                  Search results ({duoResultTotal})
                </span>
              ) : null}
            </div>

            <div className="admin-user-list">
              {loading ? (
                <div className="admin-mini-card">
                  <h3 className="admin-section-title">Loading duos...</h3>
                  <p className="admin-section-subtitle">Please wait while duo data is loading.</p>
                </div>
              ) : filteredDuos.length === 0 ? (
                <div className="admin-mini-card">
                  <h3 className="admin-section-title">No duos found</h3>
                  <p className="admin-section-subtitle">Try another search term.</p>
                </div>
              ) : (
                filteredDuos.map((duo) => {
                  const isSelected = duo.id === selectedDuoId;
                  const user1Photo = getFirstValidPhoto(duo.user1);
                  const user2Photo = getFirstValidPhoto(duo.user2);

                  return (
                    <button
                      key={duo.id}
                      type="button"
                      className={`admin-user-card ${isSelected ? "admin-user-card-active" : ""}`}
                      onClick={() => setSelectedDuoId(duo.id)}
                    >
                      <div style={{ display: "flex", gap: 14, width: "100%", alignItems: "center" }}>
                        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 10, minWidth: 0 }}>
                          <div className="admin-user-avatar" style={{ width: 42, height: 42 }}>
                            <SafeAvatarImage
                              src={user1Photo}
                              alt={duo.user1?.full_name || "User 1"}
                              className="admin-user-avatar-image"
                              fallbackText={getInitialLetter(duo.user1?.full_name)}
                            />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p
                              style={{
                                fontWeight: 700,
                                fontSize: 14,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {duo.user1?.full_name || "User 1"}
                            </p>
                            <p style={{ fontSize: 12, color: "#666" }}>
                              {formatValue(duo.user1?.age)} • {formatValue(duo.user1?.city)}
                            </p>
                          </div>
                        </div>

                        <div style={{ fontWeight: 900, color: "#E85D8E" }}>&</div>

                        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 10, minWidth: 0 }}>
                          <div className="admin-user-avatar" style={{ width: 42, height: 42 }}>
                            <SafeAvatarImage
                              src={user2Photo}
                              alt={duo.user2?.full_name || "User 2"}
                              className="admin-user-avatar-image"
                              fallbackText={getInitialLetter(duo.user2?.full_name)}
                            />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p
                              style={{
                                fontWeight: 700,
                                fontSize: 14,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {duo.user2?.full_name || "User 2"}
                            </p>
                            <p style={{ fontSize: 12, color: "#666" }}>
                              {formatValue(duo.user2?.age)} • {formatValue(duo.user2?.city)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          fontSize: 11,
                          color: "#888",
                          width: "100%",
                          textAlign: "left",
                          flexWrap: "wrap",
                        }}
                      >
                        <span>Duo ID: {duo.id}</span>
                        <span>Created: {formatDate(duo.created_at)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <AdminPagination
              page={duoPage}
              pageSize={ADMIN_ACCOUNT_PAGE_SIZE}
              total={duoResultTotal}
              loading={loading}
              onPageChange={setDuoPage}
            />
          </aside>

          <section className="admin-main-card admin-detail-panel">
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title">Selected duo</h2>
                <p className="admin-section-subtitle">
                  Open both users together, view details, photos, edit each safely, and inspect duo matches/chats.
                </p>
              </div>
            </div>

            <div className="admin-tabs-row">
              <DuoTabButton
                label="Overview"
                isActive={activeTab === "overview"}
                onClick={() => setActiveTab("overview")}
              />
              <DuoTabButton
                label="Profiles"
                isActive={activeTab === "profiles"}
                onClick={() => setActiveTab("profiles")}
              />
              <DuoTabButton
                label="Photos"
                isActive={activeTab === "photos"}
                onClick={() => setActiveTab("photos")}
              />
              <DuoTabButton
                label="Edit"
                isActive={activeTab === "edit"}
                onClick={() => setActiveTab("edit")}
              />
              <DuoTabButton
                label="Actions"
                isActive={activeTab === "actions"}
                onClick={() => setActiveTab("actions")}
              />
              <DuoTabButton
                label="Matches"
                isActive={activeTab === "matches"}
                onClick={() => setActiveTab("matches")}
              />
              <DuoTabButton
                label="Chats"
                isActive={activeTab === "chats"}
                onClick={() => setActiveTab("chats")}
              />
            </div>

            <div className="admin-tab-content">
              {activeTab === "overview" ? renderOverviewTab() : null}
              {activeTab === "profiles" ? renderProfilesTab() : null}
              {activeTab === "photos" ? renderPhotosTab() : null}
              {activeTab === "edit" ? renderEditTab() : null}
              {activeTab === "actions" ? renderActionsTab() : null}
              {activeTab === "matches" ? renderMatchesTab() : null}
              {activeTab === "chats" ? renderChatsTab() : null}
            </div>
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
