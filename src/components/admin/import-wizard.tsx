"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FolderOpen, Loader2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { QUESTION_TYPE_INFO, type QuestionType } from "@/lib/constants";
import { indexMediaFiles, matchMedia, parseQuestionWorkbook, readWorkbook, type ImportResult, type ImportRow, type MediaMatchStatus } from "@/lib/excel/import";
import { blurCanvas, canvasToBlob, loadImage, renderCrop, silhouetteCanvas } from "@/lib/image/canvas";
import { DEFAULT_CROP } from "@/lib/image/pixels";
import type { DraftQuestion } from "@/lib/quiz/schema";
import { replaceExtension, uploadMedia } from "@/lib/upload";
import { cn } from "@/lib/utils";

export interface ImportedBatch {
  rows: { roundTitle: string; question: DraftQuestion }[];
  mediaUrls: Record<string, string>;
}

function StatusBadge({ status, label }: { status: MediaMatchStatus; label: string }) {
  if (status === "not_referenced" || status === "not_required") return <span className="text-xs text-muted-text">—</span>;
  return status === "matched" ? (
    <Badge variant="success">
      <CheckCircle2 /> {label}
    </Badge>
  ) : (
    <Badge variant="destructive">
      <AlertTriangle /> {label} not found
    </Badge>
  );
}

async function processImage(file: File, type: QuestionType) {
  const img = await loadImage(file);
  const cropped = renderCrop(img, DEFAULT_CROP);
  const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
  const effect = QUESTION_TYPE_INFO[type].imageEffect;
  const originalExt = isPng || effect === "silhouette" ? "png" : "jpg";
  const original = await canvasToBlob(cropped, originalExt === "png" ? "image/png" : "image/jpeg", 0.9);
  if (effect === "none") return { original, originalExt, display: null, displayExt: originalExt, effect };
  const displayCanvas = effect === "silhouette" ? silhouetteCanvas(cropped, {}) : blurCanvas(cropped, 4);
  const displayExt = effect === "silhouette" || isPng ? "png" : "jpg";
  const display = await canvasToBlob(displayCanvas, displayExt === "png" ? "image/png" : "image/jpeg", 0.88);
  return { original, originalExt, display, displayExt, effect };
}

export function ImportWizard({
  quizId,
  open,
  onOpenChange,
  onImport,
}: {
  quizId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (batch: ImportedBatch) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [onlyInvalid, setOnlyInvalid] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const workbookInput = useRef<HTMLInputElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);

  const mediaIndex = useMemo(() => indexMediaFiles(mediaFiles), [mediaFiles]);
  const rows = useMemo(() => result?.rows ?? [], [result]);
  const valid = rows.filter((r) => r.valid);
  const invalid = rows.filter((r) => !r.valid);
  const allIssues = [...(result?.workbookErrors ?? []), ...invalid.flatMap((r) => r.errors)];
  const matches = useMemo(() => new Map(rows.map((r) => [r.rowNumber, matchMedia(r, mediaIndex)])), [rows, mediaIndex]);
  const missingMedia = valid.filter((r) => {
    const m = matches.get(r.rowNumber);
    return m?.image === "missing" || m?.audio === "missing";
  }).length;

  const parse = async (file: File) => {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error("Choose an .xlsx or .xls workbook.");
      return;
    }
    setParsing(true);
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const wb = readWorkbook(XLSX, new Uint8Array(await file.arrayBuffer()));
      setResult(parseQuestionWorkbook(XLSX, wb));
    } catch {
      setResult({
        rows: [],
        sheetName: null,
        workbookErrors: [{ rowNumber: 0, column: "Workbook", value: file.name, message: "This file could not be read. Save it as .xlsx and try again." }],
      });
    } finally {
      setParsing(false);
    }
  };

  const runImport = async () => {
    const mediaUrls: Record<string, string> = {};
    const out: ImportedBatch["rows"] = [];
    const jobs = valid.filter((r) => {
      const m = matches.get(r.rowNumber);
      return m?.imageFile || m?.audioFile;
    }).length;
    setProgress({ done: 0, total: jobs });
    let done = 0;
    let failures = 0;
    for (const row of valid) {
      const question = structuredClone(row.question);
      const m = matches.get(row.rowNumber);
      try {
        if (m?.imageFile) {
          const processed = await processImage(m.imageFile, question.type as QuestionType);
          const originalPath = await uploadMedia(processed.original, {
            quizId,
            kind: "image",
            variant: "original",
            fileName: replaceExtension(m.imageFile.name, processed.originalExt),
          });
          mediaUrls[originalPath] = URL.createObjectURL(processed.original);
          question.originalMediaPath = originalPath;
          question.mediaPath = originalPath;
          if (processed.display) {
            const displayPath = await uploadMedia(processed.display, {
              quizId,
              kind: "image",
              variant: processed.effect === "silhouette" ? "silhouette" : "blurred",
              fileName: replaceExtension(m.imageFile.name, processed.displayExt),
            });
            mediaUrls[displayPath] = URL.createObjectURL(processed.display);
            question.mediaPath = displayPath;
          }
        }
        if (m?.audioFile) {
          const audioPath = await uploadMedia(m.audioFile, { quizId, kind: "audio", fileName: m.audioFile.name });
          mediaUrls[audioPath] = URL.createObjectURL(m.audioFile);
          question.audioPath = audioPath;
        }
      } catch {
        failures += 1;
      }
      if (m?.imageFile || m?.audioFile) setProgress({ done: ++done, total: jobs });
      out.push({ roundTitle: row.roundTitle, question });
    }
    setProgress(null);
    if (failures) toast.warning(`${failures} media file(s) failed to upload. Attach them in the editor.`);
    onImport({ rows: out, mediaUrls });
    onOpenChange(false);
    setResult(null);
    setMediaFiles([]);
    setFileName(null);
  };

  const shown: ImportRow[] = onlyInvalid ? invalid : rows;

  return (
    <Dialog open={open} onOpenChange={(o) => !progress && onOpenChange(o)}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-sakura" /> Import from Excel
          </DialogTitle>
          <DialogDescription>
            Upload a workbook and (optionally) the image and audio files it references. Valid rows are added to the editor as unsaved changes — review them and press Save quiz.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <input ref={workbookInput} type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="sr-only" onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void parse(f);
          }} />
          <input ref={mediaInput} type="file" multiple accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/ogg,.png,.jpg,.jpeg,.webp,.mp3,.wav,.ogg" className="sr-only" onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            setMediaFiles((prev) => [...prev.filter((p) => !files.some((f) => f.name.toLowerCase() === p.name.toLowerCase())), ...files]);
          }} />
          <Button onClick={() => workbookInput.current?.click()} disabled={parsing}>
            {parsing ? <Loader2 className="animate-spin" /> : <Upload />} {fileName ? "Choose another workbook" : "Choose workbook (.xlsx, .xls)"}
          </Button>
          <Button variant="outline" onClick={() => mediaInput.current?.click()}>
            <FolderOpen /> Add media files {mediaFiles.length > 0 && `(${mediaFiles.length})`}
          </Button>
          <Button asChild variant="ghost">
            <a href="/api/template" download>
              <Download /> Download template
            </a>
          </Button>
        </div>

        {result && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-semibold text-plum-dark">{fileName}</span>
              {result.sheetName && <Badge variant="outline">Sheet: {result.sheetName}</Badge>}
              <Badge variant="success">{valid.length} valid</Badge>
              <Badge variant={invalid.length ? "destructive" : "outline"}>{invalid.length} invalid</Badge>
              {missingMedia > 0 && <Badge variant="gold">{missingMedia} with missing media</Badge>}
              <div className="ml-auto flex items-center gap-2">
                <Switch id="only-invalid" checked={onlyInvalid} onCheckedChange={setOnlyInvalid} />
                <Label htmlFor="only-invalid">Show only invalid rows</Label>
              </div>
            </div>

            {allIssues.length > 0 && (
              <div className="max-h-56 overflow-auto rounded-xl border-2 border-error/30">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Validation errors</caption>
                  <thead className="sticky top-0 bg-error/10 text-xs uppercase tracking-wider text-error">
                    <tr>
                      <th className="px-3 py-2">Excel row</th>
                      <th className="px-3 py-2">Column</th>
                      <th className="px-3 py-2">Invalid value</th>
                      <th className="px-3 py-2">Required correction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allIssues.map((issue, i) => (
                      <tr key={i} className="border-t border-error/10">
                        <td className="px-3 py-1.5 font-bold tabular-nums">{issue.rowNumber || "—"}</td>
                        <td className="px-3 py-1.5 font-semibold">{issue.column}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{issue.value || <span className="italic text-muted-text">(empty)</span>}</td>
                        <td className="px-3 py-1.5">{issue.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {rows.length > 0 && (
              <div className="max-h-[40dvh] overflow-auto rounded-xl border-2 border-dusty-pink">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Import preview</caption>
                  <thead className="sticky top-0 z-10 bg-blush text-xs uppercase tracking-wider text-plum">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Round</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Question</th>
                      <th className="px-3 py-2">Answer</th>
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">×</th>
                      <th className="px-3 py-2">Image</th>
                      <th className="px-3 py-2">Audio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row) => {
                      const m = matches.get(row.rowNumber)!;
                      const q = row.question;
                      const correct = q.choices.find((c) => c.label === q.correctLabel);
                      return (
                        <tr key={row.rowNumber} className={cn("border-t border-dusty-pink/60 align-top", !row.valid && "bg-error/5")}>
                          <td className="px-3 py-2 font-bold tabular-nums">{row.rowNumber}</td>
                          <td className="px-3 py-2">
                            {row.valid ? (
                              <CheckCircle2 className="size-5 text-emerald-600" aria-label="Valid" />
                            ) : (
                              <span className="inline-flex items-center gap-1 font-semibold text-error">
                                <XCircle className="size-5" /> {row.errors.length}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">{row.roundTitle}</td>
                          <td className="px-3 py-2 text-xs font-semibold">{q.type}</td>
                          <td className="max-w-xs px-3 py-2">{q.prompt || <span className="italic text-muted-text">(empty)</span>}</td>
                          <td className="px-3 py-2">{correct?.text ? `${q.correctLabel}: ${correct.text}` : q.correctLabel}</td>
                          <td className="px-3 py-2 tabular-nums">{q.timeLimitSeconds}s</td>
                          <td className="px-3 py-2 tabular-nums">{q.multiplier}×</td>
                          <td className="px-3 py-2">
                            <StatusBadge status={m.image} label={q.imageFileName ?? "Image"} />
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={m.audio} label={q.audioFileName ?? "Audio"} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {missingMedia > 0 && (
              <p className="flex items-center gap-2 rounded-xl bg-gold/10 p-3 text-sm text-[#7a4f22]">
                <AlertTriangle className="size-4 shrink-0" />
                Questions with missing media can still be imported; they are flagged in the editor so you can attach the files later.
              </p>
            )}
          </div>
        )}

        {progress && (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-plum">
              Preparing and uploading media… {progress.done} / {progress.total}
            </p>
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 100} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={!!progress}>
            Cancel
          </Button>
          <Button onClick={() => void runImport()} disabled={!valid.length || !!progress}>
            {progress && <Loader2 className="animate-spin" />} Add {valid.length} valid question{valid.length === 1 ? "" : "s"} to the editor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
