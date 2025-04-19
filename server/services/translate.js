import { TranslateClient, TranslateTextCommand, paginateListLanguages } from "@aws-sdk/client-translate"; // ES Modules import

export async function translate(text, sourceLanguage = "en", targetLanguage = "es", settings = {}) {
  const client = new TranslateClient();
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

export async function getLanguages() {
  const client = new TranslateClient();
  const paginator = paginateListLanguages({ client }, {});
  const languages = [];
  for await (const page of paginator) {
    if (page.Languages) {
      languages.push(...page.Languages);
    }
  }
  const compareOptions = (a, b) => (a.value === "auto" ? -1 : b.value === "auto" ? 1 : a.label.localeCompare(b.label));
  return languages.map((lang) => ({ value: lang.LanguageCode, label: lang.LanguageName })).sort(compareOptions);
}
