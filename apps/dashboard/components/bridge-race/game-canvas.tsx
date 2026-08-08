"use client";

import { useEffect, useRef } from "react";
import type Phaser from "phaser";
import type { RunResult } from "./scene";

/** Mounts a real Phaser.Game instance into a container div. Phaser is
 * imported dynamically inside the effect (client-only, after mount) rather
 * than statically at module scope, and this whole component is itself
 * loaded via next/dynamic({ ssr: false }) by its caller — belt and braces
 * against Phaser ever touching the SSR render path.
 *
 * `onGameOver` is read through a ref rather than an effect dependency so a
 * new function identity from the parent on every render never tears down
 * and remounts the running game — the game is created exactly once per
 * mounted GameCanvas instance; the parent remounts a fresh one (via a
 * changing `key`) to start a new run. */
export function GameCanvas({ onGameOver }: { onGameOver: (result: RunResult) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onGameOverRef = useRef(onGameOver);
  onGameOverRef.current = onGameOver;

  useEffect(() => {
    let destroyed = false;
    let game: Phaser.Game | undefined;

    (async () => {
      const [{ default: Phaser }, { BridgeRaceScene }] = await Promise.all([
        import("phaser"),
        import("./scene"),
      ]);
      if (destroyed || !containerRef.current) return;

      game = new Phaser.Game({
        type: Phaser.AUTO,
        width: 680,
        height: 380,
        parent: containerRef.current,
        backgroundColor: "#0a0a09",
        physics: {
          default: "arcade",
          arcade: { gravity: { x: 0, y: 0 }, debug: false },
        },
        scene: [BridgeRaceScene],
      });
      game.scene.start("BridgeRace", {
        onGameOver: (result: RunResult) => onGameOverRef.current(result),
      });
    })();

    return () => {
      destroyed = true;
      game?.destroy(true);
    };
  }, []);

  return <div ref={containerRef} className="overflow-hidden rounded-2xl" />;
}
