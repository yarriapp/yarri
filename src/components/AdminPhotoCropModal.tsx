"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area, type Point } from "react-easy-crop";
import {
  Crop as CropIcon,
  LoaderCircle,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
} from "lucide-react";
import { createCroppedPhoto } from "@/lib/cropImage";

type Props = {
  imageUrl: string;
  fileName?: string;
  saving: boolean;
  error?: string;
  onCancel: () => void;
  onSave: (file: File) => Promise<void> | void;
};

export default function AdminPhotoCropModal({
  imageUrl,
  fileName = "profile-photo",
  saving,
  error = "",
  onCancel,
  onSave,
}: Props) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [localError, setLocalError] = useState("");

  const reset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedAreaPixels(null);
    setLocalError("");
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !preparing) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel, preparing, saving]);

  const saveCrop = async () => {
    if (!croppedAreaPixels || preparing || saving) return;
    try {
      setPreparing(true);
      setLocalError("");
      const file = await createCroppedPhoto(imageUrl, croppedAreaPixels, rotation, fileName);
      await onSave(file);
    } catch (cropError) {
      setLocalError(cropError instanceof Error ? cropError.message : "Could not prepare this crop.");
    } finally {
      setPreparing(false);
    }
  };

  if (typeof document === "undefined") return null;
  const busy = preparing || saving;

  return createPortal(
    <div
      className="admin-photo-crop-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        className="admin-photo-crop-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-photo-crop-title"
      >
        <header className="admin-photo-crop-header">
          <div>
            <span className="admin-photo-crop-kicker">Profile photo</span>
            <h2 id="admin-photo-crop-title">Adjust photo</h2>
          </div>
          <button
            type="button"
            className="admin-photo-crop-icon-button"
            onClick={onCancel}
            disabled={busy}
            title="Close editor"
            aria-label="Close photo editor"
          >
            <X size={20} />
          </button>
        </header>

        <div className="admin-photo-crop-stage">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={4 / 5}
            minZoom={1}
            maxZoom={3}
            cropShape="rect"
            showGrid
            mediaProps={{ crossOrigin: "anonymous" }}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
          />
        </div>

        <div className="admin-photo-crop-controls">
          {localError || error ? (
            <div className="admin-photo-crop-error" role="alert">{localError || error}</div>
          ) : null}
          <label className="admin-photo-crop-slider">
            <span><ZoomIn size={17} /> Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </label>
          <div className="admin-photo-crop-tools">
            <button type="button" onClick={() => setRotation((value) => value - 90)} title="Rotate left" aria-label="Rotate left">
              <RotateCcw size={18} />
            </button>
            <button type="button" onClick={() => setRotation((value) => value + 90)} title="Rotate right" aria-label="Rotate right">
              <RotateCw size={18} />
            </button>
            <button type="button" onClick={reset} title="Reset crop">
              <CropIcon size={18} /> Reset
            </button>
          </div>
        </div>

        <footer className="admin-photo-crop-footer">
          <span className="admin-photo-crop-file-name">4:5 portrait crop</span>
          <div>
            <button type="button" className="admin-photo-crop-cancel" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="admin-photo-crop-apply"
              onClick={() => void saveCrop()}
              disabled={!croppedAreaPixels || busy}
            >
              {busy ? <LoaderCircle className="admin-photo-upload-spin" size={17} /> : <CropIcon size={17} />}
              {preparing ? "Preparing..." : saving ? "Saving..." : "Save crop"}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body
  );
}
