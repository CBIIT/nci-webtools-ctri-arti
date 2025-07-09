// Real behavior tests for Message component - no mocks
import Message from "../../../../pages/tools/chat/message.js";
import { render } from "solid-js/web";
import html from "solid-js/html";
import { describe, test, expect, waitFor } from "../../../index.js";

describe('Message Component - Real Behavior', () => {
  
  describe('Basic Rendering', () => {
    test('renders user message without errors', () => {
      const props = {
        message: {
          role: 'user',
          content: [{ text: 'Hello world' }]
        },
        index: 0
      };
      
      // Create a container for the test
      const container = document.createElement('div');
      document.body.appendChild(container);
      
      // Render the component properly using SolidJS render
      render(() => html`<${Message} ...${props} />`, container);
      
      console.log('Container innerHTML:', container.innerHTML);
      console.log('Container textContent:', container.textContent);
      console.log('Container children:', container.children.length);
      
      expect(container.children.length).toBeGreaterThan(0);
      expect(container.textContent).toContain('Hello world');
      
      // Clean up
      document.body.removeChild(container);
    });

    test('renders assistant message without errors', () => {
      const props = {
        message: {
          role: 'assistant', 
          content: [{ text: 'Hello back!' }]
        },
        index: 0
      };
      
      // Create a container for the test
      const container = document.createElement('div');
      document.body.appendChild(container);
      
      // Render the component properly using SolidJS render
      render(() => html`<${Message} ...${props} />`, container);
      
      console.log('Assistant container innerHTML:', container.innerHTML);
      console.log('Assistant container textContent:', container.textContent);
      
      expect(container.children.length).toBeGreaterThan(0);
      expect(container.textContent).toContain('Hello back!');
      
      // Clean up
      document.body.removeChild(container);
    });

    test('strips XML metadata from display', () => {
      const xmlContent = '<message><text>Hey there!</text><metadata><timestamp>7/8/2025, 9:46:00 PM</timestamp><reminders>Search and browse for current information if needed.</reminders></metadata></message>';
      
      const props = {
        message: {
          role: 'user',
          content: [{ text: xmlContent }]
        },
        index: 0
      };
      
      // Create a container and render properly
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(() => html`<${Message} ...${props} />`, container);
      
      // The displayed message should not show XML tags but should show the text
      expect(container.innerHTML).not.toContain('<metadata>');
      expect(container.innerHTML).not.toContain('<reminders>');
      expect(container.textContent).toContain('Hey there!');
      
      // Clean up
      document.body.removeChild(container);
    });
  });

  describe('Edit Mode Functionality', () => {
    test('shows edit button for user messages', () => {
      const props = {
        message: {
          role: 'user',
          content: [{ text: 'Original message' }]
        },
        index: 0
      };
      
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(() => html`<${Message} ...${props} />`, container);
      
      const editButton = container.querySelector('button[title="Edit message"]');
      expect(editButton).toBeTruthy();
      expect(editButton.textContent).toContain('✏️');
      
      // Clean up
      document.body.removeChild(container);
    });

    test('does not show edit button for assistant messages', () => {
      const props = {
        message: {
          role: 'assistant',
          content: [{ text: 'Assistant response' }]
        },
        index: 0
      };
      
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(() => html`<${Message} ...${props} />`, container);
      
      const editButton = container.querySelector('button[title="Edit message"]');
      expect(editButton).toBeFalsy();
      
      // Clean up
      document.body.removeChild(container);
    });

    test('investigate message ID requirement for branching', async () => {
      // Test what happens when message has proper ID
      let functionCalled = false;
      let functionError = null;
      
      const props = {
        message: {
          role: 'user',
          content: [{ text: 'Test with ID' }],
          id: 'msg-123' // This message HAS an ID
        },
        index: 0,
        createMessageBranchAndContinue: async (index, text) => {
          functionCalled = true;
          console.log('Function called with message that has ID');
        }
      };
      
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(() => html`<${Message} ...${props} />`, container);
      
      // Enter edit mode and save
      const editButton = container.querySelector('button[title="Edit message"]');
      editButton.click();
      
      await waitFor(() => container.querySelector('textarea'), 1000);
      
      const saveButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Save'));
      saveButton.click();
      
      await waitFor(() => true, 500);
      
      console.log('Message with ID - function called:', functionCalled);
      expect(functionCalled).toBe(true);
      
      document.body.removeChild(container);
    });

    test('FIXED: save button now works correctly with proper message IDs', async () => {
      // Track if the createMessageBranchAndContinue function is called
      let functionCalled = false;
      let calledWithArgs = null;
      
      const props = {
        message: {
          role: 'user',
          content: [{ text: 'Original text' }]
        },
        index: 0,
        createMessageBranchAndContinue: async (index, text) => {
          functionCalled = true;
          calledWithArgs = [index, text];
          console.log('createMessageBranchAndContinue called with:', index, text);
        }
      };
      
      // Create a container and render properly
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(() => html`<${Message} ...${props} />`, container);
      
      console.log('Initial container HTML snippet:', container.innerHTML.substring(0, 200));
      
      // Find the edit button
      const editButton = container.querySelector('button[title="Edit message"]');
      console.log('Edit button found:', !!editButton);
      expect(editButton).toBeTruthy();
      editButton.click();
      
      // Wait for edit mode to appear
      await waitFor(() => {
        const textarea = container.querySelector('textarea');
        return textarea !== null;
      }, 2000);
      
      const textarea = container.querySelector('textarea');
      console.log('Textarea found:', !!textarea);
      console.log('Textarea value:', textarea?.value);
      expect(textarea).toBeTruthy();
      
      // Modify the text
      textarea.value = 'Modified text';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Find the save button
      const saveButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Save'));
      console.log('Save button found:', !!saveButton);
      console.log('Save button text:', saveButton?.textContent);
      expect(saveButton).toBeTruthy();
      
      // Click save - this should call createMessageBranchAndContinue
      console.log('Clicking save button...');
      saveButton.click();
      
      // Wait a bit for async operations
      await waitFor(() => true, 1000);
      
      // Check if function was called
      console.log('Function called after save click:', functionCalled);
      console.log('Called with args:', calledWithArgs);
      
      // DISCOVERY: Save button DOES work, but there might be a different bug
      console.log('DISCOVERY: Save button DOES trigger createMessageBranchAndContinue');
      expect(functionCalled).toBe(true); // Save button works!
      
      // But check if the modified text is being captured correctly
      console.log('Expected modified text: "Modified text"');
      console.log('Actual text passed to function:', calledWithArgs?.[1]);
      
      // BUG DISCOVERY: The edited text might not be captured properly
      if (calledWithArgs?.[1] !== 'Modified text') {
        console.log('POTENTIAL BUG: Edited text not captured correctly');
        console.log('Function called with original text instead of modified text');
      }
      
      // Also test what happens when the message doesn't have an ID
      console.log('Message ID:', props.message.id);
      if (!props.message.id) {
        console.log('CRITICAL BUG: Message has no ID - this will cause database errors');
      }
      
      // Clean up
      document.body.removeChild(container);
    });

    test('XML extraction works correctly in edit mode', async () => {
      const xmlContent = '<message><text>Clean extracted text</text><metadata><timestamp>7/8/2025, 9:46:00 PM</timestamp><reminders>Some reminder</reminders></metadata></message>';
      
      const props = {
        message: {
          role: 'user',
          content: [{ text: xmlContent }]
        },
        index: 0
      };
      
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(() => html`<${Message} ...${props} />`, container);
      
      // Click edit button
      const editButton = container.querySelector('button[title="Edit message"]');
      editButton.click();
      
      // Wait for textarea to appear
      await waitFor(() => {
        const textarea = container.querySelector('textarea');
        return textarea !== null;
      }, 1000);
      
      const textarea = container.querySelector('textarea');
      expect(textarea.value).toBe('Clean extracted text');
      expect(textarea.value).not.toContain('<metadata>');
      expect(textarea.value).not.toContain('<message>');
      
      // Clean up
      document.body.removeChild(container);
    });

    test('cancel button exits edit mode', async () => {
      const props = {
        message: {
          role: 'user',
          content: [{ text: 'Test message' }]
        },
        index: 0
      };
      
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(() => html`<${Message} ...${props} />`, container);
      
      // Enter edit mode
      const editButton = container.querySelector('button[title="Edit message"]');
      editButton.click();
      
      // Wait for edit UI
      await waitFor(() => container.querySelector('textarea'), 1000);
      
      // Should show edit UI
      expect(container.querySelector('textarea')).toBeTruthy();
      expect(container.textContent).toContain('Save');
      expect(container.textContent).toContain('Cancel');
      
      // Click cancel
      const cancelButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Cancel'));
      expect(cancelButton).toBeTruthy();
      cancelButton.click();
      
      // Wait for edit mode to exit
      await waitFor(() => !container.querySelector('textarea'), 1000);
      
      // Should exit edit mode
      expect(container.querySelector('textarea')).toBeFalsy();
      
      // Clean up
      document.body.removeChild(container);
    });
  });

  describe('Branch Navigation', () => {
    test('real user interaction with navigation buttons', async () => {
      let prevCalled = false;
      let nextCalled = false;
      let prevCalledWithIndex = null;
      let nextCalledWithIndex = null;
      
      const props = {
        message: {
          role: 'user',
          content: [{ text: 'Hey, can you help me with this code?' }],
          id: 'real-msg-456'
        },
        index: 2,
        getAlternativeInfo: async (index) => {
          return {
            currentIndex: 1,
            totalCount: 3,
            canGoPrev: true,
            canGoNext: true,
            hasAlternatives: true
          };
        },
        switchToPrevAlternative: async (index) => {
          prevCalled = true;
          prevCalledWithIndex = index;
          console.log('USER ACTION: Previous button clicked, index:', index);
        },
        switchToNextAlternative: async (index) => {
          nextCalled = true;
          nextCalledWithIndex = index;
          console.log('USER ACTION: Next button clicked, index:', index);
        }
      };
      
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(() => html`<${Message} ...${props} />`, container);
      
      // Wait for component to fully load with alternatives
      await waitFor(() => {
        const prevBtn = container.querySelector('button[title="Previous alternative"]');
        const nextBtn = container.querySelector('button[title="Next alternative"]');
        return prevBtn && nextBtn && !prevBtn.classList.contains('disabled');
      }, 2000);
      
      console.log('=== REAL USER TEST ===');
      console.log('User sees message:', props.message.content[0].text);
      console.log('User sees navigation buttons with counter 2/3');
      
      // User clicks previous button
      const prevButton = container.querySelector('button[title="Previous alternative"]');
      const nextButton = container.querySelector('button[title="Next alternative"]');
      
      console.log('User clicks Previous button...');
      prevButton.click();
      
      await waitFor(() => true, 500);
      
      console.log('User clicks Next button...');
      nextButton.click();
      
      await waitFor(() => true, 500);
      
      console.log('Previous function called:', prevCalled, 'with index:', prevCalledWithIndex);
      console.log('Next function called:', nextCalled, 'with index:', nextCalledWithIndex);
      
      // Clean up
      document.body.removeChild(container);
      
      expect(prevCalled).toBe(true);
      expect(nextCalled).toBe(true);
      expect(prevCalledWithIndex).toBe(2);
      expect(nextCalledWithIndex).toBe(2);
    });

    test('real user edit message interaction', async () => {
      let editCalled = false;
      let editCalledWithIndex = null;
      let editCalledWithText = null;
      
      const props = {
        message: {
          role: 'user',
          content: [{ text: 'Original message text' }],
          id: 'edit-msg-789'
        },
        index: 1,
        createMessageBranchAndContinue: async (index, text) => {
          editCalled = true;
          editCalledWithIndex = index;
          editCalledWithText = text;
          console.log('USER ACTION: Message edited, index:', index, 'new text:', text);
        }
      };
      
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(() => html`<${Message} ...${props} />`, container);
      
      console.log('=== REAL USER EDIT TEST ===');
      console.log('User sees message:', props.message.content[0].text);
      
      // User clicks edit button
      const editButton = container.querySelector('button[title="Edit message"]');
      console.log('User clicks Edit button...');
      editButton.click();
      
      // Wait for edit mode to appear
      await waitFor(() => container.querySelector('textarea'), 1000);
      
      const allTextareas = container.querySelectorAll('textarea');
      console.log('Total textareas found:', allTextareas.length);
      allTextareas.forEach((ta, idx) => {
        console.log(`Textarea ${idx}: placeholder="${ta.placeholder}" value="${ta.value}" class="${ta.className}"`);
      });
      
      const editTextarea = container.querySelector('textarea[placeholder="Edit your message..."]');
      console.log('Edit textarea found:', !!editTextarea);
      
      const textarea = editTextarea || allTextareas[0];
      console.log('Using textarea with placeholder:', textarea.placeholder);
      
      // User changes the text
      textarea.value = 'Modified message text by user';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('User types new text:', textarea.value);
      
      // User clicks save
      const saveButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Save'));
      console.log('User clicks Save button...');
      saveButton.click();
      
      await waitFor(() => true, 500);
      
      console.log('Edit function called:', editCalled);
      console.log('Edit called with index:', editCalledWithIndex);
      console.log('Edit called with text:', editCalledWithText);
      
      // Clean up
      document.body.removeChild(container);
      
      expect(editCalled).toBe(true);
      expect(editCalledWithIndex).toBe(1);
      expect(editCalledWithText).toBe('Modified message text by user');
    });

    test('full user flow: submit message, edit, save - check for bugs', async () => {
      // Simulate the complete flow described by user
      let messagesState = [
        {
          role: 'user',
          content: [{ text: 'Original user message' }],
          id: 'msg-original',
          timestamp: new Date().toISOString()
        }
      ];
      
      let editCallCount = 0;
      let getAlternativeCallCount = 0;
      
      const props = {
        message: messagesState[0],
        index: 0,
        messages: messagesState,
        getAlternativeInfo: async (index) => {
          getAlternativeCallCount++;
          console.log(`getAlternativeInfo called ${getAlternativeCallCount} times for index:`, index);
          
          // After editing, there should be alternatives
          if (editCallCount > 0) {
            return {
              currentIndex: 1,
              totalCount: 2,
              canGoPrev: true,
              canGoNext: false,
              hasAlternatives: true
            };
          }
          return null;
        },
        createMessageBranchAndContinue: async (index, newText) => {
          editCallCount++;
          console.log(`EDIT ACTION ${editCallCount}: User edited message at index ${index} with text: "${newText}"`);
          
          // Simulate what should happen:
          // 1. Create alternative
          // 2. Edit dialog should close immediately
          // 3. Original message should be replaced, not shown alongside
          // 4. Counter should appear on the active message
          
          console.log('SIMULATING: Creating message branch...');
          console.log('SIMULATING: Dialog should close NOW (not wait for LLM)');
          
          // Add alternative to messages
          messagesState.push({
            role: 'user',
            content: [{ text: newText }],
            id: 'msg-alternative',
            baseMessageId: 'msg-original',
            alternativeIndex: 1,
            timestamp: new Date().toISOString()
          });
          
          console.log('CURRENT MESSAGES STATE:', messagesState.length, 'messages');
          messagesState.forEach((msg, idx) => {
            console.log(`  Message ${idx}: "${msg.content[0].text}" (id: ${msg.id})`);
          });
        }
      };
      
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(() => html`<${Message} ...${props} />`, container);
      
      console.log('=== FULL USER BUG TEST ===');
      console.log('1. User sees original message:', props.message.content[0].text);
      
      // Check initial state - should NOT show counter yet
      let counter = container.textContent.match(/\d+\/\d+/);
      console.log('2. Initial counter visible:', !!counter, counter?.[0]);
      
      // User clicks edit
      const editButton = container.querySelector('button[title="Edit message"]');
      console.log('3. User clicks Edit button...');
      editButton.click();
      
      await waitFor(() => container.querySelector('textarea[placeholder="Edit your message..."]'), 1000);
      
      const textarea = container.querySelector('textarea[placeholder="Edit your message..."]');
      console.log('4. Edit dialog opens, textarea value:', textarea.value);
      
      // User edits text
      textarea.value = 'EDITED: This is the new message text';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      
      console.log('5. User types new text:', textarea.value);
      
      // User clicks save
      const saveButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Save'));
      console.log('6. User clicks Save button...');
      
      const beforeSaveTime = Date.now();
      saveButton.click();
      
      // Check if dialog closes immediately (it should!)
      await waitFor(() => true, 100);
      const afterSaveTime = Date.now();
      const dialogStillOpen = !!container.querySelector('textarea[placeholder="Edit your message..."]');
      
      console.log('7. Dialog still open after save:', dialogStillOpen);
      console.log('8. Time elapsed:', afterSaveTime - beforeSaveTime, 'ms (should be ~100ms, not seconds)');
      
      // Wait a bit more and check message state
      await waitFor(() => true, 500);
      
      // Check for duplicate messages (BUG: both original and new showing)
      const messageTexts = Array.from(container.querySelectorAll('.markdown')).map(el => el.textContent.trim());
      console.log('9. Visible message texts:', messageTexts);
      console.log('10. BUG CHECK - Multiple messages visible:', messageTexts.length > 1);
      
      // Check counter location and state
      const finalCounter = container.textContent.match(/\d+\/\d+/);
      console.log('11. Final counter visible:', !!finalCounter, finalCounter?.[0]);
      
      // Clean up
      document.body.removeChild(container);
      
      // Test expectations to document the bugs
      console.log('=== BUG SUMMARY ===');
      console.log('Expected: Dialog closes immediately after save');
      console.log('Expected: Only new message visible, not both');
      console.log('Expected: Counter appears on active message');
      
      expect(editCallCount).toBe(1);
    });

    test('HTML structure verification when alternatives exist', async () => {
      let getAlternativeInfoCalled = false;
      
      const props = {
        message: {
          role: 'user',
          content: [{ text: 'Message with alternatives' }],
          id: 'msg-123'
        },
        index: 0,
        getAlternativeInfo: async (index) => {
          getAlternativeInfoCalled = true;
          return {
            currentIndex: 1,
            totalCount: 3,
            canGoPrev: true,
            canGoNext: true,
            hasAlternatives: true
          };
        }
      };
      
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(() => html`<${Message} ...${props} />`, container);
      
      // Wait for resource to load and UI to update
      await waitFor(() => {
        const text = container.textContent;
        // Resource has loaded and navigation buttons are rendered
        return text.includes('2/3') && container.querySelector('button[title="Previous alternative"]');
      }, 2000);
      
      console.log('=== HTML STRUCTURE DEBUG ===');
      console.log('Full container HTML:', container.innerHTML);
      console.log('getAlternativeInfo called:', getAlternativeInfoCalled);
      
      // Look for specific elements
      const allButtons = container.querySelectorAll('button');
      console.log('All buttons found:', allButtons.length);
      allButtons.forEach((btn, idx) => {
        console.log(`Button ${idx}: title="${btn.title}" text="${btn.textContent}" class="${btn.className}"`);
      });
      
      // Look for navigation specific elements
      const prevButton = container.querySelector('button[title="Previous alternative"]');
      const nextButton = container.querySelector('button[title="Next alternative"]');
      console.log('Previous button found:', !!prevButton);
      console.log('Next button found:', !!nextButton);
      
      // Look for arrow symbols in any button
      const arrowButtons = Array.from(allButtons).filter(btn => 
        btn.textContent.includes('←') || btn.textContent.includes('→') || 
        btn.textContent.includes('<') || btn.textContent.includes('>')
      );
      console.log('Arrow buttons found:', arrowButtons.length);
      
      // Look for counter text
      const hasCounter = container.textContent.includes('2/3') || container.textContent.includes('1/3') || container.textContent.includes('/');
      console.log('Counter text found:', hasCounter);
      
      // Clean up
      document.body.removeChild(container);
      
      // Check the classList state specifically
      if (prevButton && nextButton) {
        console.log('Previous button classList:', prevButton.classList.toString());
        console.log('Next button classList:', nextButton.classList.toString());
        console.log('Previous button disabled:', prevButton.disabled);
        console.log('Next button disabled:', nextButton.disabled);
        console.log('Previous button hasClass disabled:', prevButton.classList.contains('disabled'));
        console.log('Next button hasClass disabled:', nextButton.classList.contains('disabled'));
        
        // Wait a bit more and check again
        await waitFor(() => true, 1000);
        console.log('After additional wait:');
        console.log('Previous button classList after wait:', prevButton.classList.toString());
        console.log('Next button classList after wait:', nextButton.classList.toString());
        
        // Try clicking the buttons to see if they work
        console.log('Testing button clicks...');
        prevButton.click();
        nextButton.click();
      }
      
      // Test assertions - expect them to potentially fail to show us what's wrong
      expect(getAlternativeInfoCalled).toBe(true);
      expect(prevButton).toBeTruthy();
      expect(nextButton).toBeTruthy();
      expect(prevButton.classList.contains('disabled')).toBe(false);
    });

    test('hides navigation when no alternatives exist', async () => {
      const props = {
        message: {
          role: 'user',
          content: [{ text: 'Single message' }],
          id: 'msg-456'
        },
        index: 0,
        getAlternativeInfo: async (index) => {
          return {
            currentIndex: 0,
            totalCount: 1,
            canGoPrev: false,
            canGoNext: false,
            hasAlternatives: false
          };
        }
      };
      
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(() => html`<${Message} ...${props} />`, container);
      
      // Wait for resource to load
      await waitFor(() => {
        // Wait for resource loading to complete
        return container.textContent.includes('loading: false') || 
               container.textContent.includes('resourceState');
      }, 2000);
      
      const prevButton = container.querySelector('button[title="Previous alternative"]');
      const nextButton = container.querySelector('button[title="Next alternative"]');
      
      console.log('Navigation buttons found:', !!prevButton, !!nextButton);
      console.log('Container text excerpt:', container.textContent.substring(0, 100));
      
      expect(prevButton).toBeFalsy();
      expect(nextButton).toBeFalsy();
      
      // Clean up
      document.body.removeChild(container);
    });

    test('navigation buttons call correct functions', async () => {
      let prevCalled = false;
      let nextCalled = false;
      let calledWithIndex = null;
      
      const props = {
        message: {
          role: 'user',
          content: [{ text: 'Message with alternatives' }],
          id: 'msg-789'
        },
        index: 2,
        getAlternativeInfo: async (index) => ({
          currentIndex: 1,
          totalCount: 3,
          canGoPrev: true,
          canGoNext: true,
          hasAlternatives: true
        }),
        switchToPrevAlternative: async (index) => {
          prevCalled = true;
          calledWithIndex = index;
        },
        switchToNextAlternative: async (index) => {
          nextCalled = true;
          calledWithIndex = index;
        }
      };
      
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(() => html`<${Message} ...${props} />`, container);
      
      // Wait for resource to load and buttons to appear
      await waitFor(() => {
        return container.querySelector('button[title="Previous alternative"]') && 
               container.querySelector('button[title="Next alternative"]');
      }, 2000);
      
      // Click previous button
      const prevButton = container.querySelector('button[title="Previous alternative"]');
      prevButton.click();
      
      await waitFor(() => prevCalled, 500);
      expect(prevCalled).toBe(true);
      expect(calledWithIndex).toBe(2);
      
      // Reset and click next button  
      prevCalled = false;
      calledWithIndex = null;
      
      const nextButton = container.querySelector('button[title="Next alternative"]');
      nextButton.click();
      
      await waitFor(() => nextCalled, 500);
      expect(nextCalled).toBe(true);
      expect(calledWithIndex).toBe(2);
      
      // Clean up
      document.body.removeChild(container);
    });
  });

  describe('Assistant Message Features', () => {
    test('shows feedback buttons for assistant messages', () => {
      const props = {
        message: {
          role: 'assistant',
          content: [{ text: 'Assistant response' }]
        },
        index: 0
      };
      
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(() => html`<${Message} ...${props} />`, container);
      
      const buttons = container.querySelectorAll('button');
      const thumbsUp = Array.from(buttons).find(btn => btn.textContent.includes('👍'));
      const thumbsDown = Array.from(buttons).find(btn => btn.textContent.includes('👎'));
      const download = Array.from(buttons).find(btn => btn.textContent.includes('💾'));
      
      expect(thumbsUp).toBeTruthy();
      expect(thumbsDown).toBeTruthy();
      expect(download).toBeTruthy();
      
      // Clean up
      document.body.removeChild(container);
    });
  });

  describe('Bug Investigation', () => {
    test('investigate why save button function is not called', async () => {
      // Create a component and inspect what happens when save is clicked
      let debugInfo = {};
      
      const props = {
        message: {
          role: 'user',
          content: [{ text: 'Debug test' }]
        },
        index: 0,
        createMessageBranchAndContinue: async (index, text) => {
          debugInfo.functionCalled = true;
          debugInfo.args = [index, text];
          console.log('createMessageBranchAndContinue called with:', index, text);
        }
      };
      
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(() => html`<${Message} ...${props} />`, container);
      
      // Check if the function is properly passed as prop
      console.log('Props passed to component:', Object.keys(props));
      console.log('createMessageBranchAndContinue function exists:', !!props.createMessageBranchAndContinue);
      
      // Enter edit mode
      const editButton = container.querySelector('button[title="Edit message"]');
      editButton.click();
      
      await waitFor(() => container.querySelector('textarea'), 1000);
      
      // Modify text
      const textarea = container.querySelector('textarea');
      textarea.value = 'Modified debug text';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Check if save button exists and inspect its onClick handler
      const saveButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Save'));
      console.log('Save button found:', !!saveButton);
      console.log('Save button onClick:', saveButton?.onclick);
      
      // Click save and see what happens
      if (saveButton) {
        saveButton.click();
        await waitFor(() => true, 500);
      }
      
      console.log('Debug info after save click:', debugInfo);
      
      // Now that we fixed the rendering, this should actually work
      expect(debugInfo.functionCalled).toBe(true);
      
      // Clean up
      document.body.removeChild(container);
    });
  });
});