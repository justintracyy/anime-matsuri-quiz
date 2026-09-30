"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidPin, normalizePin } from "@/lib/pin";

export function PinEntry() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isValidPin(pin)) {
          setError("Game PINs are six digits and don't start with 0.");
          return;
        }
        router.push(`/join/${pin}`);
      }}
    >
      <Label htmlFor="pin">Game PIN</Label>
      <Input
        id="pin"
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="go"
        placeholder="123 456"
        value={pin}
        aria-invalid={!!error}
        aria-describedby={error ? "pin-error" : undefined}
        onChange={(e) => {
          setPin(normalizePin(e.target.value));
          setError(null);
        }}
        className="h-14 text-center font-serif text-3xl font-bold tracking-[0.3em]"
      />
      {error && (
        <p id="pin-error" className="text-sm font-semibold text-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" variant="sakura" className="w-full" disabled={pin.length !== 6}>
        Continue <ArrowRight />
      </Button>
    </form>
  );
}
