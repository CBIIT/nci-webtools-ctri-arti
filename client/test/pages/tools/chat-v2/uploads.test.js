import assert from "/test/assert.js";
import test from "/test/test.js";

import { getContentBlock } from "../../../../pages/tools/chat-v2/hooks.js";

test("Chat-V2 upload blocks use a stable Bedrock-safe document stem and preserve the original filename", async () => {
  const file = new File(["hello"], "book.md", { type: "text/markdown" });
  const block = await getContentBlock(file);
  const document = block?.document;

  assert.ok(document, "document block should be created");
  assert.strictEqual(document.name, "book", "document name should be the safe filename stem");
  assert.strictEqual(
    document.originalName,
    "book.md",
    "originalName should remain the real filename"
  );
});
