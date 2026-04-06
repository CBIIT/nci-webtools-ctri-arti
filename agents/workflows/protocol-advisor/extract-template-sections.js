export async function extractTemplateSections(ctx) {
  const sections = ctx.steps.loadAssets.selectedTemplate.sections || [];
  return sections.map((section) => ({ ...section }));
}
