export interface PixelImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function createPixelImage(width: number, height: number, fill?: [number, number, number, number]): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) for (let i = 0; i < data.length; i += 4) data.set(fill, i);
  return { data, width, height };
}

export interface SilhouetteOptions {
  /** 0–255. How far from pure white a pixel may be and still count as background. */
  whiteThreshold: number;
  /**
   * "edges" flood-fills near-white only from the image border (keeps white areas
   * inside the character). "all" removes every near-white pixel.
   */
  mode: "edges" | "all";
  /** Pixels with alpha below this are treated as background. */
  alphaCutoff: number;
  /** Negative shrinks the silhouette edge by N pixels, positive grows it. */
  edgeAdjust: number;
  color: [number, number, number];
}

export const DEFAULT_SILHOUETTE_OPTIONS: SilhouetteOptions = {
  whiteThreshold: 40,
  mode: "edges",
  alphaCutoff: 16,
  edgeAdjust: 0,
  color: [0, 0, 0],
};

function isNearWhite(data: Uint8ClampedArray, i: number, threshold: number): boolean {
  return 255 - data[i] <= threshold && 255 - data[i + 1] <= threshold && 255 - data[i + 2] <= threshold;
}

export function hasTransparency(img: PixelImage, cutoff = 250): boolean {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < cutoff) return true;
  return false;
}

/** Returns a mask where 1 = subject, 0 = background. */
export function subjectMask(img: PixelImage, options: Partial<SilhouetteOptions> = {}): Uint8Array {
  const opts = { ...DEFAULT_SILHOUETTE_OPTIONS, ...options };
  const { width, height, data } = img;
  const total = width * height;
  const candidate = new Uint8Array(total);
  const mask = new Uint8Array(total).fill(1);

  for (let p = 0; p < total; p++) {
    const i = p * 4;
    if (data[i + 3] < opts.alphaCutoff) {
      mask[p] = 0; // existing transparency is always preserved as background
    } else if (isNearWhite(data, i, opts.whiteThreshold)) {
      candidate[p] = 1;
    }
  }

  if (opts.mode === "all") {
    for (let p = 0; p < total; p++) if (candidate[p]) mask[p] = 0;
  } else {
    // Flood-fill from the border through near-white or transparent pixels.
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;
    const visited = new Uint8Array(total);
    const push = (p: number) => {
      if (!visited[p] && (candidate[p] || mask[p] === 0)) {
        visited[p] = 1;
        queue[tail++] = p;
      }
    };
    for (let x = 0; x < width; x++) {
      push(x);
      push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
      push(y * width);
      push(y * width + width - 1);
    }
    while (head < tail) {
      const p = queue[head++];
      mask[p] = 0;
      const x = p % width;
      if (x > 0) push(p - 1);
      if (x < width - 1) push(p + 1);
      if (p >= width) push(p - width);
      if (p < total - width) push(p + width);
    }
  }

  const steps = Math.round(opts.edgeAdjust);
  for (let s = 0; s < Math.abs(steps); s++) morph(mask, width, height, steps > 0 ? "dilate" : "erode");
  return mask;
}

function morph(mask: Uint8Array, width: number, height: number, op: "erode" | "dilate") {
  const src = mask.slice();
  const target = op === "erode" ? 0 : 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (src[p] === target) continue;
      if (
        (x > 0 && src[p - 1] === target) ||
        (x < width - 1 && src[p + 1] === target) ||
        (y > 0 && src[p - width] === target) ||
        (y < height - 1 && src[p + width] === target)
      ) {
        mask[p] = target;
      }
    }
  }
}

/** Convert visible subject pixels to a solid colour and make the background transparent. */
export function makeSilhouette(img: PixelImage, options: Partial<SilhouetteOptions> = {}): PixelImage {
  const opts = { ...DEFAULT_SILHOUETTE_OPTIONS, ...options };
  const mask = subjectMask(img, opts);
  const out = createPixelImage(img.width, img.height);
  const [r, g, b] = opts.color;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const i = p * 4;
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
    // Keep soft anti-aliased edges from source transparency; grown pixels become opaque.
    out.data[i + 3] = img.data[i + 3] >= opts.alphaCutoff ? img.data[i + 3] : 255;
  }
  return out;
}

/** Separable box blur, three passes ≈ Gaussian. Works in every browser (no ctx.filter). */
export function blurPixels(img: PixelImage, radius: number): PixelImage {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return { ...img, data: img.data.slice() };
  const { width, height } = img;
  const a = img.data.slice();
  const b = new Uint8ClampedArray(a.length);
  const passRadius = Math.max(1, Math.round(r / Math.sqrt(3)));
  for (let pass = 0; pass < 3; pass++) {
    boxPass(a, b, width, height, passRadius, true);
    boxPass(b, a, width, height, passRadius, false);
  }
  return { data: a, width, height };
}

function boxPass(src: Uint8ClampedArray, dst: Uint8ClampedArray, width: number, height: number, r: number, horizontal: boolean) {
  const lines = horizontal ? height : width;
  const len = horizontal ? width : height;
  const stride = horizontal ? 4 : width * 4;
  const window = r * 2 + 1;
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * width * 4 : line * 4;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const idx = Math.min(len - 1, Math.max(0, k));
        sum += src[base + idx * stride + c];
      }
      for (let i = 0; i < len; i++) {
        dst[base + i * stride + c] = sum / window;
        const outIdx = Math.max(0, i - r);
        const inIdx = Math.min(len - 1, i + r + 1);
        sum += src[base + inIdx * stride + c] - src[base + outIdx * stride + c];
      }
    }
  }
}

export interface CropSettings {
  aspect: "original" | "16:9" | "4:3" | "1:1" | "3:4";
  zoom: number;
  /** Focus point, 0–1 in each axis. */
  focusX: number;
  focusY: number;
}

export const DEFAULT_CROP: CropSettings = { aspect: "original", zoom: 1, focusX: 0.5, focusY: 0.5 };

const ASPECTS: Record<Exclude<CropSettings["aspect"], "original">, number> = {
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "1:1": 1,
  "3:4": 3 / 4,
};

/** Source rectangle for a crop of the given image size. */
export function cropRect(imageWidth: number, imageHeight: number, crop: CropSettings) {
  const ratio = crop.aspect === "original" ? imageWidth / imageHeight : ASPECTS[crop.aspect];
  let w = imageWidth;
  let h = w / ratio;
  if (h > imageHeight) {
    h = imageHeight;
    w = h * ratio;
  }
  const zoom = Math.max(1, crop.zoom);
  w /= zoom;
  h /= zoom;
  const cx = crop.focusX * imageWidth;
  const cy = crop.focusY * imageHeight;
  const x = Math.min(Math.max(0, cx - w / 2), imageWidth - w);
  const y = Math.min(Math.max(0, cy - h / 2), imageHeight - h);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}
