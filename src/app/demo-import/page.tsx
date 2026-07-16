"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import Header from "@/components/Header";
import AdminProfileCsvExport from "@/components/AdminProfileCsvExport";
import { isAllowedAdminEmail } from "@/lib/admin";
import {
  DEMO_CSV_HEADERS,
  DEMO_DATA_HEADERS,
  MAX_DEMO_CSV_FILE_SIZE,
  getDemoTemplateRows,
  normalizeDemoCsvRows,
  validateAndGroupDemoRows,
  type DemoCsvRow,
  type DemoImportValidation,
  type DemoMode,
} from "@/lib/demoImport";
import { supabase } from "@/lib/supabase";

type ImportResult = {
  key: string;
  mode: DemoMode;
  status: "created" | "failed";
  accounts: Array<{ id: string; email: string; fullName: string }>;
  error?: string;
};

type ImportResponse = {
  error?: string;
  results?: ImportResult[];
  createdEntities?: number;
  failedEntities?: number;
  createdAccounts?: number;
};

const templateCopy: Record<DemoMode, { title: string; detail: string }> = {
  solo: {
    title: "Solo template",
    detail: "One CSV row creates one login and one complete Solo profile.",
  },
  duo: {
    title: "Duo template",
    detail: "Two rows with the same entity key create both logins and their Duo.",
  },
  group: {
    title: "Group template",
    detail: "Two to five rows with the same entity key create a complete Group.",
  },
};

function formatMode(mode: string) {
  return mode ? `${mode.slice(0, 1).toUpperCase()}${mode.slice(1)}` : "Unknown";
}

export default function DemoImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<DemoCsvRow[]>([]);
  const [validation, setValidation] = useState<DemoImportValidation | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [results, setResults] = useState<ImportResult[]>([]);

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

  const summary = useMemo(() => {
    const entities = validation?.entities || [];
    const accounts = entities.reduce((total, entity) => total + entity.members.length, 0);
    const verified = entities.reduce(
      (total, entity) => total + entity.members.filter((member) => member.isVerified).length,
      0
    );
    return { entities: entities.length, accounts, verified };
  }, [validation]);

  const photoCountBySourceRow = useMemo(() => {
    const counts = new Map<number, number>();
    validation?.entities.forEach((entity) => {
      entity.members.forEach((member) => counts.set(member.sourceRow, member.photos.length));
    });
    return counts;
  }, [validation]);

  const resetImport = () => {
    setFileName("");
    setRows([]);
    setValidation(null);
    setParseErrors([]);
    setImportError("");
    setResults([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadTemplate = (mode: DemoMode) => {
    const csv = Papa.unparse(getDemoTemplateRows(mode), {
      columns: [...DEMO_CSV_HEADERS],
      newline: "\r\n",
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `yarri-${mode}-demo-accounts-template.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const parseFile = (file?: File) => {
    if (!file) return;
    resetImport();
    setFileName(file.name);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseErrors(["Choose a CSV file generated from one of the Yarri templates."]);
      return;
    }
    if (file.size > MAX_DEMO_CSV_FILE_SIZE) {
      setParseErrors(["CSV files must be 2 MB or smaller."]);
      return;
    }

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (output) => {
        const fields = new Set(output.meta.fields || []);
        const missingHeaders = DEMO_DATA_HEADERS.filter((header) => !fields.has(header));
        const parserMessages = output.errors.map(
          (error) => `CSV row ${(error.row ?? 0) + 2}: ${error.message}`
        );
        if (missingHeaders.length) {
          const isLegacyProfileExport =
            fields.has("profile_id") && fields.has("entity_type") && fields.has("photos_json");
          parserMessages.unshift(
            isLegacyProfileExport
              ? "This CSV uses the older profile-export format. Download a fresh import-ready CSV above and upload that file."
              : `Missing template columns: ${missingHeaders.join(", ")}.`
          );
        }
        if (!output.data.length) parserMessages.push("The CSV has no profile rows.");

        const normalized = normalizeDemoCsvRows(output.data);
        setRows(normalized);
        setParseErrors(parserMessages);
        setValidation(parserMessages.length ? null : validateAndGroupDemoRows(normalized));
      },
      error: (error) => setParseErrors([error.message || "Could not read this CSV."]),
    });
  };

  const importAccounts = async () => {
    if (!validation?.entities.length || validation.errors.length) return;
    const confirmed = window.confirm(
      `Create ${summary.accounts} login account(s) across ${summary.entities} profile set(s)?`
    );
    if (!confirmed) return;

    try {
      setImporting(true);
      setImportError("");
      setResults([]);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Admin session expired. Sign in again.");

      const response = await fetch("/api/admin/demo-import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ entities: validation.entities }),
      });
      const payload = (await response.json()) as ImportResponse;
      if (!response.ok) throw new Error(payload.error || "Demo account import failed.");
      setResults(payload.results || []);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Demo account import failed.");
    } finally {
      setImporting(false);
    }
  };

  if (checkingAccess) return <div className="p-10">Checking access...</div>;

  const allErrors = [...parseErrors, ...(validation?.errors || [])];
  const canImport = Boolean(validation?.entities.length && !allErrors.length && !importing);

  return (
    <main className="admin-dashboard-page demo-import-page">
      <div className="admin-dashboard-shell">
        <Header />

        <section className="demo-import-intro" aria-labelledby="demo-import-title">
          <div>
            <span className="demo-import-kicker"><ShieldCheck size={16} /> Server-protected account creation</span>
            <h2 id="demo-import-title">Build complete demo profiles in one import</h2>
            <p>
              Every CSV member receives a confirmed Yarri login, onboarding profile, ordered photos,
              preferences, and the correct Solo, Duo, or Group relationship.
            </p>
          </div>
          <div className="demo-import-security-note">
            <AlertTriangle size={20} />
            <span>CSV passwords are sensitive. Keep the file private and delete it after import.</span>
          </div>
        </section>

        <AdminProfileCsvExport />

        <section className="demo-import-section" aria-labelledby="templates-title">
          <div className="demo-import-section-heading">
            <div>
              <span className="demo-import-step">Step 1</span>
              <h2 id="templates-title">Download a template</h2>
              <p>Keep the header row unchanged. Separate list values with semicolons.</p>
            </div>
          </div>

          <div className="demo-template-grid">
            {(["solo", "duo", "group"] as DemoMode[]).map((mode) => (
              <article className="demo-template-option" key={mode}>
                <div className="demo-template-icon"><Users size={20} /></div>
                <div>
                  <h3>{templateCopy[mode].title}</h3>
                  <p>{templateCopy[mode].detail}</p>
                </div>
                <button type="button" onClick={() => downloadTemplate(mode)} title={`Download ${mode} CSV template`}>
                  <Download size={17} /> Download CSV
                </button>
              </article>
            ))}
          </div>

          <div className="demo-import-guidance">
            <span><strong>Photos:</strong> Optional. Invalid links are ignored and can be added later in admin.</span>
            <span><strong>Verification:</strong> Use <code>true</code> to test chat immediately.</span>
            <span><strong>Shared sets:</strong> Reuse one <code>entity_key</code> for every Duo or Group member.</span>
            <span><strong>Chip choices:</strong> Columns beginning with <code>chip_</code> list exact app options and are not imported.</span>
          </div>
        </section>

        <section className="demo-import-section" aria-labelledby="upload-title">
          <div className="demo-import-section-heading">
            <div>
              <span className="demo-import-step">Step 2</span>
              <h2 id="upload-title">Validate the completed CSV</h2>
              <p>No account is created until the file passes every onboarding check.</p>
            </div>
            {fileName ? (
              <button type="button" className="demo-reset-button" onClick={resetImport}>
                <RefreshCw size={16} /> Reset
              </button>
            ) : null}
          </div>

          <input
            ref={fileInputRef}
            className="demo-file-input"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => parseFile(event.target.files?.[0])}
          />
          <button
            type="button"
            className={`demo-upload-zone ${dragActive ? "demo-upload-zone-active" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              parseFile(event.dataTransfer.files?.[0]);
            }}
          >
            <span className="demo-upload-icon"><Upload size={24} /></span>
            <strong>{fileName || "Choose or drop a completed CSV"}</strong>
            <span>CSV only, up to 2 MB</span>
          </button>

          {rows.length ? (
            <div className="demo-import-summary" aria-label="CSV summary">
              <div><span>Profile sets</span><strong>{summary.entities}</strong></div>
              <div><span>Login accounts</span><strong>{summary.accounts}</strong></div>
              <div><span>Verified members</span><strong>{summary.verified}</strong></div>
              <div><span>CSV rows</span><strong>{rows.length}</strong></div>
            </div>
          ) : null}

          {allErrors.length ? (
            <div className="demo-validation-block demo-validation-error">
              <div className="demo-validation-title"><XCircle size={18} /> Fix before importing</div>
              <ul>{allErrors.slice(0, 40).map((error) => <li key={error}>{error}</li>)}</ul>
              {allErrors.length > 40 ? <p>{allErrors.length - 40} more errors are hidden.</p> : null}
            </div>
          ) : null}

          {validation && !validation.errors.length ? (
            <div className="demo-validation-block demo-validation-success">
              <div className="demo-validation-title"><CheckCircle2 size={18} /> CSV structure is ready</div>
              <p>{summary.entities} complete profile set(s) passed validation.</p>
            </div>
          ) : null}

          {validation?.warnings.length ? (
            <div className="demo-validation-block demo-validation-warning">
              <div className="demo-validation-title"><AlertTriangle size={18} /> Verification notes</div>
              <ul>{validation.warnings.slice(0, 20).map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          ) : null}
        </section>

        {rows.length ? (
          <section className="demo-import-section" aria-labelledby="preview-title">
            <div className="demo-import-section-heading">
              <div>
                <span className="demo-import-step">Step 3</span>
                <h2 id="preview-title">Review member preview</h2>
                <p>Showing the first 50 rows. Passwords are intentionally hidden.</p>
              </div>
            </div>
            <div className="demo-import-table-wrap">
              <table className="demo-import-table">
                <thead><tr><th>Set</th><th>Mode</th><th>Order</th><th>Name</th><th>Email</th><th>City</th><th>Photos</th><th>Verified</th></tr></thead>
                <tbody>
                  {rows.slice(0, 50).map((row) => (
                    <tr key={`${row.entity_key}-${row.member_order}-${row.source_row}`}>
                      <td><code>{row.entity_key || "-"}</code></td>
                      <td>{formatMode(row.mode)}</td>
                      <td>{row.member_order || "-"}</td>
                      <td>{row.full_name || "-"}</td>
                      <td>{row.email || "-"}</td>
                      <td>{row.city || row.shared_city || "-"}</td>
                      <td>{photoCountBySourceRow.get(row.source_row) ?? 0}</td>
                      <td><span className={`demo-status ${row.is_verified.toLowerCase() === "true" ? "demo-status-yes" : "demo-status-no"}`}>{row.is_verified.toLowerCase() === "true" ? "Yes" : "No"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="demo-import-actions">
              <div>
                <strong>Ready to create accounts?</strong>
                <span>The server will confirm emails and connect every relationship automatically.</span>
              </div>
              <button type="button" className="demo-import-button" onClick={importAccounts} disabled={!canImport}>
                {importing ? <LoaderCircle className="demo-spin" size={18} /> : <FileSpreadsheet size={18} />}
                {importing ? "Creating accounts..." : `Create ${summary.accounts} account${summary.accounts === 1 ? "" : "s"}`}
              </button>
            </div>

            {importError ? <div className="demo-validation-block demo-validation-error"><div className="demo-validation-title"><XCircle size={18} /> Import stopped</div><p>{importError}</p></div> : null}
          </section>
        ) : null}

        {results.length ? (
          <section className="demo-import-section" aria-labelledby="results-title">
            <div className="demo-import-section-heading">
              <div>
                <span className="demo-import-step">Results</span>
                <h2 id="results-title">Account creation report</h2>
                <p>Failed profile sets were cleaned up and can be corrected and imported again.</p>
              </div>
            </div>
            <div className="demo-results-list">
              {results.map((result) => (
                <article key={result.key} className={`demo-result-row ${result.status === "created" ? "demo-result-created" : "demo-result-failed"}`}>
                  {result.status === "created" ? <CheckCircle2 size={19} /> : <XCircle size={19} />}
                  <div>
                    <strong>{result.key} - {formatMode(result.mode)}</strong>
                    <span>{result.status === "created" ? `${result.accounts.length} login account(s) created.` : result.error || "Could not create this profile set."}</span>
                    {result.accounts.length ? <small>{result.accounts.map((account) => account.email).join(", ")}</small> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
