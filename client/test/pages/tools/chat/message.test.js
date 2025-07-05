// Simple Message component test  
import Message from "../../../../pages/tools/chat/message.js";

describe('Message Component', () => {
  test('renders text message without errors', () => {
    const props = {
      message: {
        role: 'user',
        content: [{ text: 'Hello world' }]
      },
      index: 0
    };
    
    const result = Message(props);
    expect(result).toBeTruthy();
  });

  test('renders assistant message without errors', () => {
    const props = {
      message: {
        role: 'assistant', 
        content: [{ text: 'Hello back!' }]
      },
      index: 0
    };
    
    const result = Message(props);
    expect(result).toBeTruthy();
  });

  test('renders empty message without errors', () => {
    const props = {
      message: {
        role: 'user',
        content: [{ text: '' }]
      },
      index: 0
    };
    
    const result = Message(props);
    expect(result).toBeTruthy();
  });
});