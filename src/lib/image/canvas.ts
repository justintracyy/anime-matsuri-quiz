"use client";

import { blurPixels, cropRect, makeSilhouette, type CropSettings, type PixelImage, type SilhouetteOptions } from "./pixels";

export const MAX_IMAGE_EDGE = 1600;

export function loadImage(src: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (typeof src !== "string") URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (typeof src !== "string") URL.revokeObjectURL(url);
      reject(new Error("This image could not be loaded. Try a PNG, JPG or WebP file."));
    };
    img.src = url;
  });
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  return ctx;
}

/** Crop + downscale so the long edge is at most MAX_IMAGE_EDGE. */
export function renderCrop(img: HTMLImageElement | HTMLCanvasElement, crop: CropSettings, maxEdge = MAX_IMAGE_EDGE) {
  const sw = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const sh = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const rect = cropRect(sw, sh, crop);
  const scale = Math.min(1, maxEdge / Math.max(rect.width, rect.height));
  const canvas = createCanvas(rect.width * scale, rect.height * scale);
  const ctx = context(canvas);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToPixels(canvas: HTMLCanvasElement): PixelImage {
  const data = context(canvas).getImageData(0, 0, canvas.width, canvas.height);
  return { data: data.data, width: data.width, height: data.height };
}

export function pixelsToCanvas(img: PixelImage): HTMLCanvasElement {
  const canvas = createCanvas(img.width, img.height);
  const imageData = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  context(canvas).putImageData(imageData, 0, 0);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not export the image."))), type, quality);
  });
}

export function silhouetteCanvas(source: HTMLCanvasElement, options: Partial<SilhouetteOptions>): HTMLCanvasElement {
  return pixelsToCanvas(makeSilhouette(canvasToPixels(source), options));
}

/** Blur radius is relative to the image size so small and large images look alike. */
export function blurCanvas(source: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const radius = (Math.max(source.width, source.height) / 100) * strength;
  // Blurring a downscaled copy is much faster and visually identical.
  const factor = Math.min(1, 480 / Math.max(source.width, source.height));
  const small = createCanvas(source.width * factor, source.height * factor);
  context(small).drawImage(source, 0, 0, small.width, small.height);
  const blurred = pixelsToCanvas(blurPixels(canvasToPixels(small), radius * factor));
  const out = createCanvas(source.width, source.height);
  const ctx = context(out);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(blurred, 0, 0, out.width, out.height);
  return out;
}

export function fileBaseName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}
