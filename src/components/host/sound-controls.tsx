"use client";

import { useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { getServerSoundState, getSoundEngine, getSoundState, subscribeSound } from "@/lib/sound/engine";

function useSoundState() {
  return useSyncExternalStore(subscribeSound, getSoundState, getServerSoundState);
}

/** Header button: mute toggle, or a prompt when the browser is still blocking audio. */
export function SoundToggle() {
  const sound = useSoundState();
  if (sound.locked && !sound.muted) {
    return (
      <Button size="sm" variant="sakura" onClick={() => getSoundEngine()?.unlock()}>
        <VolumeX /> Enable sound
      </Button>
    );
  }
  return (
    <Button
      size="icon-sm"
      variant="outline"
      aria-label={sound.muted ? "Unmute music and effects (M)" : "Mute music and effects (M)"}
      aria-pressed={sound.muted}
      title={sound.muted ? "Unmute (M)" : "Mute (M)"}
      onClick={() => getSoundEngine()?.toggleMute()}
    >
      {sound.muted ? <VolumeX /> : <Volume2 />}
    </Button>
  );
}

export function SoundSettings() {
  const sound = useSoundState();
  const engine = getSoundEngine();
  return (
    <div className="space-y-4 border-t-2 border-dusty-pink/60 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="sound-on">Music &amp; sound effects</Label>
          <p className="text-sm text-muted-text">Plays from this screen only. The music goes quiet during opening-song clips, and the clips keep their own volume.</p>
        </div>
        <Switch id="sound-on" checked={!sound.muted} onCheckedChange={(on) => engine?.update({ muted: !on })} />
      </div>
      <div className="space-y-1">
        <Label>Background music</Label>
        <Slider
          value={[Math.round(sound.music * 100)]}
          max={100}
          step={5}
          disabled={sound.muted}
          thumbLabels={["Background music volume"]}
          onValueChange={([v]) => engine?.update({ music: v / 100 })}
        />
      </div>
      <div className="space-y-1">
        <Label>Sound effects</Label>
        <Slider
          value={[Math.round(sound.effects * 100)]}
          max={100}
          step={5}
          disabled={sound.muted}
          thumbLabels={["Sound effects volume"]}
          onValueChange={([v]) => engine?.update({ effects: v / 100 })}
        />
      </div>
      <Button variant="outline" size="sm" onClick={() => void engine?.test()} disabled={sound.muted}>
        <Volume2 /> Test sound
      </Button>
    </div>
  );
}
