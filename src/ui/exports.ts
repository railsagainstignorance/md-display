import { markdownToSlack } from "../render/slack";

export async function copyForSlack(text: string): Promise<void> {
  await navigator.clipboard.writeText(markdownToSlack(text));
}

export function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
