import type { DocRef } from "../docs";

/** The dropdown at the top of the nav: each source's docs under its own heading. */
export function fillDocSelect(select: HTMLSelectElement, docs: DocRef[], activeId: string): void {
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const doc of docs) {
    let group = groups.get(doc.source.key);
    if (!group) {
      group = document.createElement("optgroup");
      group.label = doc.source.label;
      groups.set(doc.source.key, group);
    }
    group.append(new Option(doc.name, doc.id, false, doc.id === activeId));
  }
  select.replaceChildren(...groups.values());
}
