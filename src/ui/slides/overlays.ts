import { storedFlag, storeFlag } from "../storage";

// The notes and timer overlays while presenting (n, c). Remembered for this
// tab only, so notes left on from a rehearsal don't greet the audience at
// the next talk.

export type OverlayName = "notes" | "timer";

function overlay(which: OverlayName): HTMLElement {
  const el = document.createElement("div");
  el.id = `mdd-present-${which}`;
  el.className = "present-overlay";
  document.body.append(el);
  document.body.classList.toggle(`show-present-${which}`, storedFlag("session", `mddisplay-present-${which}`));
  return el;
}

export class Overlays {
  private readonly notes = overlay("notes");
  private readonly timer = overlay("timer");
  private timerStart = 0;
  private tick: ReturnType<typeof setInterval> | undefined;

  toggle(which: OverlayName): void {
    const shown = document.body.classList.toggle(`show-present-${which}`);
    storeFlag("session", `mddisplay-present-${which}`, shown);
  }

  /** Shows `wrapper`'s speaker notes. */
  fillNotes(wrapper: HTMLElement | undefined): void {
    const notes = wrapper?.querySelector(".slide-notes");
    this.notes.replaceChildren(
      ...[...(notes?.children ?? [])]
        .filter((c) => !c.classList.contains("slide-notes-label"))
        .map((c) => c.cloneNode(true)),
    );
  }

  startTimer(): void {
    this.timerStart = Date.now();
    this.updateTimer();
    this.tick = setInterval(() => this.updateTimer(), 250);
  }

  stopTimer(): void {
    clearInterval(this.tick);
  }

  /** Time since presenting started, as m:ss (h:mm:ss past an hour). */
  private updateTimer(): void {
    const s = Math.floor((Date.now() - this.timerStart) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor(s / 60) % 60;
    const ss = String(s % 60).padStart(2, "0");
    this.timer.textContent = h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  }
}
