import { createSignal, For, Show, Index, createEffect, onMount, createResource } from "solid-js";
import html from "solid-js/html";
import { stringify } from "yaml";
import { parse } from "marked";
import { downloadText } from "/utils/files.js";
import { getMarked } from "/utils/utils.js";
import { xmlToJson } from "/utils/xml.js";

const marked = getMarked();

export default function Message(p) {
  const [dialog, setDialog] = createSignal(null);
  const [visible, setVisible] = createSignal({});
  const toggleVisible = (key) => setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  
  // Branching state
  const [isEditing, setIsEditing] = createSignal(false);
  const [editText, setEditText] = createSignal("");
  
  // Use resource for alternative info - much cleaner than signal+effect
  const [alternativeInfo] = createResource(
    // Source function - returns null when we don't want to fetch
    () => {
      const message = p.message;
      const messageId = message?.id;
      console.log('DEBUG: Resource source function called for message:', messageId, 'role:', message?.role);
      
      // Only return non-null when we want to fetch alternative info
      if (p.getAlternativeInfo && message?.role === 'user' && messageId) {
        return { id: messageId, index: p.index };
      }
      console.log('DEBUG: Not loading alternative info - conditions not met');
      return null;
    },
    // Fetch function - runs when source changes and isn't null
    async (source) => {
      console.log('DEBUG: Loading alternative info for message index:', source.index);
      try {
        const info = await p.getAlternativeInfo(source.index);
        console.log('DEBUG: Alternative info loaded:', info);
        return info;
      } catch (error) {
        console.error('DEBUG: Failed to load alternative info:', error);
        throw error; // Let SolidJS resource handle errors
      }
    }
  );
  const getToolResult = (toolUse) =>
    p.messages?.find((m) => m.content?.find((c) => c?.toolResult?.toolUseId === toolUse?.toolUseId))?.content[0].toolResult?.content[0]
      ?.json?.results;
  const getSearchResults = (results) => results?.web && [...results.web, ...results.news];
  
  // Branching functions
  function startEdit() {
    const messageText = p.message.content?.[0]?.text || "";
    console.log('startEdit called with messageText:', messageText);
    
    // Extract clean text from XML structure if present
    let cleanText = messageText;
    try {
      // Try to parse as XML to extract just the message text
      if (messageText.includes('<message>')) {
        const parsed = xmlToJson(messageText);
        // Navigate the parsed structure to get the actual text
        if (parsed.message?.text?._text) {
          cleanText = parsed.message.text._text;
        } else if (parsed.message?._text) {
          cleanText = parsed.message._text;
        } else if (parsed.message?.text && Array.isArray(parsed.message.text) && parsed.message.text[0]?._text) {
          cleanText = parsed.message.text[0]._text;
        } else {
          // Try to find any text content in the structure
          const findText = (obj) => {
            if (typeof obj === 'string') return obj;
            if (obj?._text) return obj._text;
            if (Array.isArray(obj)) {
              for (const item of obj) {
                const result = findText(item);
                if (result) return result;
              }
            } else if (typeof obj === 'object' && obj !== null) {
              for (const value of Object.values(obj)) {
                const result = findText(value);
                if (result) return result;
              }
            }
            return null;
          };
          const foundText = findText(parsed.message);
          cleanText = foundText || messageText;
        }
      } else {
        // Fallback: remove metadata tags
        cleanText = messageText.replace(/<metadata[\s\S]*?<\/metadata>/gi, '').trim();
        // Also remove message tags if present
        cleanText = cleanText.replace(/<\/?message>/gi, '').trim();
      }
    } catch (error) {
      console.error('Failed to parse message XML:', error);
      // If parsing fails, try simple text extraction
      cleanText = messageText.replace(/<metadata[\s\S]*?<\/metadata>/gi, '').replace(/<\/?message>/gi, '').trim();
    }
    
    console.log('Extracted cleanText:', cleanText);
    setEditText(cleanText);
    console.log('Set editText and isEditing to true');
    setIsEditing(true);
  }
  
  function cancelEdit() {
    setIsEditing(false);
    setEditText("");
  }
  
  async function saveEdit() {
    const currentEditText = editText().trim();
    console.log('saveEdit called with editText:', currentEditText);
    
    if (!currentEditText) {
      console.log('editText is empty, exiting saveEdit');
      return;
    }
    
    try {
      console.log('Calling createMessageBranchAndContinue with:', p.index, currentEditText);
      
      // Close dialog immediately - don't wait for LLM
      setIsEditing(false);
      setEditText("");
      
      // Run branching in background
      p.createMessageBranchAndContinue?.(p.index, currentEditText);
    } catch (error) {
      console.error('Failed to save edit:', error);
    }
  }
  
  async function navigateNext() {
    console.log('navigateNext called for index:', p.index);
    try {
      await p.switchToNextAlternative?.(p.index);
      console.log('switchToNextAlternative completed');
    } catch (error) {
      console.error('Failed to navigate to next alternative:', error);
    }
  }
  
  async function navigatePrev() {
    console.log('navigatePrev called for index:', p.index);
    try {
      await p.switchToPrevAlternative?.(p.index);
      console.log('switchToPrevAlternative completed');
    } catch (error) {
      console.error('Failed to navigate to previous alternative:', error);
    }
  }

  function openFeedback(feedback, comment) {
    let d = dialog();
    let f = d.querySelector("form");
    f.feedback.value = feedback ? "Positive Feedback" : "Negative Feedback";
    f.comment.value = comment || "";
    d.showModal();
  }

  async function submitFeedback(e) {
    e.preventDefault();
    await dialog()?.close();
    let feedback = e.target.feedback.value;
    let comment = e.target.comment.value;
    const success = await fetch("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        feedback: [feedback, '\ncomment:', comment, '\noriginal message:', p.message.content?.[0]?.text].filter(Boolean).join('\n'),
        context: p.messages,
      })
    }).then(e => e.json());
  };
  
  return html`
    <dialog ref=${el => setDialog(el)} class="z-3 border-0 shadow-sm rounded-3" style="width: 400px; max-width: 100vw; max-height: 100vh; overflow: auto;">
      <form onSubmit=${submitFeedback}>
        <p class="fw-semibold">Submit Feedback</p>
        <div class="mb-2">
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="radio" name="feedback" id=${`feedback-positive-${p.index}`} value="Positive Feedback">
            <label class="form-check-label" for=${`feedback-positive-${p.index}`}>👍</label>
          </div>
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="radio" name="feedback" id=${`feedback-negative-${p.index}`} value="Negative Feedback">
            <label class="form-check-label" for=${`feedback-negative-${p.index}`}>👎</label>
          </div>
        </div>
        <textarea name="comment" placeholder="Comment..." rows="3" class="form-control form-control-sm mb-2"></textarea>
        <button type="reset" class="btn btn-secondary me-2" onClick=${() => dialog()?.close()}>Cancel</button>
        <button type="submit" class="btn btn-primary">Submit</button>
      </form>
    </dialog>
  
    <${For} each=${p.message?.content}>
      ${(c) => {
        if (c.text !== undefined) { // include empty text to start message
          return html`
            <div class="position-relative hover-visible-parent">
              <!-- Edit mode for user messages -->
              <${Show} when=${() => p.message.role === "user" && isEditing()}>
                <div class="p-2 bg-light rounded">
                  <textarea 
                    class="form-control mb-2" 
                    rows="3"
                    value=${editText}
                    onInput=${(e) => {
                      console.log('Textarea input changed to:', e.target.value);
                      setEditText(e.target.value);
                    }}
                    placeholder="Edit your message..."
                  ></textarea>
                  <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-primary" onClick=${saveEdit}>Save</button>
                    <button class="btn btn-sm btn-secondary" onClick=${cancelEdit}>Cancel</button>
                  </div>
                </div>
              <//>

              <!-- Normal message display -->
              <${Show} when=${() => !(p.message.role === "user" && isEditing())}>
                <div
                  class="p-2 markdown"
                  classList=${{ "d-inline-block bg-light rounded": p.message.role === "user" }}
                  innerHTML=${() => marked.parse(c.text || "")?.replace(/<metadata[\s\S]*?<\/metadata>/gi, '')}></div>
              <//>

              <!-- User message controls (edit + branch navigation) -->
              <${Show} when=${() => p.message?.role === "user" && !isEditing()}>
                <div class="text-end end-0 top-0 opacity-50 position-absolute d-flex">
                  <!-- Debug info -->
                  
                
                  <!-- Branch navigation -->
                  <${Show} when=${() => !alternativeInfo.loading && alternativeInfo() && alternativeInfo().hasAlternatives}>
                    <div class="me-2 d-flex align-items-center">
                      <button
                        class="btn btn-sm btn-outline-light border-0 hover-visible"
                        classList=${() => ({ disabled: !alternativeInfo()?.canGoPrev })}
                        onClick=${navigatePrev}
                        title="Previous alternative">
                        ←
                      </button>
                      <small class="text-muted mx-1 hover-visible">
                        ${() => (alternativeInfo()?.currentIndex || 0) + 1}/${() => alternativeInfo()?.totalCount || 1}
                      </small>
                      <button
                        class="btn btn-sm btn-outline-light border-0 hover-visible"
                        classList=${() => ({ disabled: !alternativeInfo()?.canGoNext })}
                        onClick=${navigateNext}
                        title="Next alternative">
                        →
                      </button>
                    </div>
                  <//>
                  <!-- Edit button -->
                  <button
                    class="btn btn-sm btn-outline-light border-0 hover-visible"
                    onClick=${startEdit}
                    title="Edit message">
                    ✏️
                  </button>
                </div>


                <pre style="font-size: 10px; background: yellow;">${() => JSON.stringify({
                    message: p.message,
                    index: p.index,
                    hasGetAlternativeInfo: !!p.getAlternativeInfo,
                    alternativeInfo: alternativeInfo(),
                    resourceState: {
                      loading: alternativeInfo.loading,
                      error: alternativeInfo.error ? alternativeInfo.error.message : null,
                      state: alternativeInfo.state
                    }
                  }, null, 2)}</pre>
              <//>

              <!-- Assistant message controls (feedback + download) -->
              <${Show} when=${() => p.message?.role !== "user"}>
                <div class="text-end end-0 top-0 opacity-50 position-absolute">
                  <button
                    class="btn btn-sm btn-outline-light border-0 hover-visible"
                    onClick=${(e) => openFeedback(true)}>
                    👍
                  </button>
                  <button
                    class="btn btn-sm btn-outline-light border-0 hover-visible"
                    onClick=${(e) => openFeedback(false)}>
                    👎
                  </button>
                  <button
                    class="btn btn-sm btn-outline-light border-0 hover-visible"
                    onClick=${() => downloadText("results.txt", c.text)}>
                    💾
                  </button>
                </div>
              <//>
            </div>
          `;
        }
        
        else if (c.toolUse?.name === "search") {
          return html`<details
            class="w-100 overflow-auto p-2 rounded mvh-25"
            classList=${() => ({ "shadow-sm": visible()[p.index] })}
            open=${() => visible()[p.index]}>
            <summary class="fw-semibold px-1 mb-2" onClick=${(e) => (e.preventDefault(), toggleVisible(p.index))}>
              Searching: ${() => c.toolUse?.input?.query}...
            </summary>
            <div class="list-group">
              <${For} each=${() => getSearchResults(getToolResult(c.toolUse))}>
                ${(result) => html`<a class="list-group-item list-group-item-action border-0" href=${result.url} target="_blank" rel="noopener noreferrer">
                  <span>${result.title}</span>
                  <small class="ms-2 text-muted">${new URL(result.url).hostname}</small>
                  <ul class="small fw-normal">
                    <${For} each=${result.extra_snippets}>
                      ${(snippet) => html`<li>${snippet}</li>`}
                    <//>
                  </ul>
                </a>`}
              <//>
            </div>
          </details>`;
        }

        else if (c.toolUse?.name === "browse") {
          return html`<details
            class="w-100 overflow-auto p-2 rounded mvh-25"
            classList=${() => ({ "shadow-sm": visible()[p.index] })}
            open=${() => visible()[p.index]}>
            <summary class="fw-semibold px-1 mb-2" onClick=${(e) => (e.preventDefault(), toggleVisible(p.index))}>
              Researching: ${() => c.toolUse?.input?.url}...
            </summary>
            <div class="fw-semibold mb-2 text-muted">${() => c.toolUse?.input?.topic}</div>
            <div class="markdown" innerHTML=${() => parse(getToolResult(c.toolUse) || "")} />
          </details>`;
        }

        else if (c.toolUse?.name === "code") {
          return html`<details
            class="w-100 overflow-auto p-2 rounded hover-visible-parent position-relative"
            classList=${() => ({ "shadow-sm": visible()[p.index] })}
            open=${() => visible()[p.index]}>
            <summary class="fw-semibold  px-1 mb-2" onClick=${(e) => (e.preventDefault(), toggleVisible(p.index))}>
              Writing Code...
            </summary>
            <${Show} when=${() => getToolResult(c.toolUse)?.html}>
              <iframe srcdoc=${() => c.toolUse?.input?.source} height=${() => getToolResult(c.toolUse)?.height + 20 || "auto"} class="border-0 w-100 mvh-100"></iframe>
            <//>
            <div class="text-end end-0 top-0 opacity-50 position-absolute">
              <button
                class="btn btn-sm btn-outline-light border-0 hover-visible"
                onClick=${() => downloadText('code' + ({
                    'javascript': '.js',
                    'html': '.html',
                  }[c.toolUse?.input?.language] || '.txt'), c.toolUse?.input?.source)}>
                💾
              </button>
            </div>
            <${Show} when=${() => getToolResult(c.toolUse)?.logs?.length}>
              <pre class="small mb-3 text-muted">${() => c.toolUse?.input?.source}</pre>
              <hr />
              <pre class="small mb-0">${() => getToolResult(c.toolUse)?.logs?.join?.("\n")}</pre>
            <//>
          </details>`;
        }

        else if (c.toolUse?.name === "editor") {
          return html`<details
            class="w-100 overflow-auto p-2 rounded mvh-25"
            classList=${() => ({ "shadow-sm": visible()[p.index] })}
            open=${() => visible()[p.index]}>
            <summary class="fw-semibold px-1 mb-2" onClick=${(e) => (e.preventDefault(), toggleVisible(p.index))}>
              ${() => ({
                view: "Viewing",
                str_replace: "Updating",
                create: "Creating",
                insert: "Updating",
                undo_edit: "Undoing Edit",
              }[c.toolUse?.input?.command])}  
              File: ${() => c.toolUse?.input?.path}
            </summary>
            <div class="text-prewrap">${() => c.toolUse?.input?.new_str}</div>
            <div class="text-prewrap" innerHTML=${() => parse(getToolResult(c.toolUse) || "")?.trim()} />
          </details>`;
        }

        else if (c.reasoningContent || c.toolUse) {
          
          return html`<details
            class="w-100 overflow-auto p-2 rounded mvh-25"
            classList=${() => ({ "shadow-sm": visible()[p.index] })}
            open=${() => visible()[p.index]}>
            <summary class="fw-semibold px-1 mb-2" onClick=${(e) => (e.preventDefault(), toggleVisible(p.index))}>
              ${() => (c.reasoningContent || c.toolUse?.name === "think" ? "Reasoning..." : c?.toolUse?.name)}
            </summary>
            <div class="text-prewrap">
              <${Show} when=${() => c.reasoningContent?.reasoningText?.text}>
                ${() => c.reasoningContent.reasoningText.text}
              <//>
              <${Show} when=${() => c.toolUse}>
                ${() => html`${stringify(c?.toolUse?.input)} ${stringify(getToolResult(c.toolUse))}`}
              <//>
            </div>
          </details>`;
        }
      }}
    <//>`;
}
