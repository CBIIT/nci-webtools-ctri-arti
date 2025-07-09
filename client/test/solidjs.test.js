// Test all patterns from client README.md
import { createSignal, createMemo, createEffect, createResource, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { render } from "solid-js/web";
import html from "solid-js/html";
import { describe, test, expect, waitFor } from "./index.js";

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

describe('SolidJS Effects and Async Reactivity', () => {
  test('createEffect with synchronous operation', () => {
    let effectRan = false;
    let effectValue = null;
    
    function TestComponent() {
      const [count, setCount] = createSignal(5);
      
      createEffect(() => {
        effectRan = true;
        effectValue = count();
      });
      
      return html`<div>${count}</div>`;
    }
    
    const result = TestComponent();
    expect(effectRan).toBe(true);
    expect(effectValue).toBe(5);
    expect(result.textContent).toBe('5');
  });

  test('createEffect with async operation - CRITICAL for understanding branching bug', async () => {
    let effectRan = false;
    let promiseResolved = false;
    let signalUpdated = false;
    
    function TestComponent() {
      const [data, setData] = createSignal(null);
      const [trigger, setTrigger] = createSignal(0);
      
      createEffect(() => {
        const currentTrigger = trigger();
        effectRan = true;
        
        // Simulate async operation like getAlternativeInfo
        Promise.resolve({ value: `data-${currentTrigger}` }).then(result => {
          promiseResolved = true;
          setData(result);
          signalUpdated = true;
        });
      });
      
      // Trigger the effect manually
      setTrigger(1);
      
      return html`<div>${() => data()?.value || 'loading'}</div>`;
    }
    
    const result = TestComponent();
    expect(effectRan).toBe(true);
    expect(result.textContent).toBe('loading'); // Initially shows loading
    
    // Wait for promise to resolve
    await waitFor(() => promiseResolved, 1000);
    expect(promiseResolved).toBe(true);
    expect(signalUpdated).toBe(true);
    
    // Wait for UI to update
    await waitFor(() => result.textContent !== 'loading', 1000);
    expect(result.textContent).toBe('data-1');
  });

  test('async effect with DOM rendering - mimics message component pattern', async () => {
    let getDataCalled = false;
    let setSignalCalled = false;
    
    function AsyncComponent(props) {
      const [info, setInfo] = createSignal(null);
      
      createEffect(() => {
        const messageId = props.message?.id;
        if (props.getData && messageId) {
          getDataCalled = true;
          props.getData(props.index).then(result => {
            setSignalCalled = true;
            setInfo(result);
          });
        }
      });
      
      return html`
        <div>
          <div class="message">${() => props.message.text}</div>
          <div class="info">${() => info()?.status || 'no-info'}</div>
        </div>
      `;
    }
    
    const mockGetData = async (index) => {
      return { status: 'loaded', index };
    };
    
    // Create container and render like the message tests
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    render(() => html`<${AsyncComponent} 
      message=${{ id: 'msg1', text: 'Hello' }}
      index=${0}
      getData=${mockGetData}
    />`, container);
    
    expect(getDataCalled).toBe(true);
    expect(container.textContent).toContain('Hello');
    expect(container.textContent).toContain('no-info'); // Initially no info
    
    // Wait for async operation
    await waitFor(() => setSignalCalled, 1000);
    expect(setSignalCalled).toBe(true);
    
    // Wait for UI update
    await waitFor(() => container.textContent.includes('loaded'), 1000);
    expect(container.textContent).toContain('loaded');
    
    document.body.removeChild(container);
  });

  test('effect dependencies and re-running with async operations', async () => {
    let effectRunCount = 0;
    let asyncCallCount = 0;
    let lastResult = null;
    
    function DependentComponent() {
      const [trigger, setTrigger] = createSignal('initial');
      const [result, setResult] = createSignal(null);
      
      createEffect(() => {
        const currentTrigger = trigger();
        effectRunCount++;
        
        // Simulate async call that depends on trigger
        Promise.resolve(`result-${currentTrigger}-${asyncCallCount++}`).then(data => {
          lastResult = data;
          setResult(data);
        });
      });
      
      return html`
        <div>
          <div class="trigger">${trigger}</div>
          <div class="result">${() => result() || 'pending'}</div>
          <button onClick=${() => setTrigger('updated')}>Update</button>
        </div>
      `;
    }
    
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(() => html`<${DependentComponent} />`, container);
    
    expect(effectRunCount).toBe(1);
    expect(container.textContent).toContain('initial');
    expect(container.textContent).toContain('pending');
    
    // Wait for first async result
    await waitFor(() => container.textContent.includes('result-initial'), 1000);
    expect(container.textContent).toContain('result-initial-0');
    
    // Trigger effect again
    const button = container.querySelector('button');
    button.click();
    
    expect(effectRunCount).toBe(2);
    expect(container.textContent).toContain('updated');
    
    // Wait for second async result
    await waitFor(() => container.textContent.includes('result-updated'), 1000);
    expect(container.textContent).toContain('result-updated-1');
    
    document.body.removeChild(container);
  });

  test('debugging reactivity with Show component and async state', async () => {
    let effectCount = 0;
    let showConditionEvaluations = 0;
    
    function ConditionalComponent() {
      const [isLoading, setIsLoading] = createSignal(true);
      const [data, setData] = createSignal(null);
      
      createEffect(() => {
        effectCount++;
        // Simulate loading data
        Promise.resolve({ content: 'loaded data' }).then(result => {
          setData(result);
          setIsLoading(false);
        });
      });
      
      const hasData = () => {
        showConditionEvaluations++;
        return data() !== null;
      };
      
      return html`
        <div>
          <div class="loading">${() => isLoading() ? 'Loading...' : 'Done'}</div>
          <${Show} when=${hasData} fallback=${html`<div class="empty">No data</div>`}>
            <div class="content">${() => data().content}</div>
          <//>
        </div>
      `;
    }
    
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(() => html`<${ConditionalComponent} />`, container);
    
    expect(effectCount).toBe(1);
    expect(container.textContent).toContain('Loading...');
    expect(container.textContent).toContain('No data');
    expect(showConditionEvaluations).toBeGreaterThan(0);
    
    // Wait for async completion
    await waitFor(() => container.textContent.includes('loaded data'), 1000);
    expect(container.textContent).toContain('Done');
    expect(container.textContent).toContain('loaded data');
    expect(container.textContent).not.toContain('No data');
    
    document.body.removeChild(container);
  });

  test('nested effects and signal updates - complex reactivity scenario', async () => {
    let outerEffectRuns = 0;
    let innerEffectRuns = 0;
    let asyncUpdates = 0;
    
    function NestedComponent() {
      const [parentState, setParentState] = createSignal('initial');
      const [childState, setChildState] = createSignal(null);
      const [finalState, setFinalState] = createSignal(null);
      
      // Outer effect that depends on parentState
      createEffect(() => {
        const parent = parentState();
        outerEffectRuns++;
        
        // Inner async operation
        Promise.resolve(`processed-${parent}`).then(processed => {
          setChildState(processed);
        });
      });
      
      // Separate effect that depends on childState
      createEffect(() => {
        const child = childState();
        if (child) {
          innerEffectRuns++;
          
          // Another async operation
          Promise.resolve(`final-${child}`).then(final => {
            asyncUpdates++;
            setFinalState(final);
          });
        }
      });
      
      return html`
        <div>
          <div class="parent">${parentState}</div>
          <div class="child">${() => childState() || 'no-child'}</div>
          <div class="final">${() => finalState() || 'no-final'}</div>
          <button onClick=${() => setParentState('updated')}>Update</button>
        </div>
      `;
    }
    
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(() => html`<${NestedComponent} />`, container);
    
    expect(outerEffectRuns).toBe(1);
    expect(container.textContent).toContain('initial');
    expect(container.textContent).toContain('no-child');
    expect(container.textContent).toContain('no-final');
    
    // Wait for first cascade to complete
    await waitFor(() => container.textContent.includes('final-processed-initial'), 2000);
    expect(innerEffectRuns).toBe(1);
    expect(asyncUpdates).toBe(1);
    
    // Trigger update
    const button = container.querySelector('button');
    button.click();
    
    expect(outerEffectRuns).toBe(2);
    
    // Wait for second cascade
    await waitFor(() => container.textContent.includes('final-processed-updated'), 2000);
    expect(innerEffectRuns).toBe(2);
    expect(asyncUpdates).toBe(2);
    
    document.body.removeChild(container);
  });

  test('effect cleanup and memory management', () => {
    let cleanupCalled = false;
    let effectCount = 0;
    
    function CleanupComponent() {
      const [active, setActive] = createSignal(true);
      
      createEffect(() => {
        if (active()) {
          effectCount++;
          // Return cleanup function
          return () => {
            cleanupCalled = true;
          };
        }
      });
      
      return html`
        <div>
          <div class="status">${() => active() ? 'active' : 'inactive'}</div>
          <button onClick=${() => setActive(false)}>Deactivate</button>
        </div>
      `;
    }
    
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(() => html`<${CleanupComponent} />`, container);
    
    expect(effectCount).toBe(1);
    expect(cleanupCalled).toBe(false);
    expect(container.textContent).toContain('active');
    
    // Trigger cleanup
    const button = container.querySelector('button');
    button.click();
    
    expect(container.textContent).toContain('inactive');
    expect(cleanupCalled).toBe(true);
    
    document.body.removeChild(container);
  });

  test('understanding message component alternativeInfo reactivity issue', async () => {
    // This test specifically mimics the branching bug scenario
    let getAlternativeInfoCalls = 0;
    let resourceSourceRuns = 0;
    
    function MessageLikeComponent(props) {
      // UPDATED: Using createResource instead of signal+effect
      const [alternativeInfo] = createResource(
        // Source function - runs when dependencies change
        () => {
          const message = props.message;
          const messageId = message?.id;
          resourceSourceRuns++;
          
          console.log(`Resource source run ${resourceSourceRuns}: messageId=${messageId}, role=${message?.role}`);
          
          if (props.getAlternativeInfo && message?.role === 'user' && messageId) {
            return { messageId, index: props.index };
          }
          console.log('Conditions not met for getAlternativeInfo');
          return null;
        },
        // Fetch function - runs when source is non-null and changes
        async (source) => {
          getAlternativeInfoCalls++;
          console.log(`Calling getAlternativeInfo (call ${getAlternativeInfoCalls})`);
          
          try {
            const info = await props.getAlternativeInfo(source.index);
            console.log('Promise resolved with info:', info);
            return info;
          } catch (error) {
            console.error('Promise rejected:', error);
            throw error;
          }
        }
      );
      
      return html`
        <div>
          <div class="message">${() => props.message.role}: ${() => props.message.content}</div>
          <div class="debug">alternativeInfo: ${() => JSON.stringify(alternativeInfo())}</div>
          <div class="resource-state">loading: ${alternativeInfo.loading}, error: ${() => alternativeInfo.error}</div>
          <${Show} when=${() => !alternativeInfo.loading && alternativeInfo() && alternativeInfo().hasAlternatives}>
            <div class="navigation">
              <button class="prev">←</button>
              <span class="counter">${() => alternativeInfo()?.currentIndex + 1}/${() => alternativeInfo()?.totalCount}</span>
              <button class="next">→</button>
            </div>
          <//>
        </div>
      `;
    }
    
    const mockGetAlternativeInfo = async (index) => {
      // Simulate realistic delay
      await new Promise(resolve => setTimeout(resolve, 10));
      return {
        currentIndex: 1,
        totalCount: 3,
        canGoPrev: true,
        canGoNext: true,
        hasAlternatives: true
      };
    };
    
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    render(() => html`<${MessageLikeComponent}
      message=${{ id: 'msg123', role: 'user', content: 'test message' }}
      index=${0}
      getAlternativeInfo=${mockGetAlternativeInfo}
    />`, container);
    
    console.log('=== INITIAL STATE ===');
    console.log('Resource source runs:', resourceSourceRuns);
    console.log('Container HTML:', container.innerHTML);
    console.log('Container text:', container.textContent);
    
    expect(resourceSourceRuns).toBe(1);
    expect(getAlternativeInfoCalls).toBe(1);
    expect(container.textContent).toContain('user: test message');
    expect(container.textContent).toContain('loading: true');
    
    // Wait for resource to load
    await waitFor(() => container.textContent.includes('loading: false'), 1000);
    
    console.log('=== AFTER RESOURCE LOADED ===');
    console.log('getAlternativeInfo calls:', getAlternativeInfoCalls);
    console.log('Container HTML after resource loaded:', container.innerHTML);
    console.log('Container text after resource loaded:', container.textContent);
    
    // CRITICAL TEST: Does the UI actually update with the resource data?
    await waitFor(() => container.textContent.includes('currentIndex'), 1000);
    
    console.log('=== FINAL STATE ===');
    console.log('Final container text:', container.textContent);
    
    // These should pass if reactivity is working correctly
    expect(container.textContent).not.toContain('alternativeInfo: null');
    expect(container.textContent).toContain('2/3'); // currentIndex + 1 = 2, totalCount = 3
    expect(container.querySelector('.navigation')).toBeTruthy();
    expect(container.querySelector('.prev')).toBeTruthy();
    expect(container.querySelector('.next')).toBeTruthy();
    
    document.body.removeChild(container);
  });

  test('isolating the exact reactivity problem in message component', async () => {
    // Simplified test that ONLY focuses on the async effect issue
    let promiseResolved = false;
    let uiUpdated = false;
    
    function MinimalAsyncComponent() {
      const [data, setData] = createSignal(null);
      
      createEffect(() => {
        // Simulate the exact pattern from message.js
        Promise.resolve({ test: 'success' }).then(result => {
          promiseResolved = true;
          console.log('About to call setData with:', result);
          setData(result);
          console.log('setData called, current data():', data());
        });
      });
      
      return html`
        <div>
          <span class="output">${() => data() ? 'HAS_DATA' : 'NO_DATA'}</span>
          <span class="json">${() => JSON.stringify(data())}</span>
        </div>
      `;
    }
    
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(() => html`<${MinimalAsyncComponent} />`, container);
    
    console.log('Initial text:', container.textContent);
    expect(container.textContent).toContain('NO_DATA');
    expect(container.textContent).toContain('null');
    
    // Wait for promise
    await waitFor(() => promiseResolved, 1000);
    expect(promiseResolved).toBe(true);
    
    // Wait for UI update
    await waitFor(() => {
      const hasData = container.textContent.includes('HAS_DATA');
      if (hasData) uiUpdated = true;
      return hasData;
    }, 1000);
    
    console.log('Final text:', container.textContent);
    expect(uiUpdated).toBe(true);
    expect(container.textContent).toContain('HAS_DATA');
    expect(container.textContent).toContain('{"test":"success"}');
    
    document.body.removeChild(container);
  });
});