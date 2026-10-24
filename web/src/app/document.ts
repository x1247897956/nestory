import type { Block } from "@blocknote/core";

/** Versioned, lossless native body. Markdown is a searchable export projection. */
export type BodyDocument = { version: 1; blocks: Block[] };
export type DocumentFields = {
  body_document?: BodyDocument | null;
  legacy_body?: string | null;
};
