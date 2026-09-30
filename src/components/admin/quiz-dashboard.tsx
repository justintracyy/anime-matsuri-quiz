"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, MonitorPlay, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionEyebrow } from "@/components/brand/brand";
import { Spirit } from "@/components/brand/decorations";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api/client";
import { formatPin } from "@/lib/pin";
import type { QuizListItem } from "@/lib/quiz/schema";
import { HostLiveButton } from "./host-button";

export function QuizDashboard({ quizzes }: { quizzes: QuizListItem[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<QuizListItem | null>(null);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionEyebrow>Organizer dashboard</SectionEyebrow>
          <h1 className="mt-2 font-serif text-4xl font-bold">Your quizzes</h1>
          <p className="text-muted-text">Create a quiz, publish it, then host a live game for up to 50 players.</p>
        </div>
        <Button size="lg" onClick={() => setCreating(true)}>
          <Plus /> New quiz
        </Button>
      </div>

      {quizzes.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Spirit className="w-16 animate-spirit-float" />
          <CardTitle>No quizzes yet</CardTitle>
          <CardDescription>Start from scratch or import questions from the Excel template.</CardDescription>
          <Button onClick={() => setCreating(true)}>
            <Plus /> Create your first quiz
          </Button>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((quiz) => (
            <Card key={quiz.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={quiz.status === "published" ? "success" : "lavender"}>{quiz.status === "published" ? "Published" : "Draft"}</Badge>
                  <span className="text-xs text-muted-text">{quiz.question_count} questions</span>
                </div>
                <CardTitle className="mt-2">{quiz.title}</CardTitle>
                {quiz.subtitle && <CardDescription>{quiz.subtitle}</CardDescription>}
              </CardHeader>
              <CardContent className="flex-1">
                {quiz.live_session && (
                  <Link
                    href={`/host/${quiz.live_session.id}`}
                    className="flex items-center gap-2 rounded-xl border-2 border-sakura bg-blush px-3 py-2 text-sm font-semibold text-plum-dark hover:bg-sakura-light"
                  >
                    <MonitorPlay className="size-4 text-sakura" />
                    Resume live game · PIN {formatPin(quiz.live_session.game_pin)}
                  </Link>
                )}
              </CardContent>
              <CardFooter className="flex-wrap">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/quizzes/${quiz.id}`}>
                    <Pencil /> Edit
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/quizzes/${quiz.id}/import`}>
                    <FileSpreadsheet /> Import
                  </Link>
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${quiz.title}`} onClick={() => setToDelete(quiz)}>
                  <Trash2 className="text-error" />
                </Button>
                <HostLiveButton quizId={quiz.id} size="sm" className="ml-auto" disabled={quiz.status !== "published" || quiz.question_count === 0} />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <CreateQuizDialog open={creating} onOpenChange={setCreating} onCreated={(id) => router.push(`/admin/quizzes/${id}`)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this quiz?"
        description={`“${toDelete?.title}” and all of its questions and past game results will be permanently deleted.`}
        confirmLabel="Delete quiz"
        destructive
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await apiFetch(`/api/admin/quizzes/${toDelete.id}`, { method: "DELETE" });
            toast.success("Quiz deleted.");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "Could not delete the quiz.");
          }
        }}
      />
    </div>
  );
}

function CreateQuizDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("Anime Matsuri Guessing Game");
  const [subtitle, setSubtitle] = useState("Sakura & Spirits");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New quiz</DialogTitle>
          <DialogDescription>You can add questions manually or import them from Excel next.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              const { id } = await apiFetch<{ id: string }>("/api/admin/quizzes", { method: "POST", json: { title, subtitle, description } });
              onCreated(id);
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : "Could not create the quiz.");
              setSaving(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="quiz-title">Title</Label>
            <Input id="quiz-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiz-subtitle">Subtitle</Label>
            <Input id="quiz-subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiz-description">Description</Label>
            <Textarea id="quiz-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving && <Loader2 className="animate-spin" />} Create quiz
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
