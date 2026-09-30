"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Copy, Eye, EyeOff, ImagePlus, Loader2, Music, Save, SlidersHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { HostChoiceGrid } from "@/components/game/choice-display";
import { QuestionImage } from "@/components/game/question-media";
import { AudioClipEditor } from "@/components/media/audio-clip-editor";
import { ImageProcessorDialog, type ImageEffect, type ProcessedImage } from "@/components/media/image-processor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CHOICE_LABELS, CHOICE_STYLES, MULTIPLIER_LABEL, QUESTION_TYPES, QUESTION_TYPE_INFO, type ChoiceLabel, type QuestionType } from "@/lib/constants";
import type { DraftQuestion } from "@/lib/quiz/schema";
import { replaceExtension, uploadMedia } from "@/lib/upload";
import { cn } from "@/lib/utils";

export function defaultEffectFor(type: QuestionType): ImageEffect {
  return QUESTION_TYPE_INFO[type].imageEffect;
}

export function QuestionEditor({
  quizId,
  number,
  question,
  mediaUrls,
  onMediaUrl,
  onChange,
  onDuplicate,
  onDelete,
  onSave,
  saving,
  dirty,
}: {
  quizId: string;
  number: number;
  question: DraftQuestion;
  mediaUrls: Record<string, string>;
  onMediaUrl: (path: string, url: string) => void;
  onChange: (q: DraftQuestion) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
}) {
  const type = question.type as QuestionType;
  const info = QUESTION_TYPE_INFO[type];
  const [preview, setPreview] = useState(false);
  const [processorSource, setProcessorSource] = useState<File | string | null>(null);
  const [processorOpen, setProcessorOpen] = useState(false);
  const [uploading, setUploading] = useState<"image" | "audio" | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<DraftQuestion>) => onChange({ ...question, ...patch });

  const imageUrl = question.mediaPath ? mediaUrls[question.mediaPath] : undefined;
  const originalUrl = question.originalMediaPath ? mediaUrls[question.originalMediaPath] : undefined;
  const audioUrl = question.audioPath ? mediaUrls[question.audioPath] : undefined;

  const applyImage = async (result: ProcessedImage, sourceName: string) => {
    setUploading("image");
    try {
      const originalPath = await uploadMedia(result.original, {
        quizId,
        kind: "image",
        variant: "original",
        fileName: replaceExtension(sourceName, result.originalExt),
      });
      onMediaUrl(originalPath, URL.createObjectURL(result.original));
      let displayPath = originalPath;
      if (result.effect !== "none") {
        displayPath = await uploadMedia(result.display, {
          quizId,
          kind: "image",
          variant: result.effect === "silhouette" ? "silhouette" : "blurred",
          fileName: replaceExtension(sourceName, result.displayExt),
        });
        onMediaUrl(displayPath, URL.createObjectURL(result.display));
      }
      set({ mediaPath: displayPath, originalMediaPath: originalPath, imageFileName: question.imageFileName ?? sourceName });
      toast.success("Image ready. Remember to save the quiz.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  };

  const uploadAudio = async (file: File) => {
    setUploading("audio");
    try {
      const path = await uploadMedia(file, { quizId, kind: "audio", fileName: file.name });
      onMediaUrl(path, URL.createObjectURL(file));
      set({ audioPath: path, audioFileName: question.audioFileName ?? file.name, audioStartSeconds: 0, audioDurationSeconds: question.audioDurationSeconds ?? 15 });
      toast.success("Audio uploaded. Choose the clip, then save the quiz.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  };

  const [sourceName, setSourceName] = useState("image.png");

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 border-b-2 border-dusty-pink/60 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sakura">Question {number}</p>
          <CardTitle>{info.label}</CardTitle>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
            {preview ? <EyeOff /> : <Eye />} Preview
          </Button>
          <Button size="sm" variant="outline" onClick={onDuplicate}>
            <Copy /> Duplicate
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete}>
            <Trash2 className="text-error" /> Delete
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving || !dirty}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Save
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-5">
        {preview && (
          <div className="space-y-4 rounded-2xl border-2 border-dashed border-sakura bg-cream p-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-text">Host screen preview</p>
            <p className={cn("text-balance text-center font-serif font-bold text-plum-dark", type === "EMOJI" ? "text-6xl" : "text-2xl")}>
              {type === "QUOTE" ? <q>{question.prompt.replace(/^["“]|["”]$/g, "")}</q> : question.prompt || "Your question prompt"}
            </p>
            {(info.needsImage || question.mediaPath) && (
              <QuestionImage image={question.mediaPath ? { path: null, url: imageUrl } : null} alt="Preview" expectImage={info.needsImage} className="max-h-64" />
            )}
            <HostChoiceGrid
              choices={question.choices.filter((c) => c.text).map((c) => ({ id: c.id, label: c.label as ChoiceLabel, text: c.text }))}
              correctChoiceId={question.choices.find((c) => c.label === question.correctLabel)?.id ?? null}
            />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5 md:col-span-1">
            <Label>Question type</Label>
            <Select value={type} onValueChange={(v) => set({ type: v as QuestionType })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {QUESTION_TYPE_INFO[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-text">{info.description}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`time-${question.id}`}>Time limit (seconds)</Label>
            <Input
              id={`time-${question.id}`}
              type="number"
              min={5}
              max={240}
              value={question.timeLimitSeconds}
              onChange={(e) => set({ timeLimitSeconds: Math.round(Number(e.target.value) || 0) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Point multiplier</Label>
            <Select value={String(question.multiplier)} onValueChange={(v) => set({ multiplier: Number(v) as 1 | 2 | 3 })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m}× — {MULTIPLIER_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`prompt-${question.id}`}>{type === "EMOJI" ? "Emoji sequence" : type === "QUOTE" ? "Quote" : "Question prompt"}</Label>
          <Textarea
            id={`prompt-${question.id}`}
            value={question.prompt}
            maxLength={500}
            placeholder={type === "EMOJI" ? "🍥🦊🍜🥷" : type === "QUOTE" ? "\"Believe it!\"" : "Which anime is this from?"}
            onChange={(e) => set({ prompt: e.target.value })}
            className={type === "EMOJI" ? "text-3xl" : undefined}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold text-plum-dark">Answer choices — select the correct one</legend>
          <div className="grid gap-3 md:grid-cols-2">
            {question.choices.map((choice, i) => {
              const label = CHOICE_LABELS[i];
              const style = CHOICE_STYLES[label];
              const correct = question.correctLabel === label;
              return (
                <div key={choice.id} className={cn("flex items-center gap-2 rounded-2xl border-2 bg-white p-2", correct ? "border-gold ring-2 ring-gold/40" : "border-dusty-pink")}>
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl text-lg text-white", style.bg)} aria-hidden="true">
                    {style.shape}
                  </span>
                  <Input
                    aria-label={`Choice ${label}${i > 1 ? " (optional)" : ""}`}
                    value={choice.text}
                    maxLength={120}
                    placeholder={i > 1 ? `Choice ${label} (optional)` : `Choice ${label}`}
                    onChange={(e) => set({ choices: question.choices.map((c, j) => (j === i ? { ...c, text: e.target.value } : c)) })}
                    className="h-10 border-0 shadow-none focus-visible:ring-0"
                  />
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-xs font-bold text-plum hover:bg-blush">
                    <input
                      type="radio"
                      name={`correct-${question.id}`}
                      checked={correct}
                      onChange={() => set({ correctLabel: label })}
                      className="size-4 accent-[#D8A56D]"
                    />
                    Correct
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor={`explanation-${question.id}`}>Explanation (shown with the answer)</Label>
          <Textarea
            id={`explanation-${question.id}`}
            value={question.explanation ?? ""}
            maxLength={1000}
            onChange={(e) => set({ explanation: e.target.value })}
            placeholder="Optional fun fact"
          />
        </div>

        {/* Image */}
        <section className="space-y-3 rounded-2xl bg-blush/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 font-sans text-sm font-bold text-plum-dark">
              <ImagePlus className="size-4" /> Image {info.needsImage ? <Badge variant="sakura">Required</Badge> : <Badge variant="outline">Optional</Badge>}
            </h4>
            {!question.mediaPath && question.imageFileName && (
              <Badge variant="destructive">
                <AlertTriangle /> Missing: {question.imageFileName}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-start gap-4">
            {question.mediaPath && (
              <div className="flex gap-3">
                <figure className="w-36 space-y-1">
                  <QuestionImage image={{ path: null, url: imageUrl }} alt="Shown during the question" className="h-28 w-36 border-2 border-dusty-pink bg-white object-contain" />
                  <figcaption className="text-center text-[11px] text-muted-text">During question</figcaption>
                </figure>
                {question.originalMediaPath && question.originalMediaPath !== question.mediaPath && (
                  <figure className="w-36 space-y-1">
                    <QuestionImage image={{ path: null, url: originalUrl }} alt="Revealed with the answer" className="h-28 w-36 border-2 border-dusty-pink bg-white object-contain" />
                    <figcaption className="text-center text-[11px] text-muted-text">Revealed</figcaption>
                  </figure>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                ref={imageInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setSourceName(file.name);
                  setProcessorSource(file);
                  setProcessorOpen(true);
                }}
              />
              <Button size="sm" variant="outline" onClick={() => imageInput.current?.click()} disabled={uploading === "image"}>
                {uploading === "image" ? <Loader2 className="animate-spin" /> : <ImagePlus />}
                {question.mediaPath ? "Replace image" : "Upload image"}
              </Button>
              {(originalUrl || imageUrl) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSourceName(question.imageFileName ?? "image.png");
                    setProcessorSource(originalUrl ?? imageUrl ?? null);
                    setProcessorOpen(true);
                  }}
                >
                  <SlidersHorizontal /> Crop / effects
                </Button>
              )}
              {question.mediaPath && (
                <Button size="sm" variant="ghost" onClick={() => set({ mediaPath: null, originalMediaPath: null })}>
                  <X /> Remove
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-text">PNG, JPG or WebP up to 15 MB. Silhouette and blurred versions are generated automatically for those question types.</p>
        </section>

        {/* Audio */}
        {(info.needsAudio || question.audioPath) && (
          <section className="space-y-3 rounded-2xl bg-lavender-mist/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="flex items-center gap-2 font-sans text-sm font-bold text-plum-dark">
                <Music className="size-4" /> Audio clip {info.needsAudio && <Badge variant="sakura">Required</Badge>}
              </h4>
              {!question.audioPath && question.audioFileName && (
                <Badge variant="destructive">
                  <AlertTriangle /> Missing: {question.audioFileName}
                </Badge>
              )}
            </div>
            {audioUrl && (
              <AudioClipEditor
                url={audioUrl}
                start={question.audioStartSeconds ?? 0}
                duration={question.audioDurationSeconds ?? null}
                allowReplay={question.allowAudioReplay ?? true}
                onChange={(v) => set({ audioStartSeconds: v.start, audioDurationSeconds: v.duration, allowAudioReplay: v.allowReplay })}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <input
                ref={audioInput}
                type="file"
                accept="audio/mpeg,audio/wav,audio/x-wav,audio/ogg,.mp3,.wav,.ogg"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadAudio(file);
                }}
              />
              <Button size="sm" variant="outline" onClick={() => audioInput.current?.click()} disabled={uploading === "audio"}>
                {uploading === "audio" ? <Loader2 className="animate-spin" /> : <Music />}
                {question.audioPath ? "Replace audio" : "Upload audio"}
              </Button>
              {question.audioPath && (
                <Button size="sm" variant="ghost" onClick={() => set({ audioPath: null })}>
                  <X /> Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-text">MP3, WAV or OGG up to 15 MB.</p>
          </section>
        )}
      </CardContent>

      <ImageProcessorDialog
        key={typeof processorSource === "string" ? processorSource : processorSource?.name ?? "none"}
        source={processorSource}
        open={processorOpen}
        onOpenChange={setProcessorOpen}
        defaultEffect={defaultEffectFor(type)}
        onApply={(result) => applyImage(result, sourceName)}
      />
    </Card>
  );
}
