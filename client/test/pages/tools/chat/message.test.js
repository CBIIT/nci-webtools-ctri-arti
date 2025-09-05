import test from "../../../test.js";
import assert from "../../../assert.js";
import { render } from "solid-js/web";
import html from "solid-js/html";
import Message from "../../../../pages/tools/chat/message.js";

test("Chat Message Component Tests", async (t) => {
  await t.test("renders markdown content correctly", () => {
    const message = {
      role: "assistant",
      content: [{ text: '# Heading\n\n- Item 1\n- Item 2\n\n```js\nconsole.log("hello");\n```' }],
    };

    const container = document.createElement("div");
    try {
      document.body.appendChild(container);
      render(
        () => html`<${Message} message=${message} messages=${[message]} index=${0} />`,
        container
      );
      const content = container.querySelector(".markdown");
      assert.ok(content.querySelector("h1"), "Should render markdown heading");
      assert.ok(content.querySelector("ul"), "Should render markdown list");
      assert.ok(content.querySelector("code"), "Should render markdown code");
    } finally {
      document.body.removeChild(container);
    }
  });

  await t.test("opens feedback dialog when feedback button is clicked", () => {
    const message = {
      role: "assistant",
      content: [{ text: "Test message" }],
    };

    let container = document.createElement("div");
    try {
      document.body.appendChild(container);
      render(
        () =>
          Message({
            message,
            messages: [message],
            index: 0,
          }),
        container
      );

      // Get feedback button
      const feedbackButton = container.querySelector('button[title="Mark as helpful"]');
      assert.ok(feedbackButton, "Feedback button should exist");

      // Mock dialog behavior
      const dialog = container.querySelector("dialog");
      let dialogShown = false;
      dialog.showModal = () => {
        dialogShown = true;
      };

      // Click button
      feedbackButton.click();

      assert.strictEqual(
        dialogShown,
        true,
        "Dialog should be shown when feedback button is clicked"
      );
    } finally {
      document.body.removeChild(container);
    }
  });

  await t.test("handles tool results correctly", () => {
    // TODO: Test rendering of tool results in messages
  });

  await t.test("handles search results correctly", () => {
    // TODO: Test rendering of search results in messages
  });
});
