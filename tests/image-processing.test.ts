import { describe, expect, it } from "vitest";
import { blurPixels, createPixelImage, cropRect, hasTransparency, makeSilhouette, subjectMask, type PixelImage } from "@/lib/image/pixels";

function setPixel(img: PixelImage, x: number, y: number, rgba: [number, number, number, number]) {
  img.data.set(rgba, (y * img.width + x) * 4);
}

function alphaAt(img: PixelImage, x: number, y: number) {
  return img.data[(y * img.width + x) * 4 + 3];
}

/** 9×9 white canvas with a red 5×5 square that has a white 1px hole in the middle. */
function characterOnWhite(): PixelImage {
  const img = createPixelImage(9, 9, [255, 255, 255, 255]);
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) setPixel(img, x, y, [200, 30, 40, 255]);
  setPixel(img, 4, 4, [255, 255, 255, 255]);
  return img;
}

describe("silhouette generation", () => {
  it("removes the near-white background and fills the subject black", () => {
    const out = makeSilhouette(characterOnWhite());
    expect(alphaAt(out, 0, 0)).toBe(0);
    expect(alphaAt(out, 8, 8)).toBe(0);
    const i = (3 * 9 + 3) * 4;
    expect([...out.data.slice(i, i + 4)]).toEqual([0, 0, 0, 255]);
  });

  it("keeps enclosed white areas in edge mode and removes them in 'all' mode", () => {
    expect(alphaAt(makeSilhouette(characterOnWhite(), { mode: "edges" }), 4, 4)).toBe(255);
    expect(alphaAt(makeSilhouette(characterOnWhite(), { mode: "all" }), 4, 4)).toBe(0);
  });

  it("respects the white threshold", () => {
    const img = createPixelImage(3, 3, [230, 230, 230, 255]);
    setPixel(img, 1, 1, [10, 10, 10, 255]);
    expect(subjectMask(img, { whiteThreshold: 10 }).reduce((a, b) => a + b, 0)).toBe(9);
    expect(subjectMask(img, { whiteThreshold: 40 }).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("preserves existing transparency and soft edges", () => {
    const img = createPixelImage(5, 5, [0, 0, 0, 0]);
    setPixel(img, 2, 2, [120, 200, 90, 255]);
    setPixel(img, 1, 2, [120, 200, 90, 128]);
    expect(hasTransparency(img)).toBe(true);
    const out = makeSilhouette(img);
    expect(alphaAt(out, 2, 2)).toBe(255);
    expect(alphaAt(out, 1, 2)).toBe(128);
    expect(alphaAt(out, 0, 0)).toBe(0);
  });

  it("can grow or shrink the edge", () => {
    const count = (m: Uint8Array) => m.reduce((a, b) => a + b, 0);
    const base = count(subjectMask(characterOnWhite()));
    expect(count(subjectMask(characterOnWhite(), { edgeAdjust: 1 }))).toBeGreaterThan(base);
    expect(count(subjectMask(characterOnWhite(), { edgeAdjust: -1 }))).toBeLessThan(base);
  });
});

describe("blur and crop", () => {
  it("blurs a hard edge into a gradient without changing size", () => {
    const img = createPixelImage(20, 1, [0, 0, 0, 255]);
    for (let x = 10; x < 20; x++) setPixel(img, x, 0, [255, 255, 255, 255]);
    const out = blurPixels(img, 4);
    expect(out.width).toBe(20);
    const at = (x: number) => out.data[x * 4];
    expect(at(0)).toBeLessThan(at(9));
    expect(at(9)).toBeLessThan(at(10));
    expect(at(10)).toBeLessThan(at(19));
    expect(at(9)).toBeGreaterThan(0);
    expect(blurPixels(img, 0).data).toEqual(img.data);
  });

  it("computes crop rectangles for aspect, zoom and focus", () => {
    expect(cropRect(1600, 900, { aspect: "original", zoom: 1, focusX: 0.5, focusY: 0.5 })).toEqual({ x: 0, y: 0, width: 1600, height: 900 });
    expect(cropRect(1600, 900, { aspect: "1:1", zoom: 1, focusX: 0.5, focusY: 0.5 })).toEqual({ x: 350, y: 0, width: 900, height: 900 });
    expect(cropRect(1600, 900, { aspect: "1:1", zoom: 2, focusX: 0, focusY: 1 })).toEqual({ x: 0, y: 450, width: 450, height: 450 });
  });
});
