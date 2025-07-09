// Tests that catch the REAL bugs users reported
import { render } from "solid-js/web";
import html from "solid-js/html";
import { describe, test, expect, waitFor } from "../../../index.js";
import { useChat } from "../../../../pages/tools/chat/hooks.js";
import ChatPage from "../../../../pages/tools/chat/index.js";

describe('Real Chat Bugs - XML and AI Response Issues', () => {
  
  test('BUG: Edited messages lose XML metadata wrapping', async () => {
    // Test the full flow: submit message -> edit -> check if XML wrapping is preserved
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    try {
      render(() => html`<${ChatPage} />`, container);
      
      // Submit original message
      const messageInput = container.querySelector('textarea[name="message"]');
      const submitButton = container.querySelector('button[type="submit"]');
      
      messageInput.value = 'What is machine learning?';
      submitButton.click();
      
      // Wait for message to appear and get processed
      await waitFor(() => {
        const messages = container.querySelectorAll('.markdown');
        return messages.length > 0;
      }, 2000);
      
      console.log('=== HTML AFTER INITIAL MESSAGE ===');
      console.log(container.innerHTML.substring(0, 1000) + '...');
      console.log('Messages found:', container.querySelectorAll('.markdown').length);
      
      // Find the user message and edit it
      const userMessage = Array.from(container.querySelectorAll('.markdown')).find(el => 
        el.closest('.position-relative')?.querySelector('button[title="Edit message"]')
      );
      
      const editButton = userMessage.closest('.position-relative').querySelector('button[title="Edit message"]');
      editButton.click();
      
      await waitFor(() => container.querySelector('textarea[placeholder="Edit your message..."]'), 100);
      
      const editTextarea = container.querySelector('textarea[placeholder="Edit your message..."]');
      editTextarea.value = 'What is deep learning?';
      editTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Intercept the next API call to check what gets sent
      const originalFetch = window.fetch;
      let capturedRequest = null;
      
      window.fetch = async function(...args) {
        if (args[0] === '/api/model' && args[1]?.method === 'POST') {
          capturedRequest = JSON.parse(args[1].body);
        }
        return originalFetch(...args);
      };
      
      // Save the edit
      const saveButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Save'));
      console.log('=== HTML BEFORE SAVE CLICK ===');
      console.log(container.innerHTML.substring(0, 1000) + '...');
      
      saveButton.click();
      
      console.log('=== HTML AFTER SAVE CLICK ===');
      console.log(container.innerHTML.substring(0, 1000) + '...');
      console.log('Messages after save:', container.querySelectorAll('.markdown').length);
      
      // Wait for the API call
      await waitFor(() => capturedRequest !== null, 2000);
      
      // Restore original fetch
      window.fetch = originalFetch;
      
      // BUG CHECK: The edited message should have XML wrapping with metadata
      const editedMessage = capturedRequest.messages[capturedRequest.messages.length - 1];
      const messageContent = editedMessage.content[0].text;
      
      console.log('CAPTURED MESSAGE CONTENT:', messageContent);
      console.log('Has XML wrapper:', messageContent.includes('<message>'));
      console.log('Has metadata:', messageContent.includes('<metadata>'));
      console.log('Has timestamp:', messageContent.includes('<timestamp>'));
      console.log('Has reminders:', messageContent.includes('<reminders>'));
      
      // THESE SHOULD PASS but currently FAIL due to the bug
      expect(messageContent).toContain('<message>');
      expect(messageContent).toContain('<metadata>');
      expect(messageContent).toContain('<timestamp>');
      expect(messageContent).toContain('Search and browse for current information if needed');
      expect(messageContent).toContain('What is deep learning?');
      
    } finally {
      document.body.removeChild(container);
    }
  });

  test('BUG: AI does not respond to edited messages', async () => {
    // Test that after editing a message, AI actually provides a response
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    try {
      render(() => html`<${ChatPage} />`, container);
      
      // Submit original message
      const messageInput = container.querySelector('textarea[name="message"]');
      const submitButton = container.querySelector('button[type="submit"]');
      
      messageInput.value = 'Hello AI';
      submitButton.click();
      
      // Wait for initial conversation (user + assistant response)
      await waitFor(() => {
        const messages = container.querySelectorAll('.markdown');
        return messages.length >= 2; // user message + AI response
      }, 3000);
      
      const initialMessageCount = container.querySelectorAll('.markdown').length;
      console.log('Initial message count:', initialMessageCount);
      
      // Edit the user message
      const userMessage = Array.from(container.querySelectorAll('.markdown')).find(el => 
        el.closest('.position-relative')?.querySelector('button[title="Edit message"]')
      );
      
      const editButton = userMessage.closest('.position-relative').querySelector('button[title="Edit message"]');
      editButton.click();
      
      await waitFor(() => container.querySelector('textarea[placeholder="Edit your message..."]'), 100);
      
      const editTextarea = container.querySelector('textarea[placeholder="Edit your message..."]');
      editTextarea.value = 'Hello AI, can you help me with coding?';
      editTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      
      const saveButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Save'));
      saveButton.click();
      
      console.log('=== HTML AFTER EDIT SAVE ===');
      console.log(container.innerHTML.substring(0, 1500) + '...');
      
      // BUG CHECK: AI should respond to the edited message
      // Wait for NEW AI response (message count should increase)
      await waitFor(() => {
        const currentMessages = container.querySelectorAll('.markdown');
        const newMessageCount = currentMessages.length;
        console.log('Waiting for AI response, current count:', newMessageCount);
        
        if (newMessageCount !== initialMessageCount) {
          console.log('=== HTML WHEN MESSAGE COUNT CHANGED ===');
          console.log(container.innerHTML.substring(0, 1500) + '...');
        }
        
        return newMessageCount > initialMessageCount;
      }, 5000);
      
      const finalMessageCount = container.querySelectorAll('.markdown').length;
      console.log('Final message count:', finalMessageCount);
      console.log('AI responded to edited message:', finalMessageCount > initialMessageCount);
      
      // SHOULD PASS: AI should respond to edited message
      expect(finalMessageCount).toBeGreaterThan(initialMessageCount);
      
      // Check that the latest message is from assistant (AI response)
      const allMessages = Array.from(container.querySelectorAll('.markdown'));
      const lastMessage = allMessages[allMessages.length - 1];
      const hasAssistantControls = lastMessage.closest('.position-relative')?.querySelector('button') 
        && !lastMessage.closest('.position-relative')?.querySelector('button[title="Edit message"]');
      
      console.log('Last message has assistant controls (👍👎💾):', hasAssistantControls);
      expect(hasAssistantControls).toBe(true);
      
    } finally {
      document.body.removeChild(container);
    }
  });

  test('BUG: Message content format comparison - original vs edited', async () => {
    // Compare the format of original message vs edited message
    const chatHook = useChat();
    
    await waitFor(() => true, 100); // Let hook initialize
    
    // Capture what gets sent for original message
    let originalMessageCapture = null;
    let editedMessageCapture = null;
    
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      if (args[0] === '/api/model' && args[1]?.method === 'POST') {
        const request = JSON.parse(args[1].body);
        const userMessage = request.messages.find(m => m.role === 'user');
        
        if (!originalMessageCapture) {
          originalMessageCapture = userMessage;
          console.log('CAPTURED ORIGINAL MESSAGE:', userMessage);
        } else if (!editedMessageCapture) {
          editedMessageCapture = userMessage;
          console.log('CAPTURED EDITED MESSAGE:', userMessage);
        }
      }
      return originalFetch(...args);
    };
    
    // Submit original message through hook
    await chatHook.submitMessage({
      message: 'What is React?',
      inputFiles: null,
      reasoningMode: false,
      model: 'test-model',
      reset: () => {}
    });
    
    await waitFor(() => originalMessageCapture !== null, 1000);
    
    // Simulate editing (this should go through the same submitMessage path)
    await chatHook.submitMessage({
      message: 'What is Vue.js?',
      inputFiles: null,
      reasoningMode: false, 
      model: 'test-model',
      reset: () => {}
    });
    
    await waitFor(() => editedMessageCapture !== null, 1000);
    
    // Restore fetch
    window.fetch = originalFetch;
    
    // COMPARISON: Both should have same XML structure
    const originalText = originalMessageCapture.content[0].text;
    const editedText = editedMessageCapture.content[0].text;
    
    console.log('=== MESSAGE FORMAT COMPARISON ===');
    console.log('Original format:', originalText.substring(0, 100) + '...');
    console.log('Edited format:', editedText.substring(0, 100) + '...');
    console.log('Both have XML wrapper:', originalText.includes('<message>') && editedText.includes('<message>'));
    console.log('Both have metadata:', originalText.includes('<metadata>') && editedText.includes('<metadata>'));
    
    // SHOULD BE TRUE: Both messages should have identical structure
    expect(originalText.includes('<message>')).toBe(true);
    expect(editedText.includes('<message>')).toBe(true);
    expect(originalText.includes('<metadata>')).toBe(true);
    expect(editedText.includes('<metadata>')).toBe(true);
    
    // The actual message content should be different
    expect(originalText.includes('React')).toBe(true);
    expect(editedText.includes('Vue.js')).toBe(true);
  });

  test('BUG: Conversation flow breaks after message editing', async () => {
    // Test complete conversation flow: message -> response -> edit -> response
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    try {
      render(() => html`<${ChatPage} />`, container);
      
      // Step 1: Submit original message
      const messageInput = container.querySelector('textarea[name="message"]');
      const submitButton = container.querySelector('button[type="submit"]');
      
      messageInput.value = 'Count to 3';
      submitButton.click();
      
      // Step 2: Wait for AI response
      await waitFor(() => {
        const messages = container.querySelectorAll('.markdown');
        return messages.length >= 2;
      }, 3000);
      
      // Step 3: Edit the original message  
      const userMessage = Array.from(container.querySelectorAll('.markdown')).find(el => 
        el.closest('.position-relative')?.querySelector('button[title="Edit message"]')
      );
      
      const editButton = userMessage.closest('.position-relative').querySelector('button[title="Edit message"]');
      editButton.click();
      
      await waitFor(() => container.querySelector('textarea[placeholder="Edit your message..."]'), 100);
      
      const editTextarea = container.querySelector('textarea[placeholder="Edit your message..."]');
      editTextarea.value = 'Count to 5';
      editTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      
      const saveButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Save'));
      saveButton.click();
      
      // Step 4: Check conversation state
      await waitFor(() => true, 2000); // Give time for processing
      
      console.log('=== FINAL HTML STATE ===');  
      console.log(container.innerHTML.substring(0, 2000) + '...');
      
      const finalMessages = Array.from(container.querySelectorAll('.markdown'));
      console.log('Final conversation state:');
      finalMessages.forEach((msg, idx) => {
        const isUser = !!msg.closest('.position-relative')?.querySelector('button[title="Edit message"]');
        console.log(`  ${idx}: ${isUser ? 'USER' : 'AI'} - "${msg.textContent.trim().substring(0, 50)}..."`);
        console.log(`       HTML: ${msg.innerHTML.substring(0, 100)}...`);
      });
      
      // BUG CHECKS:
      // 1. Should not have duplicate user messages
      const userMessages = finalMessages.filter(msg => 
        msg.closest('.position-relative')?.querySelector('button[title="Edit message"]')
      );
      console.log('User messages found:', userMessages.length);
      
      // 2. Should have AI response to the edited message
      const aiMessages = finalMessages.filter(msg => 
        !msg.closest('.position-relative')?.querySelector('button[title="Edit message"]')
      );
      console.log('AI messages found:', aiMessages.length);
      
      // 3. Latest AI message should reference "5" not "3"  
      if (aiMessages.length > 0) {
        const latestAI = aiMessages[aiMessages.length - 1].textContent;
        console.log('Latest AI response contains "5":', latestAI.includes('5'));
        console.log('Latest AI response contains "3":', latestAI.includes('3'));
      }
      
      // EXPECTATIONS (these reveal the bugs):
      expect(userMessages.length).toBe(1); // Should not duplicate user messages
      expect(aiMessages.length).toBeGreaterThan(0); // Should have AI response
      
    } finally {
      document.body.removeChild(container);
    }
  });
});