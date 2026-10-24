import type { Block } from "@blocknote/core";

/** Versioned, lossless native body. */
export type BodyDocument = { version: 1; blocks: Block[] };
export type DocumentFields = { body_document: BodyDocument };
