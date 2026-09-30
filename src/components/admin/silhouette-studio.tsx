"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileArchive, Info, Link2, Loader2, Pencil, Trash2, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { SectionEyebrow } from "@/components/brand/brand";
import { ImageProcessorDialog, SilhouetteControls } from "@/components/media/image-processor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, apiFetch } from "@/lib/api/client";
import { QUESTION_TYPE_INFO, SILHOUETTE_TIP, type QuestionType } from "@/lib/constants";
import { canvasToBlob, canvasToPixels, fileBaseName, loadImage, renderCrop, silhouetteCanvas } from "@/lib/image/canvas";
import { DEFAULT_CROP, DEFAULT_SILHOUETTE_OPTIONS, hasTransparency, type SilhouetteOptions } from "@/lib/image/pixels";
import type { QuizListItem } from "@/lib/quiz/schema";
import { uploadMedia } from "@/lib/upload";

interface Item {
  id: string;
  file: File;
  originalUrl: string;
  original: Blob | null;
  silhouette: Blob | null;
  silhouetteUrl: string | null;
  transparent: boolean;
  manual: boolean;
  error?: string;
}

async function buildSilhouette(file: File, options: SilhouetteOptions) {
  const img = await loadImage(file);
  const cropped = renderCrop(img, DEFAULT_CROP);
  const transparent = hasTransparency(canvasToPixels(cropped));
  const sil = silhouetteCanvas(cropped, options);
  const [original, silhouette] = await Promise.all([canvasToBlob(cropped, "image/png"), canvasToBlob(sil, "image/png")]);
  return { original, silhouette, transparent };
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SilhouetteStudio() {
  const [items, setItems] = useState<Item[]>([]);
  const [options, setOptions] = useState<SilhouetteOptions>(DEFAULT_SILHOUETTE_OPTIONS);
  const [editing, setEditing] = useState<Item | null>(null);
  const [attaching, setAttaching] = useState<Item | null>(null);
  const [zipping, setZipping] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<Item[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const processItem = useCallback(async (item: Item, opts: SilhouetteOptions) => {
    try {
      const result = await buildSilhouette(item.file, opts);
      setItems((list) =>
        list.map((x) => {
          if (x.id !== item.id || x.manual) return x;
          if (x.silhouetteUrl) URL.revokeObjectURL(x.silhouetteUrl);
          return { ...x, ...result, silhouetteUrl: URL.createObjectURL(result.silhouette), error: undefined };
        }),
      );
    } catch (e) {
      setItems((list) => list.map((x) => (x.id === item.id ? { ...x, error: e instanceof Error ? e.message : "Failed" } : x)));
    }
  }, []);

  // Re-run automatic processing when global options change (manual edits are kept).
  useEffect(() => {
    const id = window.setTimeout(() => {
      for (const item of itemsRef.current) if (!item.manual) void processItem(item, options);
    }, 250);
    return () => window.clearTimeout(id);
  }, [options, processItem]);

  const addFiles = (files: File[]) => {
    const accepted = files.filter((f) => /image\/(png|jpeg|webp)/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name));
    if (accepted.length < files.length) toast.warning("Only PNG, JPG and WebP images are supported.");
    const next: Item[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      originalUrl: URL.createObjectURL(file),
      original: null,
      silhouette: null,
      silhouetteUrl: null,
      transparent: false,
      manual: false,
    }));
    setItems((list) => [...list, ...next]);
    for (const item of next) void processItem(item, options);
  };

  const downloadZip = async () => {
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const used = new Set<string>();
      for (const item of items) {
        if (!item.silhouette) continue;
        let name = `${fileBaseName(item.file.name)}-silhouette.png`;
        for (let n = 2; used.has(name); n++) name = `${fileBaseName(item.file.name)}-silhouette-${n}.png`;
        used.add(name);
        zip.file(name, item.silhouette);
      }
      downloadBlob(await zip.generateAsync({ type: "blob" }), "silhouettes.zip");
    } finally {
      setZipping(false);
    }
  };

  const ready = items.filter((i) => i.silhouette).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionEyebrow>Media tools</SectionEyebrow>
          <h1 className="mt-2 font-serif text-4xl font-bold">Silhouette generator</h1>
          <p className="text-muted-text">Batch-convert character art into black silhouettes, then download or attach them to questions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            className="sr-only"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <Button onClick={() => input.current?.click()}>
            <Upload /> Upload images
          </Button>
          <Button variant="outline" onClick={() => void downloadZip()} disabled={!ready || zipping}>
            {zipping ? <Loader2 className="animate-spin" /> : <FileArchive />} Download all as ZIP
          </Button>
        </div>
      </div>

      <p className="flex items-center gap-2 rounded-2xl border-2 border-lavender/30 bg-lavender-mist px-4 py-3 font-semibold text-plum">
        <Info className="size-5 shrink-0" /> {SILHOUETTE_TIP}
      </p>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Settings for all images</CardTitle>
          </CardHeader>
          <CardContent>
            <SilhouetteControls value={options} onChange={setOptions} />
          </CardContent>
        </Card>

        <div
          className="space-y-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          {items.length === 0 && (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-dusty-pink bg-white p-12 text-muted-text transition hover:border-sakura hover:bg-blush/40"
            >
              <Wand2 className="size-10 text-sakura" />
              <span className="font-semibold text-plum-dark">Drop images here or click to upload</span>
              <span className="text-sm">PNG, JPG or WebP — upload one or many at once.</span>
            </button>
          )}
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex flex-col gap-4 pt-5 md:flex-row md:items-center">
                <div className="grid flex-1 grid-cols-2 gap-3">
                  <figure className="space-y-1">
                    <figcaption className="text-xs font-bold uppercase tracking-wider text-muted-text">Original</figcaption>
                    {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                    <img src={item.originalUrl} alt={`Original ${item.file.name}`} className="h-44 w-full rounded-xl border-2 border-dusty-pink bg-white object-contain" />
                  </figure>
                  <figure className="space-y-1">
                    <figcaption className="text-xs font-bold uppercase tracking-wider text-muted-text">Silhouette</figcaption>
                    {item.silhouetteUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local object URL
                      <img src={item.silhouetteUrl} alt={`Silhouette of ${item.file.name}`} className="h-44 w-full rounded-xl border-2 border-dusty-pink bg-cream object-contain" />
                    ) : (
                      <div className="flex h-44 items-center justify-center rounded-xl border-2 border-dusty-pink bg-cream text-sm text-muted-text">
                        {item.error ?? <Loader2 className="size-5 animate-spin" />}
                      </div>
                    )}
                  </figure>
                </div>
                <div className="flex flex-col gap-2 md:w-52">
                  <p className="truncate font-semibold text-plum-dark" title={item.file.name}>
                    {item.file.name}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {item.transparent ? <Badge variant="success">Transparent PNG</Badge> : <Badge variant="gold">Background removed</Badge>}
                    {item.manual && <Badge variant="lavender">Edited</Badge>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                    <Pencil /> Edit & clean up
                  </Button>
                  <Button size="sm" variant="outline" disabled={!item.silhouette} onClick={() => item.silhouette && downloadBlob(item.silhouette, `${fileBaseName(item.file.name)}-silhouette.png`)}>
                    <Download /> Export PNG
                  </Button>
                  <Button size="sm" variant="sakura" disabled={!item.silhouette} onClick={() => setAttaching(item)}>
                    <Link2 /> Attach to question
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      URL.revokeObjectURL(item.originalUrl);
                      if (item.silhouetteUrl) URL.revokeObjectURL(item.silhouetteUrl);
                      setItems((list) => list.filter((x) => x.id !== item.id));
                    }}
                  >
                    <Trash2 className="text-error" /> Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {editing && (
        <ImageProcessorDialog
          source={editing.file}
          defaultEffect="silhouette"
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          onApply={(result) => {
            setItems((list) =>
              list.map((x) => {
                if (x.id !== editing.id) return x;
                if (x.silhouetteUrl) URL.revokeObjectURL(x.silhouetteUrl);
                return { ...x, original: result.original, silhouette: result.display, silhouetteUrl: URL.createObjectURL(result.display), manual: true };
              }),
            );
          }}
        />
      )}
      <AttachDialog item={attaching} onClose={() => setAttaching(null)} />
    </div>
  );
}

function AttachDialog({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const [quizzes, setQuizzes] = useState<QuizListItem[] | null>(null);
  const [quizId, setQuizId] = useState<string>("");
  const [questions, setQuestions] = useState<{ id: string; type: string; prompt: string; roundTitle: string; hasImage: boolean }[] | null>(null);
  const [questionId, setQuestionId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item || quizzes) return;
    apiFetch<{ quizzes: QuizListItem[] }>("/api/admin/quizzes")
      .then((r) => setQuizzes(r.quizzes))
      .catch(() => toast.error("Could not load quizzes."));
  }, [item, quizzes]);

  useEffect(() => {
    if (!quizId) return;
    let cancelled = false;
    apiFetch<{ questions: NonNullable<typeof questions> }>(`/api/admin/quizzes/${quizId}/questions`)
      .then((r) => !cancelled && setQuestions(r.questions))
      .catch(() => toast.error("Could not load questions."));
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  const attach = async () => {
    if (!item?.silhouette || !questionId) return;
    setSaving(true);
    try {
      const base = fileBaseName(item.file.name);
      const originalBlob = item.original ?? item.file;
      const originalPath = await uploadMedia(originalBlob, { quizId, kind: "image", variant: "original", fileName: `${base}.png`, contentType: "image/png" });
      const silhouettePath = await uploadMedia(item.silhouette, { quizId, kind: "image", variant: "silhouette", fileName: `${base}.png`, contentType: "image/png" });
      await apiFetch(`/api/admin/questions/${questionId}/image`, {
        method: "PATCH",
        json: { mediaPath: silhouettePath, originalMediaPath: originalPath },
      });
      toast.success("Silhouette attached. The original is revealed with the answer.");
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError || e instanceof Error ? e.message : "Could not attach the image.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach to a question</DialogTitle>
          <DialogDescription>The silhouette is shown during the question and the original image is revealed with the answer. Only saved questions are listed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Quiz</Label>
            <Select
              value={quizId}
              onValueChange={(v) => {
                setQuizId(v);
                setQuestions(null);
                setQuestionId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={quizzes ? "Choose a quiz" : "Loading…"} />
              </SelectTrigger>
              <SelectContent>
                {quizzes?.map((q) => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {quizId && (
            <div className="space-y-1.5">
              <Label>Question</Label>
              <Select value={questionId} onValueChange={setQuestionId}>
                <SelectTrigger>
                  <SelectValue placeholder={questions ? "Choose a question" : "Loading…"} />
                </SelectTrigger>
                <SelectContent>
                  {questions?.map((q, i) => (
                    <SelectItem key={q.id} value={q.id}>
                      {i + 1}. {q.prompt.slice(0, 50)} — {QUESTION_TYPE_INFO[q.type as QuestionType]?.label ?? q.type}
                      {q.hasImage ? " (has image)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {questions?.length === 0 && <p className="text-sm text-muted-text">This quiz has no saved questions yet.</p>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void attach()} disabled={!questionId || saving}>
            {saving && <Loader2 className="animate-spin" />} Attach silhouette
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
