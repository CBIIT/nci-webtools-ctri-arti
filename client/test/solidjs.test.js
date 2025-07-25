import test from './test.js';
import assert from './assert.js';
// Test all patterns from client README.md
import { createSignal, createMemo, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import html from "solid-js/html";

test('SolidJS README Patterns', async (t) => {
  await t.test('signals auto-wrapped', () => {
    function Counter() {
      const [count, setCount] = createSignal(5);
      
      return html`<div>${count}</div>`;
    }

    const result = Counter();
    assert.strictEqual(result.textContent, '5');
  });

  await t.test('store properties always wrapped', () => {
    function UserCard() {
      const [user, setUser] = createStore({ name: 'John', age: 25 });
      
      return html`<div>${() => user.name} is ${() => user.age}</div>`;
    }

    const result = UserCard();
    assert.strictEqual(result.textContent, 'John is 25');
  });

  await t.test('signal properties manual wrap', () => {
    function UserProfile() {
      const [user, setUser] = createSignal({ name: 'Jane', email: 'jane@test.com' });
      
      return html`<div>${() => user().name}: ${() => user().email}</div>`;
    }

    const result = UserProfile();
    assert.strictEqual(result.textContent, 'Jane: jane@test.com');
  });

  await t.test('memos auto-wrapped', () => {
    function Calculator() {
      const [count, setCount] = createSignal(5);
      const doubled = createMemo(() => count() * 2);
      
      return html`<div>${doubled}</div>`;
    }

    const result = Calculator();
    assert.strictEqual(result.textContent, '10');
  });

  await t.test('computations manual wrap', () => {
    function Calculator() {
      const [a, setA] = createSignal(3);
      const [b, setB] = createSignal(4);
      
      return html`<div>${() => a() + b()}</div>`;
    }

    const result = Calculator();
    assert.strictEqual(result.textContent, '7');
  });

  await t.test('props access without destructuring', () => {
    function Button(props) {
      return html`<button class=${() => props.variant}>${() => props.children}</button>`;
    }

    const result = Button({ variant: 'primary', children: 'Click me' });
    assert.strictEqual(result.className, 'primary');
    assert.strictEqual(result.textContent, 'Click me');
  });

  await t.test('dynamic class names', () => {
    function StatusCard() {
      const [isActive, setIsActive] = createSignal(true);
      const [theme, setTheme] = createSignal('dark');
      
      const classes = () => ['card', theme(), isActive() ? 'active' : ''].filter(Boolean).join(' ');
      
      return html`<div class=${classes}>Content</div>`;
    }

    const result = StatusCard();
    assert.strictEqual(result.className, 'card dark active');
  });

  await t.test('classList syntax', () => {
    function ConditionalCard() {
      const [theme, setTheme] = createSignal('dark');
      
      return html`<div classList=${{
        card: true,
        [`theme-${theme()}`]: true
      }}>Content</div>`;
    }

    const result = ConditionalCard();
    assert.strictEqual(result.classList.contains('card'), true);
    assert.strictEqual(result.classList.contains('theme-dark'), true);
  });

  await t.test('control flow - Show', () => {
    function UserGreeting() {
      const [user, setUser] = createSignal({ name: 'Alice' });
      
      return html`
        <${Show} when=${user} fallback=${html`<p>Not logged in</p>`}>
          <p>Welcome ${() => user().name}</p>
        <//>
      `;
    }

    const result = UserGreeting();
    assert(result.textContent.includes('Welcome Alice'));
  });

  await t.test('control flow - For', () => {
    function TodoList() {
      const [todos] = createSignal([
        { id: 1, text: 'Learn SolidJS' },
        { id: 2, text: 'Build app' }
      ]);
      
      return html`
        <ul>
          <${For} each=${todos}>
            ${(todo) => html`<li>${() => todo.text}</li>`}
          <//>
        </ul>
      `;
    }

    const result = TodoList();
    const items = result.querySelectorAll('li');
    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].textContent, 'Learn SolidJS');
    assert.strictEqual(items[1].textContent, 'Build app');
  });

  await t.test('event handlers with parameters', () => {
    let clickCount = 0;
    let lastEvent = null;
    
    function ClickButton() {
      const handleClick = (e) => {
        clickCount++;
        lastEvent = e;
      };
      
      return html`<button onClick=${handleClick}>Click me</button>`;
    }

    const result = ClickButton();
    const event = new MouseEvent('click');
    result.dispatchEvent(event);
    
    assert.strictEqual(clickCount, 1);
    assert.ok(lastEvent);
  });

  await t.test('inline styles', () => {
    function StyledDiv() {
      const [width] = createSignal(100);
      const [color] = createSignal('blue');
      
      return html`
        <div style=${{
          width: () => `${width()}px`,
          height: '50px',
          backgroundColor: color
        }}>
          Styled content
        </div>
      `;
    }

    const result = StyledDiv();
    assert.ok(result.style.width === '100px');
    assert.ok(result.style.height === '50px');
    assert.ok(result.style.backgroundColor === 'blue');
  });

  await t.test('reactive updates', () => {
    function ReactiveCounter() {
      const [count, setCount] = createSignal(0);
      
      const increment = () => setCount(c => c + 1);
      
      return html`
        <div>
          <span class="count">${count}</span>
          <button onClick=${increment}>+</button>
        </div>
      `;
    }

    const result = ReactiveCounter();
    const countSpan = result.querySelector('.count');
    const button = result.querySelector('button');
    
    assert.strictEqual(countSpan.textContent, '0');
    
    // Simulate click
    button.click();
    assert.strictEqual(countSpan.textContent, '1');
    
    // Click again
    button.click();
    assert.strictEqual(countSpan.textContent, '2');
  });

  await t.test('store updates', () => {
    function UserForm() {
      const [user, setUser] = createStore({ 
        name: 'John',
        email: 'john@example.com' 
      });
      
      const updateName = (name) => setUser('name', name);
      
      return html`
        <div>
          <span class="name">${() => user.name}</span>
          <button onClick=${() => updateName('Jane')}>Change Name</button>
        </div>
      `;
    }

    const result = UserForm();
    const nameSpan = result.querySelector('.name');
    const button = result.querySelector('button');
    
    assert.strictEqual(nameSpan.textContent, 'John');
    
    // Simulate click to update
    button.click();
    assert.strictEqual(nameSpan.textContent, 'Jane');
  });
});