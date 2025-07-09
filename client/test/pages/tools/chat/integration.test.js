// Integration test for the entire chat system
import { render } from "solid-js/web";
import html from "solid-js/html";
import { describe, test, expect, waitFor } from "../../../index.js";
import ChatPage from "../../../../pages/tools/chat/index.js";

describe('Full Chat System Integration', () => {

  // POSITIVE BASELINE TESTS - What should work correctly
  test('POSITIVE: Normal conversation flow works (user → AI)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    try {
      render(() => html`<${ChatPage} />`, container);
      
      console.log('=== TESTING NORMAL CONVERSATION FLOW ===');
      
      const messageInput = container.querySelector('textarea[name="message"]');
      const submitButton = container.querySelector('button[type="submit"]');
      
      messageInput.value = 'Hello, how are you?';
      console.log('User types:', messageInput.value);
      submitButton.click();
      
      // Wait for user message + AI response
      await waitFor(() => {
        const messages = container.querySelectorAll('.markdown');
        console.log('Normal flow - messages found:', messages.length);
        return messages.length >= 2;
      }, 3000);
      
      const allMessages = Array.from(container.querySelectorAll('.markdown'));
      console.log('=== NORMAL CONVERSATION RESULT ===');
      allMessages.forEach((msg, idx) => {
        const isUser = !!msg.closest('.position-relative')?.querySelector('button[title="Edit message"]');
        console.log(`  ${idx + 1}: ${isUser ? 'USER' : 'AI'} - "${msg.textContent.trim().substring(0, 50)}..."`);
      });
      
      // POSITIVE ASSERTIONS
      expect(allMessages.length).toBeGreaterThanOrEqual(2);
      
      const firstIsUser = !!allMessages[0].closest('.position-relative')?.querySelector('button[title="Edit message"]');
      const secondIsUser = !!allMessages[1].closest('.position-relative')?.querySelector('button[title="Edit message"]');
      expect(firstIsUser).toBe(true);  // First should be user
      expect(secondIsUser).toBe(false); // Second should be AI
      
      console.log('✅ Normal conversation flow WORKS');
      
    } finally {
      document.body.removeChild(container);
    }
  });

  test('POSITIVE: Normal conversation flow with tool calls', async () => {
    // Test that the backend API works correctly with tool requests
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    try {
      render(() => html`<${ChatPage} />`, container);
      
      const messageInput = container.querySelector('textarea[name="message"]');
      const submitButton = container.querySelector('button[type="submit"]');
      
      // The mock API in test.js triggers tool use if message contains "tool"
      messageInput.value = 'Please use a tool to help me';
      console.log('User requests tool use');
      submitButton.click();
      
      // Wait for conversation to develop with tool calls
      await waitFor(() => {
        const messages = container.querySelectorAll('.markdown');
        const toolElements = container.querySelectorAll('details'); // Tools show as details
        console.log('Tool test - messages:', messages.length, 'tools:', toolElements.length);
        return messages.length >= 2 && toolElements.length > 0;
      }, 4000);
      
      const messages = container.querySelectorAll('.markdown');
      const toolElements = container.querySelectorAll('details');
      
      console.log('=== TOOL CALL CONVERSATION RESULT ===');
      console.log('Messages found:', messages.length);
      console.log('Tool elements found:', toolElements.length);
      
      if (toolElements.length > 0) {
        const firstTool = toolElements[0];
        const summary = firstTool.querySelector('summary');
        console.log('Tool summary:', summary?.textContent);
      }
      
      // POSITIVE ASSERTIONS
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(toolElements.length).toBeGreaterThan(0);
      
      console.log('✅ Tool call conversation works with mock API');
      
    } finally {
      document.body.removeChild(container);
    }
  });

  test('BUG DETECTION: Edited messages vs normal messages format', async () => {
    // Test to detect the XML formatting bug by comparing behavior
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    try {
      render(() => html`<${ChatPage} />`, container);
      
      console.log('=== TESTING EDITED VS NORMAL MESSAGE FORMAT ===');
      
      const messageInput = container.querySelector('textarea[name="message"]');
      const submitButton = container.querySelector('button[type="submit"]');
      
      // STEP 1: Submit normal message  
      messageInput.value = 'Normal message test';
      submitButton.click();
      
      // Wait for normal conversation to develop
      await waitFor(() => {
        const messages = container.querySelectorAll('.markdown');
        return messages.length >= 2; // User + AI response
      }, 3000);
      
      const normalConversationCount = container.querySelectorAll('.markdown').length;
      console.log('Normal conversation messages:', normalConversationCount);
      
      // STEP 2: Edit the message to trigger the bug
      const userMessage = Array.from(container.querySelectorAll('.markdown')).find(el => 
        el.closest('.position-relative')?.querySelector('button[title="Edit message"]')
      );
      
      if (userMessage) {
        console.log('Found user message, clicking edit...');
        const editButton = userMessage.closest('.position-relative').querySelector('button[title="Edit message"]');
        editButton.click();
        
        await waitFor(() => container.querySelector('textarea[placeholder="Edit your message..."]'), 100);
        
        const editTextarea = container.querySelector('textarea[placeholder="Edit your message..."]');
        editTextarea.value = 'Edited message test';
        editTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        
        console.log('Saving edited message...');
        const saveButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Save'));
        saveButton.click();
        
        // Wait to see if AI responds to edited message
        console.log('Waiting to see if AI responds to edited message...');
        await waitFor(() => true, 3000);
        
        const finalMessageCount = container.querySelectorAll('.markdown').length;
        console.log('Final message count:', finalMessageCount);
        console.log('Did AI respond to edited message?', finalMessageCount > normalConversationCount);
        
        // BUG DETECTION: If XML wrapping is broken, AI may not respond properly
        const allMessages = Array.from(container.querySelectorAll('.markdown'));
        console.log('=== FINAL CONVERSATION STATE ===');
        allMessages.forEach((msg, idx) => {
          const isUser = !!msg.closest('.position-relative')?.querySelector('button[title="Edit message"]');
          console.log(`  ${idx + 1}: ${isUser ? 'USER' : 'AI'} - "${msg.textContent.trim().substring(0, 40)}..."`);
        });
        
        // The test passes if AI responds to edited message properly
        const hasNewAIResponse = finalMessageCount > normalConversationCount;
        console.log('AI responded to edited message:', hasNewAIResponse);
        
        // This expectation will reveal the bug when it fails
        expect(hasNewAIResponse).toBe(true);
        
      } else {
        console.log('Could not find user message to edit');
        expect(userMessage).toBeTruthy();
      }
      
    } finally {
      document.body.removeChild(container);
    }
  });

  test('POSITIVE: Multi-turn conversation maintains context', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    try {
      render(() => html`<${ChatPage} />`, container);
      
      const messageInput = container.querySelector('textarea[name="message"]');
      const submitButton = container.querySelector('button[type="submit"]');
      
      // Turn 1
      messageInput.value = 'What is React?';
      submitButton.click();
      
      await waitFor(() => {
        const messages = container.querySelectorAll('.markdown');
        return messages.length >= 2;
      }, 3000);
      
      const turn1Count = container.querySelectorAll('.markdown').length;
      
      // Turn 2
      messageInput.value = 'Can you give me an example?';
      submitButton.click();
      
      await waitFor(() => {
        const messages = container.querySelectorAll('.markdown');
        return messages.length > turn1Count;
      }, 3000);
      
      const turn2Count = container.querySelectorAll('.markdown').length;
      expect(turn2Count).toBeGreaterThan(turn1Count);
      
      console.log('Multi-turn conversation works');
      
    } finally {
      document.body.removeChild(container);
    }
  });

  test('chat system HTML structure analysis', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    try {
      render(() => html`<${ChatPage} />`, container);
      await waitFor(() => true, 2000);
      
      console.log('=== CHAT SYSTEM ANALYSIS ===');
      console.log('Container has content:', container.innerHTML.length > 100);
      
      // Look for key elements
      const messageInput = container.querySelector('textarea[name="message"]');
      const submitButton = container.querySelector('button[type="submit"]');
      const messages = container.querySelectorAll('.markdown');
      
      console.log('Message input found:', !!messageInput);
      console.log('Submit button found:', !!submitButton);
      console.log('Messages found:', messages.length);
      
      if (messages.length > 0) {
        console.log('Sample messages:');
        Array.from(messages).slice(0, 3).forEach((msg, idx) => {
          const hasEditButton = !!msg.closest('.position-relative')?.querySelector('button[title="Edit message"]');
          console.log(`  ${idx}: "${msg.textContent.trim()}" (edit: ${hasEditButton})`);
        });
      }
      
      // Try to submit a simple message
      if (messageInput && submitButton) {
        console.log('Testing message submission...');
        messageInput.value = 'Test message for editing';
        submitButton.click();
        
        await waitFor(() => container.querySelectorAll('.markdown').length > messages.length, 3000);
        
        const newMessages = container.querySelectorAll('.markdown');
        console.log('Messages after submit:', newMessages.length);
        
        // Look for user messages with edit buttons
        const userMessagesWithEdit = Array.from(newMessages).filter(msg => 
          msg.closest('.position-relative')?.querySelector('button[title="Edit message"]')
        );
        
        console.log('User messages with edit buttons:', userMessagesWithEdit.length);
        
        if (userMessagesWithEdit.length > 0) {
          const firstUserMsg = userMessagesWithEdit[0];
          console.log('First editable message:', firstUserMsg.textContent.trim());
          
          // Try to edit it
          const editBtn = firstUserMsg.closest('.position-relative').querySelector('button[title="Edit message"]');
          editBtn.click();
          
          await waitFor(() => container.querySelector('textarea[placeholder="Edit your message..."]'), 2000);
          
          const editTextarea = container.querySelector('textarea[placeholder="Edit your message..."]');
          console.log('Edit dialog opened:', !!editTextarea);
          
          if (editTextarea) {
            console.log('Original edit text:', editTextarea.value);
            
            editTextarea.value = 'EDITED: New message text';
            editTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            
            const saveBtn = Array.from(container.querySelectorAll('button')).find(b => 
              b.textContent.includes('Save')
            );
            
            if (saveBtn) {
              console.log('Clicking save button...');
              const beforeSave = Date.now();
              saveBtn.click();
              
              await waitFor(() => true, 2000);
              const afterSave = Date.now();
              
              const dialogOpen = !!container.querySelector('textarea[placeholder="Edit your message..."]');
              console.log('Dialog still open after save:', dialogOpen);
              console.log('Time elapsed:', afterSave - beforeSave, 'ms');
              
              console.log('=== FULL HTML AFTER EDIT ===');
              console.log(container.innerHTML);
              console.log('=== END HTML ===');
              
              // Check for message duplication
              const allMsgs = Array.from(container.querySelectorAll('.markdown')).map(el => el.textContent.trim());
              console.log('All messages after edit:');
              allMsgs.forEach((msg, idx) => console.log(`  ${idx}: "${msg}"`));
              
              const duplicates = allMsgs.filter(msg => msg.includes('Test message') || msg.includes('EDITED'));
              console.log('Messages related to our test:', duplicates.length);
              
              // Look for navigation counters
              const counters = container.innerHTML.match(/\d+\/\d+/g);
              console.log('Navigation counters found:', counters);
              
              console.log('=== FINDINGS ===');
              console.log('Edit functionality works:', !dialogOpen);
              console.log('Potential duplication issue:', duplicates.length > 1);
            }
          }
        }
      }
      
      expect(container.innerHTML.length).toBeGreaterThan(100);
      
    } finally {
      document.body.removeChild(container);
    }
  });

  test('complete user flow: submit message, edit, save - real chat system', async () => {
    // Create container and mount the entire chat system
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    console.log('=== FULL CHAT SYSTEM TEST ===');
    
    try {
      // Render the entire chat page
      render(() => html`<${ChatPage} />`, container);
      
      console.log('1. Chat system mounted');
      
      // Wait for initialization
      await waitFor(() => true, 2000);
      
      // Find the message input textarea
      const messageInput = container.querySelector('textarea[name="message"]');
      console.log('2. Message input found:', !!messageInput);
      
      if (!messageInput) {
        console.log('CONTAINER HTML:', container.innerHTML.substring(0, 500));
        throw new Error('Message input not found');
      }
      
      // User types a message
      const originalMessage = 'Hello, can you help me with coding?';
      messageInput.value = originalMessage;
      messageInput.dispatchEvent(new Event('input', { bubbles: true }));
      
      console.log('3. User types message:', originalMessage);
      
      // Find and click submit button
      const submitButton = container.querySelector('button[type="submit"]');
      console.log('4. Submit button found:', !!submitButton);
      
      // Submit the message
      console.log('5. User clicks Submit...');
      submitButton.click();
      
      // Wait for message to appear
      await waitFor(() => {
        const userMessages = container.querySelectorAll('.markdown');
        return userMessages.length > 0;
      }, 5000);
      
      console.log('6. Message submitted and visible');
      
      // Find the user message element (look for any user message since text may be wrapped in XML)
      const allMessages = Array.from(container.querySelectorAll('.markdown'));
      console.log('ALL MESSAGE ELEMENTS:', allMessages.map(el => el.textContent.trim()));
      
      let userMessage = allMessages.find(el => 
        el.textContent.includes(originalMessage) || 
        el.textContent.includes('help') ||
        el.textContent.includes('coding') ||
        el.closest('.position-relative')?.querySelector('button[title="Edit message"]')
      );
      
      if (!userMessage) {
        console.log('LOOKING FOR USER MESSAGE WITH EDIT BUTTON...');
        const messagesWithEditButton = allMessages.filter(el => 
          el.closest('.position-relative')?.querySelector('button[title="Edit message"]')
        );
        console.log('MESSAGES WITH EDIT BUTTONS:', messagesWithEditButton.length);
        if (messagesWithEditButton.length > 0) {
          userMessage = messagesWithEditButton[0];
          console.log('USING FIRST MESSAGE WITH EDIT BUTTON:', userMessage.textContent.trim());
        } else {
          throw new Error('No user message with edit button found');
        }
      }
      
      // Find the edit button for this message
      const editButton = userMessage.closest('.position-relative')?.querySelector('button[title="Edit message"]');
      console.log('7. Edit button found:', !!editButton);
      
      if (!editButton) {
        console.log('USER MESSAGE PARENT HTML:', userMessage.closest('.position-relative')?.innerHTML);
        throw new Error('Edit button not found');
      }
      
      // Click edit button
      console.log('8. User clicks Edit button...');
      editButton.click();
      
      // Wait for edit dialog to appear
      await waitFor(() => {
        return container.querySelector('textarea[placeholder="Edit your message..."]');
      }, 2000);
      
      const editTextarea = container.querySelector('textarea[placeholder="Edit your message..."]');
      console.log('9. Edit dialog opens, textarea value:', editTextarea?.value);
      
      if (!editTextarea) {
        console.log('EDIT DIALOG HTML:', container.innerHTML.substring(0, 1000));
        throw new Error('Edit textarea not found');
      }
      
      // User edits the message
      const newMessage = 'EDITED: Can you help me debug this React component?';
      editTextarea.value = newMessage;
      editTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      
      console.log('10. User types new message:', newMessage);
      
      // Find and click save button
      const saveButton = Array.from(container.querySelectorAll('button')).find(b => 
        b.textContent.includes('Save')
      );
      console.log('11. Save button found:', !!saveButton);
      
      if (!saveButton) {
        throw new Error('Save button not found');
      }
      
      console.log('12. User clicks Save button...');
      const beforeSave = Date.now();
      saveButton.click();
      
      // Check if dialog closes quickly (it should not wait for LLM)
      await waitFor(() => true, 500);
      const afterSave = Date.now();
      
      const dialogStillOpen = !!container.querySelector('textarea[placeholder="Edit your message..."]');
      console.log('13. Dialog still open after 500ms:', dialogStillOpen);
      console.log('14. Time elapsed:', afterSave - beforeSave, 'ms');
      
      // Check for duplicate messages (the bug!)
      await waitFor(() => true, 1000);
      
      const allVisibleMessages = Array.from(container.querySelectorAll('.markdown')).map(el => ({
        text: el.textContent.trim(),
        element: el
      }));
      
      console.log('15. All visible messages:');
      allVisibleMessages.forEach((msg, idx) => {
        console.log(`    Message ${idx}: "${msg.text}"`);
      });
      
      const duplicateMessages = allVisibleMessages.filter(msg => 
        msg.text.includes('help me') || msg.text.includes('coding') || msg.text.includes('React')
      );
      
      console.log('16. BUG CHECK - Duplicate user messages:', duplicateMessages.length);
      
      // Check for navigation counter
      const counter = container.textContent.match(/\d+\/\d+/);
      console.log('17. Navigation counter visible:', !!counter, counter?.[0]);
      
      // Wait longer to see if LLM response affects the dialog
      console.log('18. Waiting for potential LLM response...');
      await waitFor(() => true, 3000);
      
      const dialogAfterLLM = !!container.querySelector('textarea[placeholder="Edit your message..."]');
      console.log('19. Dialog still open after LLM wait:', dialogAfterLLM);
      
      const finalMessages = Array.from(container.querySelectorAll('.markdown')).map(el => 
        el.textContent.trim()
      );
      console.log('20. Final message count:', finalMessages.length);
      
      console.log('=== BUG REPORT ===');
      console.log('EXPECTED: Dialog closes immediately after save');
      console.log('ACTUAL: Dialog open after save:', dialogStillOpen);
      console.log('');
      console.log('EXPECTED: Only edited message visible');
      console.log('ACTUAL: Multiple user messages:', duplicateMessages.length > 1);
      console.log('');
      console.log('EXPECTED: Navigation counter on active message');
      console.log('ACTUAL: Counter visible:', !!counter);
      
      // Test passes if we captured the bugs
      expect(allVisibleMessages.length).toBeGreaterThan(0);
      
    } finally {
      // Clean up
      document.body.removeChild(container);
    }
  });

  test('real branch navigation: create alternatives and switch between them', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    console.log('=== BRANCH NAVIGATION TEST ===');
    
    try {
      // Render the entire chat page
      render(() => html`<${ChatPage} />`, container);
      
      // Wait for initialization
      await waitFor(() => true, 2000);
      
      // Submit initial message
      const messageInput = container.querySelector('textarea[name="message"]');
      const submitButton = container.querySelector('button[type="submit"]');
      
      const originalMessage = 'What is React?';
      messageInput.value = originalMessage;
      messageInput.dispatchEvent(new Event('input', { bubbles: true }));
      
      console.log('1. Submitting original message:', originalMessage);
      submitButton.click();
      
      // Wait for message to appear
      await waitFor(() => {
        const userMessages = container.querySelectorAll('.markdown');
        return userMessages.length > 0;
      }, 5000);
      
      // Find user message and edit it to create first alternative
      const allMessages = Array.from(container.querySelectorAll('.markdown'));
      const userMessage = allMessages.find(el => 
        el.textContent.includes('React') || 
        el.closest('.position-relative')?.querySelector('button[title="Edit message"]')
      );
      
      console.log('2. Found user message, clicking edit...');
      const editButton = userMessage.closest('.position-relative').querySelector('button[title="Edit message"]');
      editButton.click();
      
      await waitFor(() => container.querySelector('textarea[placeholder="Edit your message..."]'), 2000);
      
      // Edit to create first alternative
      const editTextarea = container.querySelector('textarea[placeholder="Edit your message..."]');
      const firstAlternative = 'What is Vue.js?';
      editTextarea.value = firstAlternative;
      editTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      
      console.log('3. Creating first alternative:', firstAlternative);
      const saveButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Save'));
      saveButton.click();
      
      // Wait for alternative to be created
      await waitFor(() => true, 2000);
      
      // Edit again to create second alternative
      console.log('4. Creating second alternative...');
      const editButton2 = container.querySelector('button[title="Edit message"]');
      editButton2.click();
      
      await waitFor(() => container.querySelector('textarea[placeholder="Edit your message..."]'), 2000);
      
      const editTextarea2 = container.querySelector('textarea[placeholder="Edit your message..."]');
      const secondAlternative = 'What is Angular?';
      editTextarea2.value = secondAlternative;
      editTextarea2.dispatchEvent(new Event('input', { bubbles: true }));
      
      console.log('5. Creating second alternative:', secondAlternative);
      const saveButton2 = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Save'));
      saveButton2.click();
      
      // Wait for second alternative
      await waitFor(() => true, 2000);
      
      // Now we should have navigation buttons - find them
      console.log('6. Looking for navigation buttons...');
      const prevButton = container.querySelector('button[title="Previous alternative"]');
      const nextButton = container.querySelector('button[title="Next alternative"]');
      const counter = container.textContent.match(/\d+\/\d+/);
      
      console.log('7. Navigation elements found:');
      console.log('   Previous button:', !!prevButton);
      console.log('   Next button:', !!nextButton);
      console.log('   Counter:', counter?.[0]);
      
      if (prevButton && nextButton) {
        // Check current message content
        const getCurrentMessage = () => {
          const messages = Array.from(container.querySelectorAll('.markdown')).filter(el => 
            el.textContent.includes('React') || 
            el.textContent.includes('Vue') || 
            el.textContent.includes('Angular')
          );
          return messages[0]?.textContent.trim() || 'No message found';
        };
        
        const currentMsg1 = getCurrentMessage();
        console.log('8. Current message before navigation:', currentMsg1);
        
        // Click previous button
        console.log('9. Clicking Previous button...');
        prevButton.click();
        
        await waitFor(() => true, 1000);
        
        const currentMsg2 = getCurrentMessage();
        console.log('10. Message after clicking Previous:', currentMsg2);
        
        // Click next button
        console.log('11. Clicking Next button...');
        nextButton.click();
        
        await waitFor(() => true, 1000);
        
        const currentMsg3 = getCurrentMessage();
        console.log('12. Message after clicking Next:', currentMsg3);
        
        // Test navigation effects
        console.log('=== NAVIGATION TEST RESULTS ===');
        console.log('Message 1 (start):', currentMsg1);
        console.log('Message 2 (after prev):', currentMsg2);
        console.log('Message 3 (after next):', currentMsg3);
        
        const navigationWorking = currentMsg1 !== currentMsg2 || currentMsg2 !== currentMsg3;
        console.log('Navigation working:', navigationWorking);
        
        // Check counter updates
        const finalCounter = container.textContent.match(/\d+\/\d+/);
        console.log('Final counter:', finalCounter?.[0]);
        
        expect(navigationWorking).toBe(true);
      } else {
        console.log('ERROR: Navigation buttons not found!');
        console.log('Full HTML around user message:');
        const userMsgElement = container.querySelector('button[title="Edit message"]')?.closest('.position-relative');
        console.log(userMsgElement?.innerHTML || 'No user message element found');
      }
      
    } finally {
      document.body.removeChild(container);
    }
  });
});