import { browse } from "../../../utils/tools.js";
import { jsonToXml } from "../../../utils/xml.js";

export const currentExecutiveOrders = jsonToXml(
  JSON.parse(
    await browse({
      url: "https://www.federalregister.gov/api/v1/documents.json?conditions%5Bpresidential_document_type%5D%5B%5D=executive_order",
    })
  )
);
const instructions = await fetch("/templates/govinfo-api.md").then((res) => res.text());
export const context = { currentExecutiveOrders, instructions };
