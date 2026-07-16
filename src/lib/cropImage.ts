import type { Area } from "react-easy-crop";

const MAX_OUTPUT_WIDTH = 1200;
const MAX_OUTPUT_HEIGHT = 1500;

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read this image."));
    image.src = source;
  });
}

function rotatedSize(width: number, height: number, rotation: number) {
  const radians = (rotation * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(radians) * width) + Math.abs(Math.sin(radians) * height),
    height: Math.abs(Math.sin(radians) * width) + Math.abs(Math.cos(radians) * height),
  };
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not prepare the cropped image."))),
      "image/jpeg",
      0.9
    );
  });
}

export async function createCroppedPhoto(
  source: File | string,
  crop: Area,
  rotation: number,
  outputName = "photo"
) {
  const isLocalFile = source instanceof File;
  const sourceUrl = isLocalFile ? URL.createObjectURL(source) : source;

  try {
    const image = await loadImage(sourceUrl);
    const radians = (rotation * Math.PI) / 180;
    const bounds = rotatedSize(image.naturalWidth, image.naturalHeight, rotation);
    const rotationCanvas = document.createElement("canvas");
    rotationCanvas.width = Math.max(1, Math.round(bounds.width));
    rotationCanvas.height = Math.max(1, Math.round(bounds.height));
    const rotationContext = rotationCanvas.getContext("2d");
    if (!rotationContext) throw new Error("Photo editing is not available in this browser.");

    rotationContext.translate(rotationCanvas.width / 2, rotationCanvas.height / 2);
    rotationContext.rotate(radians);
    rotationContext.translate(-image.naturalWidth / 2, -image.naturalHeight / 2);
    rotationContext.drawImage(image, 0, 0);

    const scale = Math.min(
      1,
      MAX_OUTPUT_WIDTH / Math.max(1, crop.width),
      MAX_OUTPUT_HEIGHT / Math.max(1, crop.height)
    );
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = Math.max(1, Math.round(crop.width * scale));
    outputCanvas.height = Math.max(1, Math.round(crop.height * scale));
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) throw new Error("Photo editing is not available in this browser.");

    outputContext.fillStyle = "#ffffff";
    outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
    outputContext.drawImage(
      rotationCanvas,
      Math.round(crop.x),
      Math.round(crop.y),
      Math.round(crop.width),
      Math.round(crop.height),
      0,
      0,
      outputCanvas.width,
      outputCanvas.height
    );

    const blob = await canvasBlob(outputCanvas);
    const originalName = isLocalFile ? source.name : outputName;
    const cleanName = originalName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "photo";
    return new File([blob], `${cleanName}-cropped.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    if (isLocalFile) URL.revokeObjectURL(sourceUrl);
  }
}
