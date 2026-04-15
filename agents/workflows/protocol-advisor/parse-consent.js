import { parseMergedDocumentInput } from "./document-parser.js";

export async function parseConsentDocument(ctx) {
  return parseMergedDocumentInput(ctx.input, {
    textKey: "consentText",
    textSource: "consentText",
    singleKey: "consentDocument",
    singleSource: "consentDocument",
    multiKey: "consentDocuments",
    mergedSource: "consentDocuments",
    mergedName: "merged-consent-documents",
    defaultName: "consent-document",
  });
}
