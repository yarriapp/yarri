"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import {
  CheckSquare2,
  Download,
  Filter,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type ExportProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  age: number | null;
  gender: string | null;
  ethnicity: string;
  dating_mode: string | null;
  city: string | null;
  state_region: string | null;
  country: string | null;
  is_verified: boolean | null;
  created_at: string | null;
  photo_count: number;
};

type ExportFilters = {
  search: string;
  mode: string;
  country: string;
  state: string;
  city: string;
  gender: string;
  ethnicity: string;
  verification: string;
  photoStatus: string;
  ageMin: string;
  ageMax: string;
};

const emptyFilters: ExportFilters = {
  search: "",
  mode: "",
  country: "",
  state: "",
  city: "",
  gender: "",
  ethnicity: "",
  verification: "",
  photoStatus: "",
  ageMin: "",
  ageMax: "",
};

function clean(value?: string | null) {
  return String(value || "").trim();
}

function uniqueValues(values: Array<string | null>) {
  return Array.from(new Set(values.map(clean).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function formatOption(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AdminProfileCsvExport() {
  const [profiles, setProfiles] = useState<ExportProfile[]>([]);
  const [filters, setFilters] = useState<ExportFilters>(emptyFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"filtered" | "selected" | "">("");
  const [error, setError] = useState("");

  const getAccessToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Admin session expired. Sign in again.");
    return session.access_token;
  };

  const loadProfiles = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const token = await getAccessToken();
      const response = await fetch("/api/admin/profile-export", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as { profiles?: ExportProfile[]; error?: string };
      if (!response.ok || !payload.profiles) throw new Error(payload.error || "Could not load active profiles.");
      setProfiles(payload.profiles);
      setSelectedIds(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load active profiles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const options = useMemo(() => ({
    modes: uniqueValues(profiles.map((profile) => profile.dating_mode)),
    countries: uniqueValues(profiles.map((profile) => profile.country)),
    states: uniqueValues(profiles.map((profile) => profile.state_region)),
    cities: uniqueValues(profiles.map((profile) => profile.city)),
    genders: uniqueValues(profiles.map((profile) => profile.gender)),
    ethnicities: uniqueValues(profiles.map((profile) => profile.ethnicity)),
  }), [profiles]);

  const filteredProfiles = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const minimumAge = filters.ageMin ? Number(filters.ageMin) : null;
    const maximumAge = filters.ageMax ? Number(filters.ageMax) : null;
    return profiles.filter((profile) => {
      if (filters.mode && clean(profile.dating_mode) !== filters.mode) return false;
      if (filters.country && clean(profile.country) !== filters.country) return false;
      if (filters.state && clean(profile.state_region) !== filters.state) return false;
      if (filters.city && clean(profile.city) !== filters.city) return false;
      if (filters.gender && clean(profile.gender) !== filters.gender) return false;
      if (filters.ethnicity && clean(profile.ethnicity) !== filters.ethnicity) return false;
      if (filters.verification === "verified" && !profile.is_verified) return false;
      if (filters.verification === "unverified" && profile.is_verified) return false;
      if (filters.photoStatus === "with pictures" && profile.photo_count < 1) return false;
      if (filters.photoStatus === "without pictures" && profile.photo_count > 0) return false;
      if (minimumAge !== null && (profile.age === null || profile.age < minimumAge)) return false;
      if (maximumAge !== null && (profile.age === null || profile.age > maximumAge)) return false;
      if (search) {
        const text = [profile.full_name, profile.email, profile.city, profile.state_region, profile.country, profile.ethnicity, profile.id]
          .map(clean)
          .join(" ")
          .toLowerCase();
        if (!text.includes(search)) return false;
      }
      return true;
    });
  }, [filters, profiles]);

  const visibleProfiles = filteredProfiles.slice(0, 150);
  const activeFilterCount = Object.values(filters).filter((value) => value.trim()).length;
  const selectedProfiles = filteredProfiles.filter((profile) => selectedIds.has(profile.id));

  const updateFilter = (key: keyof ExportFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setSelectedIds(new Set());
    setError("");
  };

  const toggleProfile = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadCsv = async (scope: "filtered" | "selected") => {
    const targetProfiles = scope === "selected" ? selectedProfiles : filteredProfiles;
    if (!targetProfiles.length || exporting) return;
    try {
      setExporting(scope);
      setError("");
      const token = await getAccessToken();
      const response = await fetch("/api/admin/profile-export", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profileIds: targetProfiles.map((profile) => profile.id) }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Could not export these profiles.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const fileName = disposition.match(/filename="([^"]+)"/i)?.[1] || "yarri-demo-import-profiles.csv";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export these profiles.");
    } finally {
      setExporting("");
    }
  };

  return (
    <section className="profile-export-section" aria-labelledby="profile-export-title">
      <div className="profile-export-heading">
        <div>
          <span className="demo-import-kicker"><ShieldCheck size={16} /> Protected profile export</span>
          <h2 id="profile-export-title">Download import-ready profile data</h2>
          <p>Filter or select active profiles, then export them in the exact schema accepted by Demo Import.</p>
        </div>
        <button type="button" className="profile-export-refresh" onClick={() => void loadProfiles()} disabled={loading || Boolean(exporting)}>
          <RefreshCw size={16} className={loading ? "bulk-spin" : ""} /> Refresh profiles
        </button>
      </div>

      <div className="profile-export-stats" aria-label="Profile export summary">
        <div><span>Active profiles</span><strong>{profiles.length}</strong></div>
        <div><span>Filtered</span><strong>{filteredProfiles.length}</strong></div>
        <div><span>Selected</span><strong>{selectedProfiles.length}</strong></div>
      </div>

      <div className="profile-export-filter-grid">
        <label className="profile-export-search">
          <span>Search</span>
          <div><Search size={16} /><input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Name, email, location, or profile ID" /></div>
        </label>
        <ExportFilter label="Dating mode" value={filters.mode} options={options.modes} onChange={(value) => updateFilter("mode", value)} />
        <ExportFilter label="Country" value={filters.country} options={options.countries} onChange={(value) => updateFilter("country", value)} />
        <ExportFilter label="State / region" value={filters.state} options={options.states} onChange={(value) => updateFilter("state", value)} />
        <ExportFilter label="City" value={filters.city} options={options.cities} onChange={(value) => updateFilter("city", value)} />
        <ExportFilter label="Gender" value={filters.gender} options={options.genders} onChange={(value) => updateFilter("gender", value)} />
        <ExportFilter label="Ethnicity / race" value={filters.ethnicity} options={options.ethnicities} onChange={(value) => updateFilter("ethnicity", value)} />
        <ExportFilter label="Verification" value={filters.verification} options={["verified", "unverified"]} onChange={(value) => updateFilter("verification", value)} />
        <ExportFilter label="Profile pictures" value={filters.photoStatus} options={["with pictures", "without pictures"]} onChange={(value) => updateFilter("photoStatus", value)} />
        <label><span>Minimum age</span><input type="number" min="18" max="99" value={filters.ageMin} onChange={(event) => updateFilter("ageMin", event.target.value)} /></label>
        <label><span>Maximum age</span><input type="number" min="18" max="99" value={filters.ageMax} onChange={(event) => updateFilter("ageMax", event.target.value)} /></label>
      </div>

      <div className="profile-export-toolbar">
        <div>
          <span><Filter size={15} /> {activeFilterCount} active filter{activeFilterCount === 1 ? "" : "s"}</span>
          <button type="button" onClick={() => {
            setFilters(emptyFilters);
            setSelectedIds(new Set());
          }} disabled={!activeFilterCount}><X size={15} /> Clear filters</button>
        </div>
        <div>
          <button type="button" onClick={() => setSelectedIds(new Set(filteredProfiles.map((profile) => profile.id)))} disabled={!filteredProfiles.length}>
            <CheckSquare2 size={16} /> Select all filtered
          </button>
          <button type="button" onClick={() => setSelectedIds(new Set())} disabled={!selectedIds.size}><X size={16} /> Clear selection</button>
        </div>
      </div>

      {error ? <div className="bulk-message bulk-message-error" role="alert">{error}</div> : null}

      <div className="profile-export-table-wrap">
        <table className="profile-export-table">
          <thead><tr><th>Select</th><th>Profile</th><th>Mode</th><th>Location</th><th>Pictures</th><th>Verified</th></tr></thead>
          <tbody>
            {visibleProfiles.map((profile) => (
              <tr key={profile.id} className={selectedIds.has(profile.id) ? "profile-export-row-selected" : ""}>
                <td><input type="checkbox" checked={selectedIds.has(profile.id)} onChange={() => toggleProfile(profile.id)} aria-label={`Select ${profile.full_name || profile.email || profile.id}`} /></td>
                <td><strong>{profile.full_name || "Unnamed profile"}</strong><span>{profile.email || profile.id}</span></td>
                <td>{formatOption(clean(profile.dating_mode) || "Unknown")}</td>
                <td>{[profile.city, profile.state_region, profile.country].map(clean).filter(Boolean).join(", ") || "Not set"}</td>
                <td>{profile.photo_count ? `${profile.photo_count} photo${profile.photo_count === 1 ? "" : "s"}` : "None"}</td>
                <td>{profile.is_verified ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading ? <div className="profile-export-empty"><LoaderCircle className="bulk-spin" size={20} /> Loading active profiles...</div> : null}
      {!loading && !filteredProfiles.length ? <div className="profile-export-empty">No active profiles match these filters.</div> : null}
      {filteredProfiles.length > visibleProfiles.length ? <p className="profile-export-note">Showing the first 150 profiles. Search to find a specific profile; filtered export still includes all {filteredProfiles.length} results.</p> : null}

      <div className="profile-export-actions">
        <div>
          <strong>CSV is formatted for Demo Import</strong>
          <span>Includes ordered photos, profile preferences, and Duo/Group relationships. New import passwords are generated; real account passwords are never exposed. Change existing emails before cloning accounts in this environment.</span>
        </div>
        <div>
          <button type="button" className="profile-export-filtered-button" onClick={() => void downloadCsv("filtered")} disabled={!filteredProfiles.length || Boolean(exporting)}>
            {exporting === "filtered" ? <LoaderCircle className="bulk-spin" size={17} /> : <Download size={17} />} Download filtered ({filteredProfiles.length})
          </button>
          <button type="button" className="profile-export-selected-button" onClick={() => void downloadCsv("selected")} disabled={!selectedProfiles.length || Boolean(exporting)}>
            {exporting === "selected" ? <LoaderCircle className="bulk-spin" size={17} /> : <Download size={17} />} Download selected ({selectedProfiles.length})
          </button>
        </div>
      </div>
    </section>
  );
}

function ExportFilter({ label, value, options, onChange }: {
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
        {options.map((option) => <option key={option} value={option}>{formatOption(option)}</option>)}
      </select>
    </label>
  );
}
