"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Props = {
  profileId: string;
  photos: string[];
  photoIndex: number;
  onReordered: (photos: string[]) => void;
};

type ReorderResponse = {
  photos?: string[];
  error?: string;
};

export default function AdminPhotoOrderControls({
  profileId,
  photos,
  photoIndex,
  onReordered,
}: Props) {
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");

  const movePhoto = async (direction: -1 | 1) => {
    const targetIndex = photoIndex + direction;
    if (moving || targetIndex < 0 || targetIndex >= photos.length) return;

    try {
      setMoving(true);
      setError("");
      const reordered = [...photos];
      [reordered[photoIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[photoIndex]];
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Admin session expired. Sign in again.");

      const response = await fetch("/api/admin/profile-photos", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profileId, photos: reordered }),
      });
      const payload = (await response.json()) as ReorderResponse;
      if (!response.ok || !payload.photos) {
        throw new Error(payload.error || "Could not change the photo order.");
      }
      onReordered(payload.photos);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Could not change the photo order.");
    } finally {
      setMoving(false);
    }
  };

  return (
    <>
      <div className="admin-photo-order-controls">
        <button
          type="button"
          onClick={() => void movePhoto(-1)}
          disabled={moving || photoIndex === 0}
          aria-label="Move photo earlier"
          title="Move photo earlier"
        >
          <ArrowLeft size={15} />
        </button>
        <span>{photoIndex === 0 ? "Cover" : `${photoIndex + 1} of ${photos.length}`}</span>
        <button
          type="button"
          onClick={() => void movePhoto(1)}
          disabled={moving || photoIndex === photos.length - 1}
          aria-label="Move photo later"
          title="Move photo later"
        >
          {moving ? <LoaderCircle className="admin-photo-upload-spin" size={15} /> : <ArrowRight size={15} />}
        </button>
      </div>
      {error ? <span className="admin-photo-order-error" role="alert">{error}</span> : null}
    </>
  );
}
