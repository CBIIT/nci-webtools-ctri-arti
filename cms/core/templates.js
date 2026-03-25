import db, { Template, TemplateSection } from "database";

import { asc, eq } from "drizzle-orm";

export const templateMethods = {
  async getTemplates() {
    return db.select().from(Template).orderBy(asc(Template.name));
  },

  async getTemplate(templateId) {
    const template = await db.query.Template.findFirst({
      where: eq(Template.id, templateId),
      with: {
        Sections: {
          orderBy: asc(TemplateSection.sectionNumber),
        },
      },
    });
    return template || null;
  },
};
