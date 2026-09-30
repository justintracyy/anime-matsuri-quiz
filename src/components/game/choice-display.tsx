"use client";

import { motion } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";
import { CHOICE_STYLES, type ChoiceLabel } from "@/lib/constants";
import type { QuestionView } from "@/lib/game/types";
import { cn } from "@/lib/utils";

/** Host-screen answer tiles. After the reveal, shows the correct answer and vote counts. */
export function HostChoiceGrid({
  choices,
  correctChoiceId,
  distribution,
  totalAnswers,
}: {
  choices: QuestionView["choices"];
  correctChoiceId: string | null;
  distribution?: Record<string, number>;
  totalAnswers?: number;
}) {
  const revealed = !!correctChoiceId;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {choices.map((choice, i) => {
        const style = CHOICE_STYLES[choice.label as ChoiceLabel];
        const isCorrect = choice.id === correctChoiceId;
        const count = distribution?.[choice.id] ?? 0;
        const pct = totalAnswers ? Math.round((count / totalAnswers) * 100) : 0;
        return (
          <motion.div
            key={choice.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: revealed && !isCorrect ? 0.45 : 1, y: 0, scale: revealed && isCorrect ? 1.02 : 1 }}
            transition={{ delay: revealed ? 0 : i * 0.06 }}
            className={cn(
              "relative flex min-h-20 items-center gap-4 overflow-hidden rounded-2xl px-5 py-4 text-white shadow-[var(--shadow-soft)]",
              style.bg,
              revealed && isCorrect && "ring-4 ring-gold ring-offset-4 ring-offset-cream",
            )}
          >
            {revealed && distribution && (
              <motion.div
                className="absolute inset-y-0 left-0 bg-white/20"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                aria-hidden="true"
              />
            )}
            <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/25 text-2xl font-bold" aria-hidden="true">
              {style.shape}
            </span>
            <span className="relative flex-1 text-balance text-xl font-bold leading-snug md:text-2xl">
              <span className="sr-only">Choice {choice.label}: </span>
              {choice.text}
            </span>
            {revealed && (
              <span className="relative flex items-center gap-2 text-lg font-bold">
                {distribution && <span className="tabular-nums">{count}</span>}
                {isCorrect ? <CheckCircle2 className="size-8" aria-label="Correct answer" /> : <XCircle className="size-6 opacity-80" aria-hidden="true" />}
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

/** Large, thumb-friendly player answer buttons. */
export function PlayerAnswerButtons({
  choices,
  selectedChoiceId,
  locked,
  onSelect,
  compact,
}: {
  choices: QuestionView["choices"];
  selectedChoiceId: string | null;
  locked: boolean;
  onSelect: (choiceId: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid flex-1 gap-3", choices.length > 2 ? "grid-cols-2" : "grid-cols-1")} role="group" aria-label="Answer choices">
      {choices.map((choice) => {
        const style = CHOICE_STYLES[choice.label as ChoiceLabel];
        const selected = choice.id === selectedChoiceId;
        return (
          <motion.button
            key={choice.id}
            type="button"
            whileTap={locked ? undefined : { scale: 0.96 }}
            disabled={locked}
            onClick={() => onSelect(choice.id)}
            aria-pressed={selected}
            className={cn(
              "relative flex flex-col items-center justify-center gap-2 rounded-3xl p-3 text-white shadow-[var(--shadow-soft)] transition focus-visible:ring-4 focus-visible:ring-plum focus-visible:ring-offset-2",
              compact ? "min-h-24" : "min-h-32",
              style.bg,
              locked && !selected && "opacity-35 grayscale-[40%]",
              selected && "ring-4 ring-plum-dark ring-offset-2 ring-offset-cream",
            )}
          >
            <span className="text-4xl leading-none" aria-hidden="true">
              {style.shape}
            </span>
            <span className="line-clamp-3 text-balance text-center text-base font-bold leading-tight">
              <span className="sr-only">{choice.label}: </span>
              {choice.text}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
