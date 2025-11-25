import {
  paginateListLanguages,
  TranslateClient,
  TranslateTextCommand,
  TranslateDocumentCommand,
} from "@aws-sdk/client-translate";

// ES Modules import

export async function translate({
  text,
  content = null,
  contentType = "text/plain",
  sourceLanguage = "auto",
  targetLanguage = "es",
  settings = {},
}) {
  const client = new TranslateClient();

  if (content && contentType) {
    if (content.includes(";base64,")) {
      let parts = content.replace("data:", "").split(";base64,");
      contentType = parts[0];
      content = parts[1];

      console.log("Detected content type:", contentType);
      console.log("Content length (base64):", content.length);
      console.log("Content length (bytes):", Buffer.from(content, "base64").length);
      console.log("Sample content (base64):", content.slice(0, 100) + "...");
    }
    const input = {
      Document: {
        Content: Buffer.from(content, "base64"),
        ContentType: contentType,
      },
      SourceLanguageCode: sourceLanguage,
      TargetLanguageCode: targetLanguage,
      Settings: {
        Formality: "FORMAL",
        Profanity: "MASK",
        ...settings,
      },
    };
    console.log(input);
    const command = new TranslateDocumentCommand(input);
    const response = await client.send(command);
    const results = response.TranslatedDocument.Content;
    return "data:" + contentType + ";base64," + Buffer.from(results).toString("base64");
  } else if (text) {
    const input = {
      Text: text,
      SourceLanguageCode: sourceLanguage,
      TargetLanguageCode: targetLanguage,
      Settings: {
        Formality: "FORMAL",
        Profanity: "MASK",
        ...settings,
      },
    };
    const command = new TranslateTextCommand(input);
    const response = await client.send(command);
    return response.TranslatedText;
  }
}

export async function getLanguages() {
  const client = new TranslateClient();
  const paginator = paginateListLanguages({ client }, {});
  const languages = [];
  for await (const page of paginator) {
    if (page.Languages) {
      languages.push(...page.Languages);
    }
  }
  const compareOptions = (a, b) =>
    a.value === "auto" ? -1 : b.value === "auto" ? 1 : a.label.localeCompare(b.label);
  return languages
    .map((lang) => ({ value: lang.LanguageCode, label: lang.LanguageName }))
    .sort(compareOptions);
}
