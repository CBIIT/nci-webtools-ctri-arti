// Test all patterns from client README.md
import { createSignal, createMemo, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import html from "solid-js/html";

describe('SolidJS README Patterns', () => {
  test('signals auto-wrapped', () => {
    function Counter() {
      const [count, setCount] = createSignal(5);
      
      return html`<div>${count}</div>`;
    }

    const result = Counter();
    expect(result.textContent).toBe('5');
  });

  test('store properties always wrapped', () => {
    function UserCard() {
      const [user, setUser] = createStore({ name: 'John', age: 25 });
      
      return html`<div>${() => user.name} is ${() => user.age}</div>`;
    }

    const result = UserCard();
    expect(result.textContent).toBe('John is 25');
  });

  test('signal properties manual wrap', () => {
    function UserProfile() {
      const [user, setUser] = createSignal({ name: 'Jane', email: 'jane@test.com' });
      
      return html`<div>${() => user().name}: ${() => user().email}</div>`;
    }

    const result = UserProfile();
    expect(result.textContent).toBe('Jane: jane@test.com');
  });

  test('memos auto-wrapped', () => {
    function Calculator() {
      const [count, setCount] = createSignal(5);
      const doubled = createMemo(() => count() * 2);
      
      return html`<div>${doubled}</div>`;
    }

    const result = Calculator();
    expect(result.textContent).toBe('10');
  });

  test('computations manual wrap', () => {
    function Calculator() {
      const [a, setA] = createSignal(3);
      const [b, setB] = createSignal(4);
      
      return html`<div>${() => a() + b()}</div>`;
    }

    const result = Calculator();
    expect(result.textContent).toBe('7');
  });

  test('props access without destructuring', () => {
    function Button(props) {
      return html`<button class=${() => props.variant}>${() => props.children}</button>`;
    }

    const result = Button({ variant: 'primary', children: 'Click me' });
    expect(result.className).toBe('primary');
    expect(result.textContent).toBe('Click me');
  });

  test('dynamic class names', () => {
    function StatusCard() {
      const [isActive, setIsActive] = createSignal(true);
      const [theme, setTheme] = createSignal('dark');
      
      const classes = () => ['card', theme(), isActive() ? 'active' : ''].filter(Boolean).join(' ');
      
      return html`<div class=${classes}>Content</div>`;
    }

    const result = StatusCard();
    expect(result.className).toBe('card dark active');
  });

  test('classList syntax', () => {
    function ConditionalCard() {
      const [theme, setTheme] = createSignal('dark');
      
      return html`<div classList=${{
        card: true,
        [`theme-${theme()}`]: true
      }}>Content</div>`;
    }

    const result = ConditionalCard();
    expect(result.classList.contains('card')).toBe(true);
    expect(result.classList.contains('theme-dark')).toBe(true);
  });

  test('For component with items', () => {
    function TodoList() {
      const todos = [
        { id: 1, text: 'Learn SolidJS' },
        { id: 2, text: 'Build app' }
      ];
      
      return html`<ul>
        <${For} each=${todos}>
          ${(todo) => html`<li>${todo.text}</li>`}
        <//>
      </ul>`;
    }

    const result = TodoList();
    expect(result.children.length).toBe(2);
    expect(result.children[0].textContent).toBe('Learn SolidJS');
    expect(result.children[1].textContent).toBe('Build app');
  });

  test('Show component for conditional rendering', () => {
    function ConditionalContent() {
      const [showContent, setShowContent] = createSignal(true);
      
      return html`<div>
        <${Show} when=${showContent} fallback=${html`<p>Hidden</p>`}>
          <p>Visible</p>
        <//>
      </div>`;
    }

    const result = ConditionalContent();
    expect(result.textContent.trim()).toBe('Visible');
  });

  test('Show component fallback', () => {
    function ConditionalContent() {
      const [showContent, setShowContent] = createSignal(false);
      
      return html`<div>
        <${Show} when=${showContent} fallback=${html`<p>Hidden</p>`}>
          <p>Visible</p>
        <//>
      </div>`;
    }

    const result = ConditionalContent();
    expect(result.textContent.trim()).toBe('Hidden');
  });

  test('component with self-closing syntax', () => {
    function Icon(props) {
      return html`<i class=${() => `icon-${props.name}`}></i>`;
    }

    function Header() {
      return html`<h1><${Icon} name="star" /> Title</h1>`;
    }

    const result = Header();
    expect(result.querySelector('i').className).toBe('icon-star');
    expect(result.textContent.trim()).toBe('Title');
  });
});