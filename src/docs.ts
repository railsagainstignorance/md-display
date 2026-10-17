import { baseName } from "./render/links";
import type { DocSource } from "./source/types";

export interface DocRef {
  /** `<source key>/<path>`, as used in the page URL (`?doc=`). */
  id: string;
  source: DocSource;
  path: string;
  name: string;
  /** File name to download the doc's source as. */
  fileName: string;
}

export async function listDocRefs(source: DocSource): Promise<DocRef[]> {
  return (await source.listDocs()).map(({ path, name }) => ({
    id: `${source.key}/${path}`,
    source,
    path,
    name: name ?? path,
    fileName: baseName(path),
  }));
}
