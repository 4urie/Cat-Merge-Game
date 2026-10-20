"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { catNames, catPath, GameBridge, initialState } from "../game/bridge";

function Doodle({
  kind,
  className = "",
}: {
  kind: "star" | "cat" | "paw";
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "star" ? (
        <path d="m32 5 7 19 20 2-16 13 5 20-17-11-17 10 5-20L4 25l21-2Z" />
      ) : kind === "cat" ? (
        <>
          <path d="M13 27 12 8l17 12h9L53 8l-2 23c9 25-44 31-42 5Z" />
          <path d="M21 33v3m20-3v3m-12 3 3 3 3-3m-3 3v4m-14-5L3 38m15 8L4 48m42-7 15-4m-15 9 15 3" />
        </>
      ) : (
        <>
          <path d="M20 38c6-14 17-14 23-1 12 14 1 20-10 16-14 5-24-3-13-15Z" />
          <ellipse
            cx="13"
            cy="28"
            rx="5"
            ry="7"
            transform="rotate(-25 13 28)"
          />
          <ellipse cx="25" cy="17" rx="5" ry="7" />
          <ellipse cx="40" cy="18" rx="5" ry="7" />
          <ellipse cx="51" cy="29" rx="5" ry="7" transform="rotate(25 51 29)" />
        </>
      )}
    </svg>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 9h4l5-5v16l-5-5H4Z" />
      {muted ? (
        <path d="m17 9 5 6m0-6-5 6" />
      ) : (
        <>
          <path d="M17 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14" />
        </>
      )}
    </svg>
  );
}

export default function CatMerge() {
  const host = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<GameBridge | null>(null);
  const [state, setState] = useState(initialState);
  const [help, setHelp] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const bridge = new GameBridge();
    bridgeRef.current = bridge;
    const unsubscribe = bridge.on("state", setState);
    let disposed = false;
    let game: import("phaser").Game | undefined;
    let resizeObserver: ResizeObserver | undefined;
    // A separate mount node prevents a deferred Strict Mode destroy removing a new canvas.
    const mount = document.createElement("div");
    host.current?.appendChild(mount);
    void Promise.all([import("phaser"), import("../game/CatScene")])
      .then(([Phaser, { default: CatScene }]) => {
        if (disposed) return;
        const initialWidth = Math.max(1, host.current?.clientWidth ?? 480);
        const initialHeight = Math.max(1, host.current?.clientHeight ?? 600);
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: mount,
          width: initialWidth,
          height: initialHeight,
          transparent: true,
          physics: {
            default: "matter",
            matter: { gravity: { x: 0, y: 1.15 }, enableSleeping: false },
          },
          scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          render: { antialias: true, pixelArt: false },
          scene: new CatScene(bridge),
          audio: { noAudio: true },
        });
        resizeObserver = new ResizeObserver(() => {
          const width = host.current?.clientWidth ?? 0;
          const height = host.current?.clientHeight ?? 0;
          if (width > 0 && height > 0 && game) game.scale.resize(width, height);
        });
        if (host.current) resizeObserver.observe(host.current);
        // Development-only inspection for physics regression tests; no production global.
        if (process.env.NODE_ENV === "development")
          Object.defineProperty(mount, "__phaserGame", { value: game });
      })
      .catch(() => {
        if (!disposed)
          setState((previous) => ({ ...previous, status: "error" }));
      });
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      unsubscribe();
      bridgeRef.current = null;
      game?.destroy(true);
      mount.remove();
    };
  }, []);

  const modal = help || confirmRestart || state.status === "over";
  useEffect(() => {
    bridgeRef.current?.emit("pause", modal);
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus();
  }, [modal]);

  function restart() {
    bridgeRef.current?.emit("restart", undefined);
    setConfirmRestart(false);
  }

  return (
    <main className="notebook">
      <div className="page-meta" aria-hidden="true">
        <span>THE LITTLE PLAY CLUB</span>
        <span>NO. 001 / CAT MERGE</span>
      </div>
      <header className="title-block">
        <span className="title-star">
          <Doodle kind="star" />
        </span>
        <p className="eyebrow">a little room for a lot of cats</p>
        <h1>
          CAT <span>MERGE</span>
          <i aria-hidden="true">!</i>
        </h1>
        <p className="subtitle">DROP. MERGE. REPEAT.</p>
        <Doodle kind="paw" className="title-paw" />
      </header>

      <section className="game-layout" aria-label="Cat Merge game">
        <aside className="score-rail">
          <div className="paper-card score-card">
            <span className="card-label">SCORE</span>
            <strong aria-live="polite" aria-atomic="true" data-testid="score">
              {state.score.toLocaleString()}
            </strong>
            <span className="score-scribble" aria-hidden="true" />
          </div>
          <div className="paper-card best-card">
            <span className="card-label">
              <span aria-hidden="true">♛</span> BEST
            </span>
            <strong data-testid="best">{state.best.toLocaleString()}</strong>
            <span className="little-note">your personal best</span>
          </div>
          <div className="side-note">
            <Doodle kind="cat" />
            <p>
              Small cats.
              <br />
              Big possibilities.
            </p>
            <span className="curved-arrow" aria-hidden="true">
              ⤷
            </span>
          </div>
        </aside>

        <div className="board-column">
          <div className="board" data-status={state.status}>
            <div className="drop-note" aria-hidden="true">
              drop a little happiness <span>↘</span>
            </div>
            <div
              ref={host}
              className="phaser-host"
              tabIndex={0}
              role="group"
              aria-label="Cat drop area. Move the pointer or drag to aim, release to drop. Keyboard: left and right arrows to aim, space or Enter to drop."
              onKeyDown={(event) => {
                if (modal) return;
                if (
                  ["ArrowLeft", "ArrowRight", " ", "Enter"].includes(event.key)
                ) {
                  event.preventDefault();
                  if (event.key.startsWith("Arrow"))
                    bridgeRef.current?.emit(
                      "aim",
                      event.key === "ArrowLeft" ? -18 : 18,
                    );
                  else if (!event.repeat)
                    bridgeRef.current?.emit("drop", undefined);
                }
              }}
            />
            {state.status === "playing" && state.drops === 0 ? (
              <div className="empty-hint" aria-hidden="true">
                <Doodle kind="cat" />
                <span>It starts with one little cat.</span>
                <small>Tap anywhere to drop</small>
              </div>
            ) : null}
            <span className="limit-note" aria-hidden="true">
              keep it below the line
            </span>
            {state.status === "loading" ? (
              <div className="board-message" role="status">
                <Doodle kind="paw" />
                <p>Rounding up the cats…</p>
              </div>
            ) : null}
            {state.status === "error" ? (
              <div className="board-message" role="alert">
                <p>The cats couldn’t load.</p>
                <button onClick={() => window.location.reload()}>
                  Try again
                </button>
              </div>
            ) : null}
          </div>
          <p className="play-hint">
            <span aria-hidden="true">↔</span> Move to aim <b>·</b> Release to
            drop <b>·</b> Match to merge
          </p>
        </div>

        <aside className="next-rail">
          <div className="paper-card next-card">
            <span className="card-label">NEXT CAT</span>
            <div className="next-image">
              <Image
                src={catPath(state.next)}
                alt={`Next cat, tier ${state.next}`}
                width={100}
                height={100}
                unoptimized
                priority
              />
            </div>
            <span className="little-note">you&apos;re up next!</span>
          </div>
          <button
            className="sound-button"
            onClick={() => bridgeRef.current?.emit("sound", undefined)}
            aria-label={state.muted ? "Enable sound" : "Mute sound"}
            aria-pressed={!state.muted}
            disabled={state.status === "loading" || state.status === "error"}
          >
            <SoundIcon muted={state.muted} />
            <span>Sound {state.muted ? "off" : "on"}</span>
          </button>
          <div className="merge-note">
            <span className="mini-star" aria-hidden="true">
              ✧
            </span>
            <p>
              Two of a kind,
              <br />
              <span>one of a cuter kind.</span>
            </p>
            <div aria-hidden="true" className="merge-example">
              <Image
                src={catPath(1)}
                alt=""
                width={35}
                height={35}
                unoptimized
              />
              <b>+</b>
              <Image
                src={catPath(1)}
                alt=""
                width={35}
                height={35}
                unoptimized
              />
              <b>=</b>
              <Image
                src={catPath(2)}
                alt=""
                width={44}
                height={44}
                unoptimized
              />
            </div>
          </div>
        </aside>
      </section>

      <section className="progress-section" aria-label="Cat merge progression">
        <div className="progress-title">
          <span>THE CAT COLLECTION</span>
          <span>best tier: {state.highest} / 10</span>
        </div>
        <ol className="collection">
          {catNames.map((name, index) => (
            <li
              key={name}
              className={
                index + 1 === state.highest
                  ? "current-tier"
                  : index + 1 < state.highest
                    ? "discovered"
                    : ""
              }
              aria-current={index + 1 === state.highest ? "step" : undefined}
              title={`Tier ${index + 1}: ${name}${index + 1 > state.highest ? " — merge to discover" : ""}`}
            >
              <Image
                src={catPath(index + 1)}
                alt={`Tier ${index + 1}: ${name}`}
                width={49}
                height={49}
                unoptimized
              />
              <span>{index + 1}</span>
              {index < 9 ? <i aria-hidden="true">›</i> : null}
            </li>
          ))}
        </ol>
        <p className="collection-note">
          A little bigger. A little fluffier. Keep going!{" "}
          <span aria-hidden="true">✧</span>
        </p>
      </section>

      <footer>
        <button
          onClick={() => setHelp(true)}
          disabled={state.status === "loading" || state.status === "error"}
        >
          <span className="help-icon" aria-hidden="true">
            ?
          </span>{" "}
          How to play
        </button>
        <span className="footer-note">made for your just-one-more moments</span>
        <button
          onClick={() => (state.drops ? setConfirmRestart(true) : restart())}
          disabled={state.status === "loading" || state.status === "error"}
        >
          <span aria-hidden="true">↻</span> Start fresh
        </button>
      </footer>

      {modal ? (
        <div
          className="modal-backdrop"
          onKeyDown={(event) => {
            if (event.key === "Escape" && state.status !== "over") {
              setHelp(false);
              setConfirmRestart(false);
            }
            if (event.key === "Tab") {
              const buttons =
                dialogRef.current?.querySelectorAll<HTMLButtonElement>(
                  "button",
                );
              if (!buttons?.length) return;
              const first = buttons[0],
                last = buttons[buttons.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }
          }}
        >
          <section
            className="modal paper-card"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <Doodle kind={state.status === "over" ? "cat" : "paw"} />
            <h2 id="modal-title">
              {help
                ? "A little guide to merging"
                : state.status === "over"
                  ? "Full of fluff!"
                  : "A fresh page?"}
            </h2>
            {help ? (
              <>
                <p>
                  Move your mouse or drag a finger to aim. Release to drop your
                  cat.
                </p>
                <p>
                  Two matching cats become one bigger cat. Keep the pile below
                  the dotted line!
                </p>
                <p className="little-note">
                  Keyboard: ← → to aim, Space to drop.
                  <br />
                  Your best score is saved on this device.
                </p>
                <button
                  ref={closeRef}
                  className="primary-button"
                  onClick={() => setHelp(false)}
                >
                  Let&apos;s play
                </button>
              </>
            ) : (
              <>
                <p>
                  {state.status === "over"
                    ? `A lovely little pile. You scored ${state.score.toLocaleString()} points!`
                    : "Clear your cats and start again? Your best score is yours to keep."}
                </p>
                <button
                  ref={closeRef}
                  className="primary-button"
                  onClick={restart}
                >
                  {state.status === "over" ? "One more round" : "Start fresh"}
                </button>
                {state.status !== "over" ? (
                  <button
                    className="cancel-button"
                    onClick={() => setConfirmRestart(false)}
                  >
                    Keep playing
                  </button>
                ) : null}
              </>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
