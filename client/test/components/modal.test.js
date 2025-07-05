// Modal component tests
import { createSignal } from "solid-js";
import Modal from "../../components/modal.js";

describe('Modal Component', () => {
  test('renders without errors when closed', () => {
    const result = Modal({ open: false });
    expect(result).toBeTruthy();
    expect(result.tagName).toBe('DIALOG');
  });

  test('renders without errors when open', () => {
    const result = Modal({ open: true, title: 'Test Modal' });
    expect(result).toBeTruthy();
    expect(result.hasAttribute('open')).toBe(true);
  });

  test('renders with children content', () => {
    const result = Modal({ 
      open: true, 
      children: 'Test content' 
    });
    expect(result.textContent).toContain('Test content');
  });

  test('modal open state controls visibility', () => {
    const [open, setOpen] = createSignal(false);
    
    // Test closed modal
    let result = Modal({ open: open() });
    expect(result.hasAttribute('open')).toBe(false);
    
    // Test open modal  
    setOpen(true);
    result = Modal({ open: open() });
    expect(result.hasAttribute('open')).toBe(true);
  });

  test('modal accepts setOpen callback', () => {
    let wasCallbackCalled = false;
    const mockSetOpen = () => { wasCallbackCalled = true; };
    
    const result = Modal({ open: true, setOpen: mockSetOpen });
    expect(result).toBeTruthy();
    
    // Test that the callback was passed (component should render without errors)
    expect(wasCallbackCalled).toBe(false); // Callback not called during render
  });

  test('modal with title and footer', () => {
    const result = Modal({ 
      open: true,
      title: 'Test Title',
      footer: 'Test Footer'
    });
    
    expect(result.textContent).toContain('Test Title');
    expect(result.textContent).toContain('Test Footer');
  });
});