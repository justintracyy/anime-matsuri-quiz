"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, FileSpreadsheet, ImageOff, Loader2, Plus, Save, Send, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api/client";
import { QUESTION_TYPE_INFO, type QuestionType } from "@/lib/constants";
import type { QuizDetail } from "@/lib/quiz/repository";
import {
  checkQuizReadiness,
  createBlankQuestion,
  createBlankRound,
  duplicateQuestion,
  newId,
  quizContentSchema,
  type DraftQuestion,
  type QuizContent,
} from "@/lib/quiz/schema";
import { cn } from "@/lib/utils";
import { HostLiveButton } from "./host-button";
import { ImportWizard, type ImportedBatch } from "./import-wizard";
import { QuestionEditor } from "./question-editor";

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function QuizEditor({ initial }: { initial: QuizDetail }) {
  const router = useRouter();
  const search = useSearchParams();
  const [content, setContent] = useState<QuizContent>(initial.content);
  const [status, setStatus] = useState(initial.status);
  const [mediaUrls, setMediaUrls] = useState(initial.mediaUrls);
  const [selectedId, setSelectedId] = useState<string | null>(initial.content.rounds[0]?.questions[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(search.get("import") === "1");
  const [pendingDelete, setPendingDelete] = useState<{ kind: "question" | "round"; id: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = useCallback((fn: (c: QuizContent) => QuizContent) => {
    setContent((c) => fn(c));
    setDirty(true);
  }, []);

  const allQuestions = useMemo(() => content.rounds.flatMap((r) => r.questions.map((q) => ({ q, roundId: r.id }))), [content]);
  const selected = allQuestions.find((x) => x.q.id === selectedId) ?? null;
  const selectedNumber = selected ? allQuestions.findIndex((x) => x.q.id === selected.q.id) + 1 : 0;
  const readiness = useMemo(() => checkQuizReadiness(content), [content]);

  const updateQuestion = (q: DraftQuestion) =>
    update((c) => ({ ...c, rounds: c.rounds.map((r) => ({ ...r, questions: r.questions.map((x) => (x.id === q.id ? q : x)) })) }));

  const addQuestion = (roundId: string) => {
    const round = content.rounds.find((r) => r.id === roundId);
    const q = createBlankQuestion("TRIVIA", (round?.multiplier ?? 1) as 1 | 2 | 3);
    update((c) => ({ ...c, rounds: c.rounds.map((r) => (r.id === roundId ? { ...r, questions: [...r.questions, q] } : r)) }));
    setSelectedId(q.id);
  };

  const addRound = () => {
    const round = createBlankRound(content.rounds.length);
    const q = createBlankQuestion();
    update((c) => ({ ...c, rounds: [...c.rounds, { ...round, questions: [q] }] }));
    setSelectedId(q.id);
  };

  const save = async (): Promise<boolean> => {
    const parsed = quizContentSchema.safeParse(content);
    if (!parsed.success) {
      const messages = parsed.error.issues.slice(0, 6).map((issue) => {
        const [, rIdx, , qIdx] = issue.path as (string | number)[];
        if (typeof rIdx === "number" && typeof qIdx === "number") {
          const flatIndex = content.rounds.slice(0, rIdx).reduce((n, r) => n + r.questions.length, 0) + qIdx + 1;
          return `Question ${flatIndex}: ${issue.message}`;
        }
        if (typeof rIdx === "number") return `Round ${rIdx + 1}: ${issue.message}`;
        return issue.message;
      });
      setValidationErrors(messages);
      toast.error("Fix the highlighted problems before saving.");
      return false;
    }
    setSaving(true);
    try {
      const detail = await apiFetch<QuizDetail>(`/api/admin/quizzes/${initial.id}`, { method: "PUT", json: content });
      setContent(detail.content);
      setMediaUrls((m) => ({ ...m, ...detail.mediaUrls }));
      setStatus(detail.status);
      setDirty(false);
      setValidationErrors([]);
      toast.success("Quiz saved.");
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const setPublished = async (publish: boolean) => {
    if (dirty && !(await save())) return;
    try {
      const res = await apiFetch<{ warnings: string[] }>(`/api/admin/quizzes/${initial.id}`, {
        method: "PATCH",
        json: { status: publish ? "published" : "draft" },
      });
      setStatus(publish ? "published" : "draft");
      if (publish && res.warnings.length) toast.warning(`Published with ${res.warnings.length} warning(s): ${res.warnings[0]}`);
      else toast.success(publish ? "Quiz published — you can host it now." : "Quiz moved back to draft.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not change the status.");
    }
  };

  const onImport = (batch: ImportedBatch) => {
    setMediaUrls((m) => ({ ...m, ...batch.mediaUrls }));
    update((c) => {
      const rounds = c.rounds.map((r) => ({ ...r, questions: [...r.questions] }));
      for (const row of batch.rows) {
        let round = rounds.find((r) => r.title.trim().toLowerCase() === row.roundTitle.trim().toLowerCase());
        if (!round) {
          round = { id: newId(), title: row.roundTitle, multiplier: row.question.multiplier as 1 | 2 | 3, questions: [] };
          rounds.push(round);
        }
        round.questions.push(row.question);
      }
      return { ...c, rounds };
    });
    if (batch.rows[0]) setSelectedId(batch.rows[0].question.id);
    toast.success(`${batch.rows.length} questions added. Review them, then press Save quiz.`);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "question") {
      const flat = allQuestions.map((x) => x.q.id);
      const idx = flat.indexOf(pendingDelete.id);
      update((c) => ({ ...c, rounds: c.rounds.map((r) => ({ ...r, questions: r.questions.filter((q) => q.id !== pendingDelete.id) })) }));
      setSelectedId(flat[idx + 1] ?? flat[idx - 1] ?? null);
    } else {
      update((c) => ({ ...c, rounds: c.rounds.filter((r) => r.id !== pendingDelete.id) }));
    }
    setPendingDelete(null);
  };

  const errorsCount = readiness.filter((i) => i.severity === "error").length;
  const warningIds = new Set(readiness.map((i) => i.questionId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">
            <ArrowLeft /> All quizzes
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status === "published" ? "success" : "lavender"}>{status === "published" ? "Published" : "Draft"}</Badge>
          {dirty && <Badge variant="gold">Unsaved changes</Badge>}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet /> Import from Excel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Save quiz
          </Button>
          {status === "published" ? (
            <Button variant="outline" onClick={() => void setPublished(false)}>
              <Undo2 /> Unpublish
            </Button>
          ) : (
            <Button variant="gold" onClick={() => void setPublished(true)} disabled={errorsCount > 0}>
              <Send /> Publish
            </Button>
          )}
          <HostLiveButton quizId={initial.id} disabled={status !== "published" || dirty} />
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Quiz title</Label>
            <Input id="title" value={content.title} maxLength={200} onChange={(e) => update((c) => ({ ...c, title: e.target.value }))} className="font-serif text-lg font-bold" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subtitle">Subtitle</Label>
            <Input id="subtitle" value={content.subtitle ?? ""} maxLength={200} onChange={(e) => update((c) => ({ ...c, subtitle: e.target.value }))} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={content.description ?? ""} maxLength={2000} onChange={(e) => update((c) => ({ ...c, description: e.target.value }))} className="min-h-14" />
          </div>
        </CardContent>
      </Card>

      {(validationErrors.length > 0 || readiness.length > 0) && (
        <Card className={cn(validationErrors.length || errorsCount ? "border-error/40" : "border-gold/50")}>
          <CardContent className="space-y-1 pt-5 text-sm">
            {validationErrors.map((m) => (
              <p key={m} className="flex items-start gap-2 font-semibold text-error">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {m}
              </p>
            ))}
            {readiness.slice(0, 8).map((i) => (
              <button
                key={`${i.questionId}-${i.message}`}
                type="button"
                onClick={() => i.questionId && setSelectedId(i.questionId)}
                className={cn("flex w-full items-start gap-2 text-left hover:underline", i.severity === "error" ? "text-error" : "text-[#7a4f22]")}
              >
                {i.severity === "error" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <ImageOff className="mt-0.5 size-4 shrink-0" />} {i.message}
              </button>
            ))}
            {readiness.length > 8 && <p className="text-muted-text">…and {readiness.length - 8} more.</p>}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-4" aria-label="Rounds and questions">
          {content.rounds.map((round, rIdx) => (
            <Card key={round.id} className="overflow-hidden">
              <div className="space-y-2 border-b-2 border-dusty-pink/60 bg-blush/50 p-3">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Round ${rIdx + 1} title`}
                    value={round.title}
                    maxLength={120}
                    onChange={(e) => update((c) => ({ ...c, rounds: c.rounds.map((r) => (r.id === round.id ? { ...r, title: e.target.value } : r)) }))}
                    className="h-9 font-semibold"
                  />
                  <Button size="icon-sm" variant="ghost" aria-label="Move round up" disabled={rIdx === 0} onClick={() => update((c) => ({ ...c, rounds: move(c.rounds, rIdx, rIdx - 1) }))}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Move round down" disabled={rIdx === content.rounds.length - 1} onClick={() => update((c) => ({ ...c, rounds: move(c.rounds, rIdx, rIdx + 1) }))}>
                    <ArrowDown />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Delete round" onClick={() => setPendingDelete({ kind: "round", id: round.id })}>
                    <Trash2 className="text-error" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-muted-text">Default multiplier</span>
                  <Select
                    value={String(round.multiplier ?? 1)}
                    onValueChange={(v) => {
                      const m = Number(v) as 1 | 2 | 3;
                      update((c) => ({
                        ...c,
                        rounds: c.rounds.map((r) => (r.id === round.id ? { ...r, multiplier: m, questions: r.questions.map((q) => ({ ...q, multiplier: m })) } : r)),
                      }));
                    }}
                  >
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1× Regular</SelectItem>
                      <SelectItem value="2">2× Double</SelectItem>
                      <SelectItem value="3">3× Triple</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <ol className="divide-y divide-dusty-pink/50">
                {round.questions.map((q, qIdx) => {
                  const number = allQuestions.findIndex((x) => x.q.id === q.id) + 1;
                  return (
                    <li key={q.id} className={cn("flex items-center gap-1 pr-1", q.id === selectedId && "bg-lavender-mist")}>
                      <button type="button" onClick={() => setSelectedId(q.id)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left" aria-current={q.id === selectedId}>
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-plum text-[11px] font-bold text-white">{number}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-plum-dark">{q.prompt || "Untitled question"}</span>
                          <span className="block text-[11px] text-muted-text">
                            {QUESTION_TYPE_INFO[q.type as QuestionType].label}
                            {q.multiplier > 1 && ` · ${q.multiplier}×`}
                          </span>
                        </span>
                        {warningIds.has(q.id) ? <AlertTriangle className="size-4 shrink-0 text-gold" aria-label="Needs attention" /> : <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-label="Ready" />}
                      </button>
                      <div className="flex flex-col">
                        <button type="button" className="rounded p-0.5 text-muted-text hover:bg-blush disabled:opacity-30" aria-label="Move question up" disabled={qIdx === 0} onClick={() => update((c) => ({ ...c, rounds: c.rounds.map((r) => (r.id === round.id ? { ...r, questions: move(r.questions, qIdx, qIdx - 1) } : r)) }))}>
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button type="button" className="rounded p-0.5 text-muted-text hover:bg-blush disabled:opacity-30" aria-label="Move question down" disabled={qIdx === round.questions.length - 1} onClick={() => update((c) => ({ ...c, rounds: c.rounds.map((r) => (r.id === round.id ? { ...r, questions: move(r.questions, qIdx, qIdx + 1) } : r)) }))}>
                          <ArrowDown className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="p-2">
                <Button variant="ghost" size="sm" className="w-full" onClick={() => addQuestion(round.id)}>
                  <Plus /> Add question
                </Button>
              </div>
            </Card>
          ))}
          <Button variant="outline" className="w-full" onClick={addRound}>
            <Plus /> Add round
          </Button>
        </aside>

        <section aria-label="Question editor">
          {selected ? (
            <QuestionEditor
              key={selected.q.id}
              quizId={initial.id}
              number={selectedNumber}
              question={selected.q}
              mediaUrls={mediaUrls}
              onMediaUrl={(path, url) => setMediaUrls((m) => ({ ...m, [path]: url }))}
              onChange={updateQuestion}
              onDuplicate={() => {
                const copy = duplicateQuestion(selected.q);
                update((c) => ({
                  ...c,
                  rounds: c.rounds.map((r) => {
                    const idx = r.questions.findIndex((q) => q.id === selected.q.id);
                    if (idx < 0) return r;
                    const questions = [...r.questions];
                    questions.splice(idx + 1, 0, copy);
                    return { ...r, questions };
                  }),
                }));
                setSelectedId(copy.id);
              }}
              onDelete={() => setPendingDelete({ kind: "question", id: selected.q.id })}
              onSave={() => void save()}
              saving={saving}
              dirty={dirty}
            />
          ) : (
            <Card className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-muted-text">No question selected.</p>
              <div className="flex gap-2">
                <Button onClick={content.rounds[0] ? () => addQuestion(content.rounds[0].id) : addRound}>
                  <Plus /> Add a question
                </Button>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <FileSpreadsheet /> Import from Excel
                </Button>
              </div>
            </Card>
          )}
        </section>
      </div>

      <ImportWizard quizId={initial.id} open={importOpen} onOpenChange={setImportOpen} onImport={onImport} />
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={pendingDelete?.kind === "round" ? "Delete this round?" : "Delete this question?"}
        description={pendingDelete?.kind === "round" ? "The round and all of its questions will be removed when you save." : "The question will be removed when you save."}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
