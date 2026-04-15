import { parseMergedDocumentInput } from "./document-parser.js";

export async function parseProtocolDocument(ctx) {
  return parseMergedDocumentInput(ctx.input, {
    textKey: "protocolText",
    textSource: "protocolText",
    singleKey: "document",
    singleSource: "document",
    multiKey: "documents",
    mergedSource: "documents",
    mergedName: "merged-protocol-documents",
    defaultName: "document",
  });
}
