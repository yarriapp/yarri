"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  CheckSquare2,
  ChevronDown,
  Filter,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Shuffle,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import Header from "@/components/Header";
import { isAllowedAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

type PromptRow = { question?: string; answer?: string };

type BulkProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  age: number | null;
  gender: string | null;
  dating_mode: string | null;
  city: string | null;
  state_region: string | null;
  country: string | null;
  prompts: PromptRow[] | string | null;
  photos: unknown;
  is_verified: boolean | null;
  is_banned: boolean | null;
  is_admin: boolean | null;
  created_at: string | null;
};

type Filters = {
  search: string;
  country: string;
  state: string;
  city: string;
  ethnicity: string;
  gender: string;
  mode: string;
  photoStatus: string;
  status: string;
  verification: string;
  ageMin: string;
  ageMax: string;
};

type BulkActionResponse = {
  error?: string;
  updatedIds?: string[];
  deletedIds?: string[];
  resolvedIds?: string[];
  protectedIds?: string[];
  failed?: Array<{ userId: string; error?: string }>;
  storageWarnings?: Array<{ userId: string; warning?: string }>;
  units?: {
    soloIds?: string[];
    duoIds?: string[];
    groupIds?: string[];
  };
};

type DeletePreview = {
  selectedCount: number;
  resolvedIds: string[];
  protectedIds: string[];
  soloIds: string[];
  duoIds: string[];
  groupIds: string[];
};

const emptyFilters: Filters = {
  search: "",
  country: "",
  state: "",
  city: "",
  ethnicity: "",
  gender: "",
  mode: "",
  photoStatus: "",
  status: "",
  verification: "",
  ageMin: "",
  ageMax: "",
};

function clean(value?: string | null) {
  return String(value || "").trim();
}

function getPrompts(value: BulkProfile["prompts"]): PromptRow[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getPromptAnswer(profile: BulkProfile, question: string) {
  return clean(
    getPrompts(profile.prompts).find(
      (prompt) => clean(prompt.question).toLowerCase() === question.toLowerCase()
    )?.answer
  );
}

function getProfilePhotos(value: BulkProfile["photos"]) {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim()
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  return candidates.filter((photo): photo is string => {
    if (typeof photo !== "string" || !photo.trim()) return false;
    try {
      const url = new URL(photo.trim());
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  });
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(clean).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );
}

function randomSample<T>(items: T[], count: number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy.slice(0, count);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
}

export default function BulkAccountsPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [profiles, setProfiles] = useState<BulkProfile[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [randomCount, setRandomCount] = useState("10");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<"disable" | "enable" | "preview-delete" | "delete" | "">("");
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const verifyAccess = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!isAllowedAdminEmail(session?.user?.email)) {
        router.replace("/admin");
        return;
      }
      setCheckingAccess(false);
    };
    void verifyAccess();
  }, [router]);

  const loadProfiles = async () => {
    try {
      setLoading(true);
      setError("");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Admin session expired. Sign in again.");

      const response = await fetch("/api/admin/bulk-accounts", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = (await response.json()) as { profiles?: BulkProfile[]; error?: string };
      if (!response.ok || !payload.profiles) {
        throw new Error(payload.error || "Could not load accounts.");
      }
      setProfiles(payload.profiles);
      setSelectedIds(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!checkingAccess) void loadProfiles();
  }, [checkingAccess]);

  const enrichedProfiles = useMemo(
    () => profiles.map((profile) => ({
      ...profile,
      ethnicity: getPromptAnswer(profile, "Ethnicity"),
      photoCount: getProfilePhotos(profile.photos).length,
    })),
    [profiles]
  );

  const options = useMemo(
    () => ({
      countries: uniqueValues(enrichedProfiles.map((profile) => profile.country)),
      states: uniqueValues(enrichedProfiles.map((profile) => profile.state_region)),
      cities: uniqueValues(enrichedProfiles.map((profile) => profile.city)),
      ethnicities: uniqueValues(enrichedProfiles.map((profile) => profile.ethnicity)),
      genders: uniqueValues(enrichedProfiles.map((profile) => profile.gender)),
      modes: uniqueValues(enrichedProfiles.map((profile) => profile.dating_mode)),
    }),
    [enrichedProfiles]
  );

  const filteredProfiles = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const minimumAge = filters.ageMin ? Number(filters.ageMin) : null;
    const maximumAge = filters.ageMax ? Number(filters.ageMax) : null;

    return enrichedProfiles.filter((profile) => {
      if (filters.country && clean(profile.country) !== filters.country) return false;
      if (filters.state && clean(profile.state_region) !== filters.state) return false;
      if (filters.city && clean(profile.city) !== filters.city) return false;
      if (filters.ethnicity && profile.ethnicity !== filters.ethnicity) return false;
      if (filters.gender && clean(profile.gender) !== filters.gender) return false;
      if (filters.mode && clean(profile.dating_mode) !== filters.mode) return false;
      const hasPictures = profile.photoCount > 0;
      if (filters.photoStatus === "with pictures" && !hasPictures) return false;
      if (filters.photoStatus === "without pictures" && hasPictures) return false;
      if (filters.status === "active" && profile.is_banned) return false;
      if (filters.status === "disabled" && !profile.is_banned) return false;
      if (filters.verification === "verified" && !profile.is_verified) return false;
      if (filters.verification === "unverified" && profile.is_verified) return false;
      if (minimumAge !== null && (profile.age === null || profile.age < minimumAge)) return false;
      if (maximumAge !== null && (profile.age === null || profile.age > maximumAge)) return false;
      if (query) {
        const haystack = [
          profile.full_name,
          profile.email,
          profile.city,
          profile.state_region,
          profile.country,
          profile.ethnicity,
          profile.gender,
          profile.dating_mode,
          profile.id,
        ]
          .map(clean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [enrichedProfiles, filters]);

  const eligibleFilteredProfiles = filteredProfiles.filter((profile) => !profile.is_admin);
  const visibleProfiles = filteredProfiles.slice(0, 500);
  const selectedProfiles = filteredProfiles.filter((profile) => selectedIds.has(profile.id) && !profile.is_admin);
  const disabledCount = profiles.filter((profile) => profile.is_banned).length;
  const activeFilterCount = Object.values(filters).filter((value) => value.trim()).length;

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setSelectedIds(new Set());
    setDeletePreview(null);
    setMessage("");
  };

  const clearFilters = () => {
    setFilters(emptyFilters);
    setSelectedIds(new Set());
    setDeletePreview(null);
    setMessage("");
  };

  const toggleProfile = (profile: BulkProfile) => {
    if (profile.is_admin) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(profile.id)) next.delete(profile.id);
      else next.add(profile.id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(eligibleFilteredProfiles.map((profile) => profile.id)));
    setMessage(`${eligibleFilteredProfiles.length} filtered account(s) selected.`);
  };

  const selectRandom = () => {
    const requested = Math.max(1, Math.floor(Number(randomCount) || 1));
    const count = Math.min(requested, eligibleFilteredProfiles.length);
    const selected = randomSample(eligibleFilteredProfiles, count);
    setSelectedIds(new Set(selected.map((profile) => profile.id)));
    setMessage(`${selected.length} random filtered account(s) selected.`);
  };

  const applyBulkAction = async (action: "disable" | "enable") => {
    const ids = selectedProfiles.map((profile) => profile.id);
    if (!ids.length) return;
    const label = action === "disable" ? "disable" : "restore";
    const confirmed = window.confirm(
      `${label.slice(0, 1).toUpperCase()}${label.slice(1)} ${ids.length} selected account(s)?`
    );
    if (!confirmed) return;

    try {
      setProcessing(action);
      setError("");
      setMessage("");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Admin session expired. Sign in again.");

      const updatedIds: string[] = [];
      const failures: Array<{ userId: string; error?: string }> = [];
      let protectedCount = 0;
      for (let index = 0; index < ids.length; index += 200) {
        const response = await fetch("/api/admin/bulk-accounts", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userIds: ids.slice(index, index + 200), action }),
        });
        const payload = (await response.json()) as BulkActionResponse;
        if (!response.ok) throw new Error(payload.error || "Bulk account update failed.");
        updatedIds.push(...(payload.updatedIds || []));
        failures.push(...(payload.failed || []));
        protectedCount += payload.protectedIds?.length || 0;
      }

      const updatedSet = new Set(updatedIds);
      setProfiles((current) =>
        current.map((profile) =>
          updatedSet.has(profile.id) ? { ...profile, is_banned: action === "disable" } : profile
        )
      );
      setSelectedIds(new Set());
      setMessage(
        `${updatedIds.length} account(s) ${action === "disable" ? "disabled" : "restored"}.` +
          (failures.length ? ` ${failures.length} failed.` : "") +
          (protectedCount ? ` ${protectedCount} protected account(s) skipped.` : "")
      );
      if (failures.length) {
        setError(failures.slice(0, 8).map((failure) => failure.error || failure.userId).join(" | "));
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Bulk account update failed.");
    } finally {
      setProcessing("");
    }
  };

  const prepareDelete = async () => {
    const ids = selectedProfiles.map((profile) => profile.id);
    if (!ids.length) return;

    try {
      setProcessing("preview-delete");
      setError("");
      setMessage("");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Admin session expired. Sign in again.");

      const response = await fetch("/api/admin/bulk-accounts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userIds: ids, action: "preview-delete" }),
      });
      const payload = (await response.json()) as BulkActionResponse;
      if (!response.ok) throw new Error(payload.error || "Could not prepare account deletion.");
      const resolvedIds = payload.resolvedIds || [];
      if (!resolvedIds.length) {
        throw new Error("No deletable accounts remain. Admin and protected shared accounts were skipped.");
      }

      setDeleteConfirmation("");
      setDeletePreview({
        selectedCount: ids.length,
        resolvedIds,
        protectedIds: payload.protectedIds || [],
        soloIds: payload.units?.soloIds || [],
        duoIds: payload.units?.duoIds || [],
        groupIds: payload.units?.groupIds || [],
      });
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Could not prepare account deletion.");
    } finally {
      setProcessing("");
    }
  };

  const confirmDelete = async () => {
    if (!deletePreview || deleteConfirmation !== "DELETE") return;

    try {
      setProcessing("delete");
      setError("");
      setMessage("");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Admin session expired. Sign in again.");

      const response = await fetch("/api/admin/bulk-accounts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userIds: deletePreview.resolvedIds, action: "delete" }),
      });
      const payload = (await response.json()) as BulkActionResponse;
      if (!response.ok) throw new Error(payload.error || "Permanent account deletion failed.");

      const deletedIds = payload.deletedIds || [];
      const deletedSet = new Set(deletedIds);
      setProfiles((current) => current.filter((profile) => !deletedSet.has(profile.id)));
      setSelectedIds(new Set());
      setDeletePreview(null);
      setDeleteConfirmation("");
      setMessage(
        `${deletedIds.length} login account(s) permanently deleted.` +
          ((payload.failed?.length || 0) ? ` ${payload.failed?.length} failed.` : "") +
          ((payload.protectedIds?.length || 0) ? ` ${payload.protectedIds?.length} protected account(s) skipped.` : "") +
          ((payload.storageWarnings?.length || 0) ? ` ${payload.storageWarnings?.length} storage cleanup warning(s).` : "")
      );
      if (payload.failed?.length) {
        setError(payload.failed.slice(0, 8).map((failure) => failure.error || failure.userId).join(" | "));
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Permanent account deletion failed.");
    } finally {
      setProcessing("");
    }
  };

  if (checkingAccess) return <div className="p-10">Checking access...</div>;

  return (
    <main className="admin-dashboard-page bulk-accounts-page">
      <div className="admin-dashboard-shell">
        <Header />

        <section className="bulk-account-summary" aria-label="Account summary">
          <div><span>Total accounts</span><strong>{profiles.length}</strong></div>
          <div><span>Filtered results</span><strong>{filteredProfiles.length}</strong></div>
          <div><span>Disabled</span><strong>{disabledCount}</strong></div>
          <div><span>Selected</span><strong>{selectedProfiles.length}</strong></div>
        </section>

        <details className="bulk-account-section bulk-collapsible-section" open>
          <summary className="bulk-collapse-summary">
            <span><Filter size={17} /> Account filters</span>
            <span>{activeFilterCount} active <ChevronDown size={18} /></span>
          </summary>
          <div className="bulk-collapse-body">
          <div className="bulk-account-heading">
            <div>
              <h2 id="bulk-filter-title">Build a precise account set</h2>
              <p>Filters only narrow the list. No account changes until you select users and confirm an action.</p>
            </div>
            <button type="button" className="bulk-secondary-button" onClick={() => void loadProfiles()} disabled={loading}>
              <RefreshCw size={16} className={loading ? "bulk-spin" : ""} /> Refresh
            </button>
          </div>

          <div className="bulk-filter-grid">
            <label className="bulk-search-field">
              <span>Search</span>
              <div><Search size={16} /><input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Name, email, location, race, or ID" /></div>
            </label>
            <FilterSelect label="Country" value={filters.country} options={options.countries} onChange={(value) => updateFilter("country", value)} />
            <FilterSelect label="State / region" value={filters.state} options={options.states} onChange={(value) => updateFilter("state", value)} />
            <FilterSelect label="City" value={filters.city} options={options.cities} onChange={(value) => updateFilter("city", value)} />
            <FilterSelect label="Ethnicity / race" value={filters.ethnicity} options={options.ethnicities} onChange={(value) => updateFilter("ethnicity", value)} />
            <FilterSelect label="Gender" value={filters.gender} options={options.genders} onChange={(value) => updateFilter("gender", value)} />
            <FilterSelect label="Dating mode" value={filters.mode} options={options.modes} onChange={(value) => updateFilter("mode", value)} />
            <FilterSelect label="Profile pictures" value={filters.photoStatus} options={["with pictures", "without pictures"]} onChange={(value) => updateFilter("photoStatus", value)} />
            <FilterSelect label="Account status" value={filters.status} options={["active", "disabled"]} onChange={(value) => updateFilter("status", value)} />
            <FilterSelect label="Verification" value={filters.verification} options={["verified", "unverified"]} onChange={(value) => updateFilter("verification", value)} />
            <label><span>Minimum age</span><input type="number" min="18" max="99" value={filters.ageMin} onChange={(event) => updateFilter("ageMin", event.target.value)} /></label>
            <label><span>Maximum age</span><input type="number" min="18" max="99" value={filters.ageMax} onChange={(event) => updateFilter("ageMax", event.target.value)} /></label>
          </div>

          <div className="bulk-filter-footer">
            <span>{activeFilterCount} active filter{activeFilterCount === 1 ? "" : "s"}</span>
            <button type="button" onClick={clearFilters} disabled={!activeFilterCount}><X size={15} /> Clear filters</button>
          </div>
          </div>
        </details>

        <details className="bulk-account-section bulk-collapsible-section" open>
          <summary className="bulk-collapse-summary">
            <span><CheckSquare2 size={17} /> Profile selection</span>
            <span>{filteredProfiles.length} results <ChevronDown size={18} /></span>
          </summary>
          <div className="bulk-collapse-body">
          <div className="bulk-account-heading">
            <div>
              <h2 id="bulk-selection-title">Choose filtered accounts</h2>
              <p>Select manually, select every filtered account, or generate a random sample from the current results.</p>
            </div>
          </div>

          <div className="bulk-selection-toolbar">
            <button type="button" className="bulk-secondary-button" onClick={selectAllFiltered} disabled={!eligibleFilteredProfiles.length}>
              <CheckSquare2 size={16} /> Select all filtered ({eligibleFilteredProfiles.length})
            </button>
            <div className="bulk-random-control">
              <input type="number" min="1" max={Math.max(1, eligibleFilteredProfiles.length)} value={randomCount} onChange={(event) => setRandomCount(event.target.value)} aria-label="Random account count" />
              <button type="button" onClick={selectRandom} disabled={!eligibleFilteredProfiles.length}><Shuffle size={16} /> Select random</button>
            </div>
            <button type="button" className="bulk-secondary-button" onClick={() => setSelectedIds(new Set())} disabled={!selectedIds.size}>
              <X size={16} /> Clear selection
            </button>
          </div>

          {error ? <div className="bulk-message bulk-message-error">{error}</div> : null}
          {message ? <div className="bulk-message bulk-message-success">{message}</div> : null}

          <div className="bulk-account-table-wrap">
            <table className="bulk-account-table">
              <thead>
                <tr><th>Select</th><th>User</th><th>Mode</th><th>Pictures</th><th>Location</th><th>Ethnicity / race</th><th>Gender</th><th>Age</th><th>Status</th><th>Joined</th></tr>
              </thead>
              <tbody>
                {visibleProfiles.map((profile) => (
                  <tr key={profile.id} className={selectedIds.has(profile.id) ? "bulk-row-selected" : ""}>
                    <td>
                      <input type="checkbox" checked={selectedIds.has(profile.id)} onChange={() => toggleProfile(profile)} disabled={Boolean(profile.is_admin)} aria-label={`Select ${profile.full_name || profile.email || profile.id}`} />
                    </td>
                    <td><strong>{profile.full_name || "Unnamed user"}</strong><span>{profile.email || profile.id}</span></td>
                    <td>{clean(profile.dating_mode) || "-"}</td>
                    <td>{profile.photoCount ? `${profile.photoCount} photo${profile.photoCount === 1 ? "" : "s"}` : "None"}</td>
                    <td>{[profile.city, profile.state_region, profile.country].map(clean).filter(Boolean).join(", ") || "Not set"}</td>
                    <td>{profile.ethnicity || "Not set"}</td>
                    <td>{clean(profile.gender) || "-"}</td>
                    <td>{profile.age ?? "-"}</td>
                    <td>
                      {profile.is_admin ? <span className="bulk-status bulk-status-protected">Protected</span> : profile.is_banned ? <span className="bulk-status bulk-status-disabled">Disabled</span> : <span className="bulk-status bulk-status-active">Active</span>}
                    </td>
                    <td>{formatDate(profile.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredProfiles.length > visibleProfiles.length ? <p className="bulk-table-note">Showing the first 500 rows. Select all still includes every filtered account.</p> : null}
          {!loading && !filteredProfiles.length ? <div className="bulk-empty"><UsersRound size={24} /><strong>No accounts match these filters.</strong></div> : null}
          </div>
        </details>

        <section className="bulk-action-bar" aria-label="Bulk account actions">
          <div>
            <span><ShieldAlert size={17} /> {selectedProfiles.length} account{selectedProfiles.length === 1 ? "" : "s"} selected</span>
            <p>Admin accounts are protected. Delete permanently removes complete Solo, Duo, or Group accounts.</p>
          </div>
          <div>
            <button type="button" className="bulk-enable-button" onClick={() => void applyBulkAction("enable")} disabled={!selectedProfiles.length || Boolean(processing)}>
              {processing === "enable" ? <LoaderCircle className="bulk-spin" size={17} /> : <RotateCcw size={17} />} Restore accounts
            </button>
            <button type="button" className="bulk-disable-button" onClick={() => void applyBulkAction("disable")} disabled={!selectedProfiles.length || Boolean(processing)}>
              {processing === "disable" ? <LoaderCircle className="bulk-spin" size={17} /> : <Ban size={17} />} Disable accounts
            </button>
            <button type="button" className="bulk-delete-button" onClick={() => void prepareDelete()} disabled={!selectedProfiles.length || Boolean(processing)}>
              {processing === "preview-delete" ? <LoaderCircle className="bulk-spin" size={17} /> : <Trash2 size={17} />} Delete permanently
            </button>
          </div>
        </section>
      </div>

      {deletePreview ? (
        <div className="bulk-delete-modal-backdrop" role="presentation" onMouseDown={() => {
          if (!processing) setDeletePreview(null);
        }}>
          <section className="bulk-delete-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-delete-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="bulk-delete-modal-icon"><AlertTriangle size={25} /></div>
            <span className="bulk-delete-modal-kicker">Permanent action</span>
            <h2 id="bulk-delete-title">Delete these accounts?</h2>
            <p>
              This removes Auth logins, profiles, shared dating entities, matches, chats, plans, wallets, activity, and stored profile media. It cannot be undone.
            </p>

            <div className="bulk-delete-breakdown">
              <div><span>Selected rows</span><strong>{deletePreview.selectedCount}</strong></div>
              <div><span>Login accounts</span><strong>{deletePreview.resolvedIds.length}</strong></div>
              <div><span>Solo accounts</span><strong>{deletePreview.soloIds.length}</strong></div>
              <div><span>Duo profiles</span><strong>{deletePreview.duoIds.length}</strong></div>
              <div><span>Group profiles</span><strong>{deletePreview.groupIds.length}</strong></div>
              <div><span>Protected skips</span><strong>{deletePreview.protectedIds.length}</strong></div>
            </div>

            {(deletePreview.duoIds.length || deletePreview.groupIds.length) ? (
              <div className="bulk-delete-shared-warning">
                <UsersRound size={17} /> Selecting one shared member includes every member of that Duo or Group.
              </div>
            ) : null}

            <label className="bulk-delete-confirm-field">
              <span>Type <strong>DELETE</strong> to confirm</span>
              <input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="DELETE" disabled={processing === "delete"} />
            </label>

            <div className="bulk-delete-modal-actions">
              <button type="button" className="bulk-delete-cancel" onClick={() => {
                setDeletePreview(null);
                setDeleteConfirmation("");
              }} disabled={processing === "delete"}>Cancel</button>
              <button type="button" className="bulk-delete-confirm" onClick={() => void confirmDelete()} disabled={deleteConfirmation !== "DELETE" || processing === "delete"}>
                {processing === "delete" ? <LoaderCircle className="bulk-spin" size={17} /> : <Trash2 size={17} />}
                {processing === "delete" ? "Deleting accounts..." : "Delete accounts permanently"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}
