"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ImagePlus, LoaderCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

type AdminPhotoUploadProps = {
  profileId?: string | null;
  currentPhotoCount: number;
  onUploaded: (photos: string[]) => void;
};

type UploadResponse = {
  photos?: string[];
  error?: string;
};

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 8 * 1024 * 1024;

export default function AdminPhotoUpload({
  profileId,
  currentPhotoCount,
  onUploaded,
}: AdminPhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const atLimit = currentPhotoCount >= 5;
  const remainingSlots = Math.max(0, 5 - currentPhotoCount);

  useEffect(() => {
    setError("");
    setSuccess("");
    if (inputRef.current) inputRef.current.value = "";
  }, [profileId]);

  const uploadPhotos = async (fileList?: FileList | null) => {
    const files = Array.from(fileList || []);
    if (!files.length || !profileId || uploading || atLimit) return;

    setError("");
    setSuccess("");
    if (files.length > remainingSlots) {
      setError(`Choose no more than ${remainingSlots} photo${remainingSlots === 1 ? "" : "s"}.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (files.some((file) => !ACCEPTED_TYPES.has(file.type))) {
      setError("Use only JPG, PNG, or WebP images.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (files.some((file) => !file.size || file.size > MAX_FILE_SIZE)) {
      setError("Each image must be 8 MB or smaller.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    try {
      setUploading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Admin session expired. Sign in again.");

      const body = new FormData();
      body.append("profileId", profileId);
      files.forEach((file) => body.append("photos", file));
      const response = await fetch("/api/admin/profile-photos", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body,
      });
      const payload = (await response.json()) as UploadResponse;
      if (!response.ok || !payload.photos) {
        throw new Error(payload.error || "Could not upload these photos.");
      }
      onUploaded(payload.photos);
      setSuccess(`${files.length} added`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload these photos.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="admin-photo-upload-control">
      <input
        ref={inputRef}
        className="admin-photo-upload-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(event) => void uploadPhotos(event.target.files)}
      />
      <button
        type="button"
        className="admin-photo-upload-button"
        onClick={() => inputRef.current?.click()}
        disabled={!profileId || uploading || atLimit}
        title={atLimit ? "This profile already has 5 photos" : `Add up to ${remainingSlots} profile photos`}
      >
        {uploading ? <LoaderCircle className="admin-photo-upload-spin" size={17} /> : <ImagePlus size={17} />}
        {uploading ? "Uploading..." : atLimit ? "5 photo limit" : "Add photos"}
      </button>
      {success ? <span className="admin-photo-upload-success"><CheckCircle2 size={15} /> {success}</span> : null}
      {error ? <span className="admin-photo-upload-error">{error}</span> : null}
    </div>
  );
}
