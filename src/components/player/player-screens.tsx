"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Flame, Hourglass, Lock, PauseCircle, Trophy, XCircle, Zap } from "lucide-react";
import { Spirit } from "@/components/brand/decorations";
import { PetalConfetti, Podium } from "@/components/game/championship";
import { PlayerAnswerButtons } from "@/components/game/choice-display";
import { AudioClipPlayer, QuestionImage } from "@/components/game/question-media";
import { TimerBar } from "@/components/game/timer-ring";
import { EVENT_NAME, EVENT_THEME, MULTIPLIER_LABEL, QUESTION_TYPE_INFO, type QuestionType } from "@/lib/constants";
import type { PlayerView } from "@/lib/game/types";
import { cn, formatPoints, formatSeconds, ordinal } from "@/lib/utils";
import type { LocalAnswer } from "./player-game";

function Centered({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={cn("safe-bottom flex flex-1 flex-col items-center justify-center gap-4 px-6 py-8 text-center", className)}
    >
      {children}
    </motion.main>
  );
}

export function PlayerScreens({
  view,
  remainingMs,
  localAnswer,
  onAnswer,
}: {
  view: PlayerView;
  remainingMs: number;
  localAnswer: LocalAnswer | null;
  onAnswer: (choiceId: string) => void;
}) {
  const { session, question, me } = view;
  const phase = session.phase;
  const key = `${phase}:${session.questionIndex}`;
  const pending = localAnswer && question && localAnswer.questionId === question.id ? localAnswer : null;
  const answered = !!view.myAnswer || (pending?.status === "sending" || pending?.status === "sent");
  const selectedChoiceId = view.myAnswer?.choiceId ?? (pending && pending.status !== "rejected" ? pending.choiceId : null);

  return (
    <AnimatePresence mode="wait">
      <div key={key} className="flex flex-1 flex-col">
        {phase === "lobby" && (
          <Centered>
            <Spirit className="w-24 animate-spirit-float" />
            <h1 className="font-serif text-4xl font-bold">You’re in!</h1>
            <p className="text-xl font-semibold text-plum">Look at the host screen.</p>
            <p className="rounded-full bg-blush px-4 py-1.5 text-sm font-semibold text-plum-dark">
              Playing as <span className="font-bold">{me.nickname}</span>
            </p>
            <p className="text-sm text-muted-text">{view.quizTitle} starts soon. Keep this page open.</p>
          </Centered>
        )}

        {phase === "ready" && question && (
          <Centered>
            {question.isNewRound && <p className="text-sm font-bold uppercase tracking-[0.25em] text-sakura">{question.roundTitle}</p>}
            <h1 className="font-serif text-4xl font-bold">Get ready!</h1>
            <p className="text-lg font-semibold text-plum">
              Question {session.questionIndex + 1} of {session.totalQuestions}
            </p>
            <p className="rounded-full bg-lavender-mist px-4 py-1.5 text-sm font-semibold text-plum">{QUESTION_TYPE_INFO[question.type as QuestionType].label}</p>
            {question.multiplier > 1 && (
              <p className="rounded-full bg-gold px-4 py-1.5 text-sm font-bold uppercase tracking-wider text-white">{MULTIPLIER_LABEL[question.multiplier]}</p>
            )}
            <Spirit className="w-16 animate-spirit-float" mood="wow" />
          </Centered>
        )}

        {(phase === "active" || phase === "paused") && question && !answered && (
          <main className="safe-bottom flex flex-1 flex-col gap-3 px-3 pt-3">
            <TimerBar remainingMs={remainingMs} totalMs={question.timeLimitSeconds * 1000} paused={phase === "paused"} />
            {session.mirrorToPlayers && (question.prompt || question.image || question.audio) && (
              <div className="flex max-h-[38dvh] flex-col gap-2 overflow-hidden">
                {question.prompt && <p className="text-balance text-center font-serif text-lg font-bold text-plum-dark">{question.prompt}</p>}
                {question.image && <QuestionImage image={question.image} alt="Question image" className="max-h-[26dvh]" />}
                {question.audio && <AudioClipPlayer audio={question.audio} compact />}
              </div>
            )}
            {phase === "paused" && (
              <p className="flex items-center justify-center gap-2 rounded-2xl bg-lavender-mist py-2 font-semibold text-plum" role="status">
                <PauseCircle className="size-5" /> The host paused the timer
              </p>
            )}
            {pending?.status === "rejected" && (
              <p className="rounded-2xl bg-error/10 px-3 py-2 text-center text-sm font-semibold text-error" role="alert">
                {pending.message}
              </p>
            )}
            <p className="text-center text-sm font-semibold text-muted-text">Choose your answer</p>
            <PlayerAnswerButtons
              choices={question.choices}
              selectedChoiceId={selectedChoiceId}
              locked={phase === "paused" || remainingMs === 0}
              onSelect={onAnswer}
              compact={session.mirrorToPlayers}
            />
          </main>
        )}

        {(phase === "active" || phase === "paused") && question && answered && (
          <Centered>
            <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="flex size-24 items-center justify-center rounded-full bg-plum text-white shadow-[var(--shadow-glow)]">
              <Lock className="size-10" />
            </motion.div>
            <h1 className="font-serif text-3xl font-bold">Answer submitted</h1>
            <p className="text-plum">{pending?.status === "sending" ? "Sending…" : "Locked in! Waiting for the other players…"}</p>
            {view.myAnswer && <p className="text-sm text-muted-text">Answered in {formatSeconds(view.myAnswer.responseTimeMs)}</p>}
            <div className="w-full max-w-xs">
              <TimerBar remainingMs={remainingMs} totalMs={question.timeLimitSeconds * 1000} paused={phase === "paused"} />
            </div>
          </Centered>
        )}

        {phase === "closed" && (
          <Centered>
            {answered ? (
              <>
                <Lock className="size-14 text-plum" />
                <h1 className="font-serif text-3xl font-bold">Answer locked in</h1>
                <p className="text-plum">The answer will be revealed on the host screen.</p>
              </>
            ) : (
              <>
                <Hourglass className="size-14 text-sakura" />
                <h1 className="font-serif text-3xl font-bold">Time’s up!</h1>
                <p className="text-plum">No answer this time. Get ready for the next one!</p>
              </>
            )}
          </Centered>
        )}

        {phase === "results" && view.result && <ResultScreen view={view} />}

        {phase === "leaderboard" && (
          <Centered>
            <Trophy className="size-14 text-gold" />
            <h1 className="font-serif text-3xl font-bold">Leaderboard time</h1>
            <p className="text-plum">Look at the host screen for the top five.</p>
            <StatRow view={view} />
          </Centered>
        )}

        {phase === "final" && <FinalScreen view={view} />}
      </div>
    </AnimatePresence>
  );
}

function StatRow({ view }: { view: PlayerView }) {
  const { me } = view;
  return (
    <div className="grid w-full max-w-sm grid-cols-3 gap-2">
      <Stat label="Total score" value={formatPoints(me.score)} />
      <Stat label="Rank" value={me.rank ? `#${me.rank}` : "—"} />
      <Stat
        label="Streak"
        value={
          <span className="inline-flex items-center gap-1">
            <Flame className={cn("size-5", me.streak > 0 ? "text-[#e0793f]" : "text-muted-text")} />
            {me.streak}
          </span>
        }
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dusty-pink bg-white px-2 py-3">
      <p className="font-serif text-2xl font-bold tabular-nums text-plum-dark">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-text">{label}</p>
    </div>
  );
}

function ResultScreen({ view }: { view: PlayerView }) {
  const r = view.result!;
  const correctText = view.question?.choices.find((c) => c.id === r.correctChoiceId)?.text;
  return (
    <Centered className={cn(r.correct && "bg-gradient-to-b from-gold/10 to-transparent")}>
      {r.correct && <PetalConfetti count={24} />}
      <motion.div
        initial={{ scale: 0.4, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 12 }}
        className={cn(
          "flex size-28 items-center justify-center rounded-full text-white",
          r.correct ? "bg-gold shadow-[var(--shadow-gold)]" : "bg-lavender",
        )}
      >
        {r.correct ? <CheckCircle2 className="size-16" /> : <XCircle className="size-16" />}
      </motion.div>
      <h1 className="font-serif text-4xl font-bold">{r.correct ? "Correct!" : r.answered ? "Not quite" : "No answer"}</h1>
      {!r.correct && correctText && (
        <p className="text-plum">
          The answer was <span className="font-bold">{correctText}</span>
        </p>
      )}
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="font-serif text-5xl font-bold text-gold">
        +{formatPoints(r.pointsAwarded)}
      </motion.p>
      {r.wasFastest && (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-1.5 text-sm font-bold text-white">
          <Zap className="size-4" /> Fastest correct answer!
        </p>
      )}
      {r.correct && view.me.streak >= 2 && (
        <p className="inline-flex items-center gap-1.5 font-bold text-[#c0622c]">
          <Flame className="size-5" /> {view.me.streak} in a row!
        </p>
      )}
      <StatRow view={view} />
    </Centered>
  );
}

function FinalScreen({ view }: { view: PlayerView }) {
  const { me, podium } = view;
  const isChampion = me.rank === 1;
  return (
    <Centered className="gap-5">
      {isChampion && <PetalConfetti />}
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-lavender">Final result</p>
      {isChampion ? (
        <>
          <Trophy className="size-16 text-gold" />
          <h1 className="gold-text font-serif text-5xl font-extrabold">Champion!</h1>
        </>
      ) : (
        <h1 className="font-serif text-4xl font-bold">You finished {me.rank ? ordinal(me.rank) : "the game"}!</h1>
      )}
      <div className="grid w-full max-w-sm grid-cols-3 gap-2">
        <Stat label="Final score" value={formatPoints(me.score)} />
        <Stat label="Correct" value={me.correctCount} />
        <Stat label="Best streak" value={me.bestStreak} />
      </div>
      {podium.length > 0 && (
        <div className="w-full origin-top scale-[0.8]">
          <Podium podium={podium} highlightId={me.id} />
        </div>
      )}
      <div className="space-y-1">
        <p className="font-serif text-2xl font-bold">Arigatou • Thank You</p>
        <p className="text-sm font-semibold text-lavender">
          {EVENT_NAME} • {EVENT_THEME}
        </p>
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-sakura">Games • Music • Prizes • &amp; More</p>
      </div>
    </Centered>
  );
}
