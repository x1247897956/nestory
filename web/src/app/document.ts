import type { Block } from "@blocknote/core";

/** Versioned, lossless native body. */
export type BodyDocument = { version: 1; blocks: Block[] };
export type DocumentFields = { body_document: BodyDocument };

export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
