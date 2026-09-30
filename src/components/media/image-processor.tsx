"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Info, Loader2, Paintbrush, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SILHOUETTE_TIP } from "@/lib/constants";
import { blurCanvas, canvasToBlob, loadImage, renderCrop, silhouetteCanvas } from "@/lib/image/canvas";
import { DEFAULT_CROP, DEFAULT_SILHOUETTE_OPTIONS, type CropSettings, type SilhouetteOptions } from "@/lib/image/pixels";

export type ImageEffect = "none" | "blur" | "silhouette";

export interface ProcessedImage {
  original: Blob;
  display: Blob;
  effect: ImageEffect;
  originalExt: "png" | "jpg";
  displayExt: "png" | "jpg";
}

const CHECKER =
  "bg-[length:20px_20px] bg-[linear-gradient(45deg,#f6ecec_25%,transparent_25%),linear-gradient(-45deg,#f6ecec_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f6ecec_75%),linear-gradient(-45deg,transparent_75%,#f6ecec_75%)] bg-[position:0_0,0_10px,10px_-10px,-10px_0]";

/** Crop / position, then optionally blur or silhouette. Shows original and result side by side. */
export function ImageProcessorDialog({
  source,
  defaultEffect,
  open,
  onOpenChange,
  onApply,
}: {
  source: File | Blob | string | null;
  defaultEffect: ImageEffect;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (result: ProcessedImage) => Promise<void> | void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropSettings>(DEFAULT_CROP);
  const [effect, setEffect] = useState<ImageEffect>(defaultEffect);
  const [blur, setBlur] = useState(4);
  const [sil, setSil] = useState<SilhouetteOptions>(DEFAULT_SILHOUETTE_OPTIONS);
  const [applying, setApplying] = useState(false);
  const originalRef = useRef<HTMLCanvasElement>(null);
  const resultRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!source || !open) return;
    let cancelled = false;
    loadImage(source)
      .then((image) => {
        if (cancelled) return;
        setImg(image);
        setLoadError(null);
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [source, open]);

  const cropped = useMemo(() => (img ? renderCrop(img, crop) : null), [img, crop]);

  const result = useMemo(() => {
    if (!cropped) return null;
    if (effect === "silhouette") return silhouetteCanvas(cropped, sil);
    if (effect === "blur") return blurCanvas(cropped, blur);
    return cropped;
  }, [cropped, effect, sil, blur]);

  useEffect(() => {
    drawInto(originalRef.current, cropped);
    drawInto(resultRef.current, result);
  }, [cropped, result]);

  const apply = async () => {
    if (!cropped || !result) return;
    setApplying(true);
    try {
      const pngSource = typeof source !== "string" && source?.type === "image/png";
      const originalExt = pngSource || effect === "silhouette" ? "png" : "jpg";
      const original = await canvasToBlob(cropped, originalExt === "png" ? "image/png" : "image/jpeg", 0.9);
      const finalCanvas = resultRef.current ?? result;
      const displayExt = effect === "silhouette" || originalExt === "png" ? "png" : "jpg";
      const display = effect === "none" ? original : await canvasToBlob(finalCanvas, displayExt === "png" ? "image/png" : "image/jpeg", 0.88);
      await onApply({ original, display, effect, originalExt, displayExt: effect === "none" ? originalExt : displayExt });
      onOpenChange(false);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Prepare image</DialogTitle>
          <DialogDescription>Crop and position the image, then choose how it appears during the question. The unaltered image is revealed with the answer.</DialogDescription>
        </DialogHeader>
        {loadError && <p className="rounded-xl bg-error/10 p-3 text-sm font-semibold text-error">{loadError}</p>}
        {!img && !loadError && (
          <p className="flex items-center gap-2 text-muted-text">
            <Loader2 className="size-4 animate-spin" /> Loading image…
          </p>
        )}
        {img && (
          <div className="grid gap-5 md:grid-cols-[1fr_260px]">
            <div className="grid grid-cols-2 gap-3">
              <figure className="space-y-1">
                <figcaption className="text-xs font-bold uppercase tracking-wider text-muted-text">Original (revealed)</figcaption>
                <div className={`flex aspect-square items-center justify-center overflow-hidden rounded-xl border-2 border-dusty-pink ${CHECKER}`}>
                  <canvas ref={originalRef} className="max-h-full max-w-full" />
                </div>
              </figure>
              <figure className="space-y-1">
                <figcaption className="text-xs font-bold uppercase tracking-wider text-muted-text">During question</figcaption>
                <div className={`flex aspect-square items-center justify-center overflow-hidden rounded-xl border-2 border-dusty-pink ${CHECKER}`}>
                  <canvas ref={resultRef} className="max-h-full max-w-full" />
                </div>
              </figure>
              {effect === "silhouette" && <SilhouetteBrush canvasRef={resultRef} />}
            </div>
            <div className="space-y-4">
              <Tabs value={effect} onValueChange={(v) => setEffect(v as ImageEffect)}>
                <TabsList className="w-full">
                  <TabsTrigger value="none" className="flex-1">None</TabsTrigger>
                  <TabsTrigger value="blur" className="flex-1">Blur</TabsTrigger>
                  <TabsTrigger value="silhouette" className="flex-1">Silhouette</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="space-y-1.5">
                <Label>Aspect ratio</Label>
                <Select value={crop.aspect} onValueChange={(v) => setCrop((c) => ({ ...c, aspect: v as CropSettings["aspect"] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="original">Original</SelectItem>
                    <SelectItem value="16:9">16:9 (projector)</SelectItem>
                    <SelectItem value="4:3">4:3</SelectItem>
                    <SelectItem value="1:1">Square</SelectItem>
                    <SelectItem value="3:4">Portrait 3:4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <SliderField label="Zoom" value={crop.zoom} min={1} max={4} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(zoom) => setCrop((c) => ({ ...c, zoom }))} />
              <SliderField label="Horizontal position" value={crop.focusX} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(focusX) => setCrop((c) => ({ ...c, focusX }))} />
              <SliderField label="Vertical position" value={crop.focusY} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(focusY) => setCrop((c) => ({ ...c, focusY }))} />
              {effect === "blur" && <SliderField label="Blur strength" value={blur} min={1} max={12} step={0.5} format={(v) => v.toFixed(1)} onChange={setBlur} />}
              {effect === "silhouette" && <SilhouetteControls value={sil} onChange={setSil} />}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!result || applying}>
            {applying && <Loader2 className="animate-spin" />} Use this image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function drawInto(target: HTMLCanvasElement | null, source: HTMLCanvasElement | null) {
  if (!target || !source) return;
  target.width = source.width;
  target.height = source.height;
  const ctx = target.getContext("2d");
  ctx?.clearRect(0, 0, target.width, target.height);
  ctx?.drawImage(source, 0, 0);
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs font-semibold tabular-nums text-muted-text">{format ? format(value) : value}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} thumbLabels={[label]} />
    </div>
  );
}

export function SilhouetteControls({ value, onChange }: { value: SilhouetteOptions; onChange: (v: SilhouetteOptions) => void }) {
  return (
    <div className="space-y-4">
      <p className="flex gap-2 rounded-xl bg-lavender-mist p-3 text-xs font-semibold text-plum">
        <Info className="size-4 shrink-0" /> {SILHOUETTE_TIP}
      </p>
      <SliderField
        label="Background removal threshold"
        value={value.whiteThreshold}
        min={0}
        max={160}
        step={1}
        onChange={(whiteThreshold) => onChange({ ...value, whiteThreshold })}
      />
      <div className="space-y-1.5">
        <Label>Background detection</Label>
        <Select value={value.mode} onValueChange={(mode) => onChange({ ...value, mode: mode as SilhouetteOptions["mode"] })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="edges">From edges (keeps white inside)</SelectItem>
            <SelectItem value="all">Remove all near-white</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <SliderField
        label="Edge cleanup (shrink ↔ grow)"
        value={value.edgeAdjust}
        min={-4}
        max={4}
        step={1}
        format={(v) => (v > 0 ? `+${v}px` : `${v}px`)}
        onChange={(edgeAdjust) => onChange({ ...value, edgeAdjust })}
      />
    </div>
  );
}

/** Manual cleanup: paint black or erase directly on the silhouette canvas. */
export function SilhouetteBrush({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const [mode, setMode] = useState<"erase" | "paint" | null>(null);
  const [size, setSize] = useState(14);
  const [undoCount, setUndoCount] = useState(0);
  const history = useRef<ImageData[]>([]);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mode) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const point = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height };
    };
    const scale = () => canvas.width / canvas.getBoundingClientRect().width;
    const stroke = (e: PointerEvent) => {
      const { x, y } = point(e);
      ctx.save();
      ctx.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over";
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(x, y, (size / 2) * scale(), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    const down = (e: PointerEvent) => {
      history.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (history.current.length > 20) history.current.shift();
      setUndoCount(history.current.length);
      drawing.current = true;
      canvas.setPointerCapture(e.pointerId);
      stroke(e);
    };
    const move = (e: PointerEvent) => drawing.current && stroke(e);
    const up = () => (drawing.current = false);
    canvas.style.touchAction = "none";
    canvas.style.cursor = "crosshair";
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", up);
    return () => {
      canvas.style.cursor = "";
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", up);
    };
  }, [canvasRef, mode, size]);

  return (
    <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-dusty-pink p-2">
      <span className="text-xs font-bold uppercase tracking-wider text-muted-text">Manual cleanup</span>
      <Button size="sm" variant={mode === "erase" ? "default" : "outline"} onClick={() => setMode(mode === "erase" ? null : "erase")} aria-pressed={mode === "erase"}>
        <Eraser /> Erase
      </Button>
      <Button size="sm" variant={mode === "paint" ? "default" : "outline"} onClick={() => setMode(mode === "paint" ? null : "paint")} aria-pressed={mode === "paint"}>
        <Paintbrush /> Paint
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={undoCount === 0}
        onClick={() => {
          const prev = history.current.pop();
          setUndoCount(history.current.length);
          if (prev) canvasRef.current?.getContext("2d")?.putImageData(prev, 0, 0);
        }}
      >
        <Undo2 /> Undo
      </Button>
      <div className="ml-auto w-32">
        <Slider value={[size]} min={4} max={48} step={1} onValueChange={([v]) => setSize(v)} thumbLabels={["Brush size"]} />
      </div>
    </div>
  );
}
