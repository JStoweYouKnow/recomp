import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

const SEGMENTER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite";

let segmenterInstance: ImageSegmenter | null = null;

async function getSegmenter(): Promise<ImageSegmenter> {
  if (segmenterInstance) return segmenterInstance;
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );
  segmenterInstance = await ImageSegmenter.createFromOptions(vision, {
    baseOptions: { modelAssetPath: SEGMENTER_MODEL },
    outputCategoryMask: true,
    outputConfidenceMasks: false,
    runningMode: "IMAGE",
  });
  return segmenterInstance;
}

/**
 * DeepLab v3 person category index (Pascal VOC: 15 = person)
 */
const PERSON_CATEGORY = 15;

const MAX_SEGMENT_SIZE = 512; // Resize before segmentation to avoid memory/model limits

/**
 * Segments person from image and returns a data URL with transparent background.
 */
export async function segmentPersonFromPhoto(imageDataUrl: string): Promise<string> {
  if (!imageDataUrl?.startsWith("data:")) {
    throw new Error("Invalid image: expected a data URL (data:image/...)");
  }

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image. Try a different photo format (JPEG or PNG)."));
    img.src = imageDataUrl;
  });

  // Resize to moderate dimensions — large images can cause TFLite/MediaPipe to fail
  const scale = Math.min(1, MAX_SEGMENT_SIZE / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const inputCanvas = document.createElement("canvas");
  inputCanvas.width = w;
  inputCanvas.height = h;
  const inputCtx = inputCanvas.getContext("2d");
  if (!inputCtx) throw new Error("Could not create canvas");
  inputCtx.drawImage(img, 0, 0, w, h);

  let result: { categoryMask?: { getAsUint8Array: () => Uint8Array; width: number; height: number } };
  try {
    const segmenter = await getSegmenter();
    result = segmenter.segment(inputCanvas);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Segmentation failed. Try a smaller or different photo."
    );
  }

  const categoryMask = result.categoryMask;
  if (!categoryMask) throw new Error("No category mask returned");

  const maskData = categoryMask.getAsUint8Array();
  const maskW = categoryMask.width;
  const maskH = categoryMask.height;

  const canvas = document.createElement("canvas");
  canvas.width = maskW;
  canvas.height = maskH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.drawImage(inputCanvas, 0, 0, maskW, maskH);
  const imageData = ctx.getImageData(0, 0, maskW, maskH);
  const pixels = imageData.data;

  for (let y = 0; y < maskH; y++) {
    for (let x = 0; x < maskW; x++) {
      const maskIdx = y * maskW + x;
      const isPerson = maskData[maskIdx] === PERSON_CATEGORY;
      const px = (y * maskW + x) * 4;
      if (!isPerson) {
        pixels[px + 3] = 0;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL("image/png");
}
