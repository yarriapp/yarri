"use client";

import { useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type AdminPhotoDeleteButtonProps = {
  profileId: string;
  photoUrl: string;
  onDeleted: (photos: string[]) => void;
};

type DeleteResponse = {
  photos?: string[];
  warning?: string;
  error?: string;
};

export default function AdminPhotoDeleteButton({
  profileId,
  photoUrl,
  onDeleted,
}: AdminPhotoDeleteButtonProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const deletePhoto = async () => {
    if (deleting) return;
    if (!window.confirm("Delete this profile photo?")) return;

    try {
      setDeleting(true);
      setError("");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Admin session expired. Sign in again.");

      const response = await fetch("/api/admin/profile-photos", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profileId, photoUrl }),
      });
      const payload = (await response.json()) as DeleteResponse;
      if (!response.ok || !payload.photos) {
        throw new Error(payload.error || "Could not delete this photo.");
      }
      if (payload.warning) window.alert(payload.warning);
      onDeleted(payload.photos);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete this photo.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="admin-photo-delete-button"
        onClick={() => void deletePhoto()}
        disabled={deleting}
        aria-label="Delete profile photo"
        title="Delete profile photo"
      >
        {deleting ? <LoaderCircle className="admin-photo-upload-spin" size={16} /> : <Trash2 size={16} />}
      </button>
      {error ? <span className="admin-photo-delete-error" role="alert">{error}</span> : null}
    </>
  );
}
