/**
 * Resize and conform images for API upload (Bedrock Nova, etc.).
 * Keeps images within payload limits and optimal dimensions.
 */

const MAX_DIMENSION = 2048; // Nova supports up to 8000; 2048 keeps payload small
const JPEG_QUALITY = 0.85;
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB — stays well under 25 MB base64 payload

export interface ResizeResult {
  blob: Blob;
  wasResized: boolean;
  originalWidth?: number;
  originalHeight?: number;
}

/**
 * Resize image if needed to meet API requirements.
 * Converts to JPEG for smaller size. Returns original if already within limits.
 */
export async function resizeImageForApi(file: File): Promise<ResizeResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error("File must be an image (JPEG, PNG, GIF, or WebP)");
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.width;
      const h = img.height;
      const needsResize =
        file.size > MAX_FILE_SIZE_BYTES ||
        w > MAX_DIMENSION ||
        h > MAX_DIMENSION;

      if (!needsResize && (file.type === "image/jpeg" || file.type === "image/jpg")) {
        resolve({ blob: file, wasResized: false });
        return;
      }

      const scale = Math.min(
        1,
        MAX_DIMENSION / Math.max(w, h),
        Math.sqrt(MAX_FILE_SIZE_BYTES / (file.size || 1))
      );
      const width = Math.round(w * scale);
      const height = Math.round(h * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to resize image"));
            return;
          }
          resolve({
            blob,
            wasResized: true,
            originalWidth: w,
            originalHeight: h,
          });
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image. Try JPEG or PNG."));
    };
    img.src = url;
  });
}

/** Format to append to FormData after resize (for API upload) */
export async function prepareImageForUpload(file: File): Promise<Blob> {
  const { blob } = await resizeImageForApi(file);
  return blob;
}
