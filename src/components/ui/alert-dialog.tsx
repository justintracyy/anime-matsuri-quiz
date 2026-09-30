"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { buttonVariants } from "./button";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

/** Confirmation for irreversible host actions (skip, remove player, end game). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-plum-dark/40 backdrop-blur-[2px]" />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border-2 border-dusty-pink bg-white p-6 shadow-[var(--shadow-soft)]">
          <AlertDialogPrimitive.Title className="font-serif text-xl font-bold text-plum-dark">{title}</AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="text-sm text-muted-text">{description}</AlertDialogPrimitive.Description>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel className={cn(buttonVariants({ variant: "outline" }))}>{cancelLabel}</AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action
              className={cn(buttonVariants({ variant: destructive ? "destructive" : "default" }))}
              onClick={onConfirm}
            >
              {confirmLabel}
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
