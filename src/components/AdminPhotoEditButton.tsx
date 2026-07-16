"use client";

import { useEffect, useState } from "react";
import { Crop, LoaderCircle } from "lucide-react";
import AdminPhotoCropModal from "@/components/AdminPhotoCropModal";
import { supabase } from "@/lib/supabase";

type Props = {
  profileId: string;
  photoUrl: string;
  onUpdated: (photos: string[]) => void;
};

type PhotoResponse = {
  photos?: string[];
  warning?: string;
  error?: string;
};

export default function AdminPhotoEditButton({ profileId, photoUrl, onUpdated }: Props) {
  const [editorUrl, setEditorUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (editorUrl) URL.revokeObjectURL(editorUrl);
    };
  }, [editorUrl]);

  const closeEditor = () => {
    setEditorUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    setError("");
  };

  const getAccessToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Admin session expired. Sign in again.");
    return session.access_token;
  };

  const openEditor = async () => {
    if (loading || saving) return;
    try {
      setLoading(true);
      setError("");
      const token = await getAccessToken();
      const params = new URLSearchParams({ profileId, photoUrl });
      const response = await fetch(`/api/admin/profile-photos?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as PhotoResponse;
        throw new Error(payload.error || "Could not open this photo.");
      }
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) throw new Error("This photo could not be read as an image.");
      setEditorUrl(URL.createObjectURL(blob));
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Could not open this photo.");
    } finally {
      setLoading(false);
    }
  };

  const saveCrop = async (file: File) => {
    try {
      setSaving(true);
      setError("");
      const token = await getAccessToken();
      const body = new FormData();
      body.append("profileId", profileId);
      body.append("photoUrl", photoUrl);
      body.append("photo", file);
      const response = await fetch("/api/admin/profile-photos", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const payload = (await response.json()) as PhotoResponse;
      if (!response.ok || !payload.photos) {
        throw new Error(payload.error || "Could not save this crop.");
      }
      onUpdated(payload.photos);
      closeEditor();
      if (payload.warning) setError(payload.warning);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this crop.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="admin-photo-edit-button"
        onClick={() => void openEditor()}
        disabled={loading || saving}
        title="Adjust profile photo"
        aria-label="Adjust profile photo"
      >
        {loading ? <LoaderCircle className="admin-photo-upload-spin" size={17} /> : <Crop size={17} />}
      </button>
      {error && !editorUrl ? <span className="admin-photo-edit-error" role="alert">{error}</span> : null}
      {editorUrl ? (
        <AdminPhotoCropModal
          imageUrl={editorUrl}
          fileName="profile-photo"
          saving={saving}
          error={error}
          onCancel={closeEditor}
          onSave={saveCrop}
        />
      ) : null}
    </>
  );
}
