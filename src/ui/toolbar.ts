export interface ToolbarActions {
  openFiles(): void;
  openFolder(): void;
  reopen(): void;
  reload(): void;
  toggleRaw(): void;
  /** Between a Marp doc's slides and its document view. */
  toggleView(): void;
  toggleNotes(): void;
  present(): void;
  copyForSlack(): Promise<void>;
  print(): void;
  download(): void;
}

export interface OpenState {
  /** Name of a remembered file or folder the browser needs permission to reopen. */
  reopenName?: string;
  /** The open files can't be watched, so offer a manual reload. */
  canReload: boolean;
}

/** A plain doc, a Marp deck shown as a document, or a deck shown as slides. */
export type ToolbarMode = "document" | "deck-document" | "slides";

const RAW_LABELS = { show: "📝 Show raw Markdown", hide: "📝 Show rendered view" };
const NOTES_LABELS = { show: "🗒️ Show speaker notes", hide: "🗒️ Hide speaker notes" };
const PRINT_LABELS = { document: "🖨️ Print / Save as PDF", slides: "🖨️ Save slides as PDF", notes: "🖨️ Save slides + notes as PDF" };
const PRESENT_KEYS = ["▶️ Present (f)", "t thumbnails", "n notes", "c timer", "i contents"];

/** The nav's buttons: Open (files), Document (acts on the doc as a whole) and, for a deck, Slides. */
export class Toolbar {
  readonly rawButton: HTMLButtonElement;
  readonly reloadButton: HTMLButtonElement;
  readonly viewButton: HTMLButtonElement;
  private readonly reopenButton: HTMLButtonElement;
  private readonly notesButton: HTMLButtonElement;
  private readonly printButton: HTMLButtonElement;
  private readonly arrange: (mode: ToolbarMode) => Node[];
  private mode: ToolbarMode = "document";
  private notesShown = false;

  constructor(
    private readonly container: HTMLElement,
    actions: ToolbarActions,
  ) {
    this.reopenButton = button("", actions.reopen);
    this.reloadButton = button("🔄 Reload", actions.reload, "Shortcut: l. This browser can't watch files for changes.");
    this.rawButton = button(RAW_LABELS.show, actions.toggleRaw, "Shortcut: r");
    this.viewButton = button("", actions.toggleView, "Shortcut: s");
    this.notesButton = button(NOTES_LABELS.show, actions.toggleNotes, "Shortcut: n");
    this.printButton = button(PRINT_LABELS.document, actions.print);
    const present = button("", actions.present, "Shortcut: f");
    // Each key stays on one line with its name when the label wraps.
    PRESENT_KEYS.forEach((label, i) => {
      if (i) present.append(" · ");
      const keep = document.createElement("span");
      keep.className = "keep";
      keep.textContent = label;
      present.append(keep);
    });
    const slack = button("📋 Copy for Slack", async () => {
      const label = slack.textContent;
      try {
        await actions.copyForSlack();
        slack.textContent = "✅ Copied!";
      } catch {
        slack.textContent = "⚠️ Copy failed";
      }
      setTimeout(() => (slack.textContent = label), 1500);
    });
    const download = button("⬇️ Download raw Markdown", actions.download);

    const open = [
      heading("Open"),
      button("📄 Open file…", actions.openFiles, "Or drop files or a folder on the page"),
      button("📁 Open folder…", actions.openFolder, "Opening the folder lets docs show their images and link to each other"),
      this.reopenButton,
      this.reloadButton,
    ];
    // In slides view, the raw Markdown and printing act on the slides, so they move to the Slides group.
    this.arrange = (mode) =>
      mode === "slides"
        ? [
            ...open,
            heading("Document"),
            this.viewButton,
            slack,
            download,
            heading("Slides"),
            this.rawButton,
            this.notesButton,
            present,
            this.printButton,
          ]
        : [
            ...open,
            heading("Document"),
            this.rawButton,
            slack,
            this.printButton,
            download,
            ...(mode === "deck-document" ? [heading("Slides"), this.viewButton] : []),
          ];
    this.setMode("document");
    this.setOpenState({ canReload: false });
  }

  setMode(mode: ToolbarMode): void {
    this.mode = mode;
    this.viewButton.textContent = mode === "slides" ? "📄 Show as document" : "🎞️ Show as slides";
    this.updatePrintLabel();
    this.container.replaceChildren(...this.arrange(mode));
  }

  setOpenState({ reopenName, canReload }: OpenState): void {
    this.reopenButton.hidden = !reopenName;
    this.reopenButton.textContent = `↩️ Reopen ${reopenName ?? ""}`;
    this.reloadButton.hidden = !canReload;
  }

  setRawShown(shown: boolean): void {
    this.rawButton.textContent = shown ? RAW_LABELS.hide : RAW_LABELS.show;
  }

  setNotesShown(shown: boolean): void {
    this.notesShown = shown;
    this.notesButton.textContent = shown ? NOTES_LABELS.hide : NOTES_LABELS.show;
    this.updatePrintLabel();
  }

  private updatePrintLabel(): void {
    this.printButton.textContent =
      this.mode !== "slides" ? PRINT_LABELS.document : this.notesShown ? PRINT_LABELS.notes : PRINT_LABELS.slides;
  }
}

function heading(text: string): HTMLElement {
  const div = document.createElement("div");
  div.className = "toolbar-heading";
  div.textContent = text;
  return div;
}

function button(label: string, onClick: () => void, title?: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  if (title) b.title = title;
  b.addEventListener("click", onClick);
  return b;
}
