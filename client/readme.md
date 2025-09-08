# ARTI Platform Architecture & Development

## Project Structure

ARTI is a conversational AI platform for biomedical research. Frontend uses SolidJS with no build step - just ES6 modules and CDN dependencies.

```
client/
├── components/          # UI components (modal, table, etc.)
├── pages/              # Route components
│   └── tools/chat/     # Main chat interface
├── models/             # IndexedDB wrappers, embedding models
├── utils/              # File handling, vector search (HNSW)
├── test/               # Custom test framework + tests
├── assets/             # Static files
└── index.html          # Entry point with import maps
```

## Chat System

The chat interface (`pages/tools/chat/`) handles:

- Conversation persistence (IndexedDB)
- File uploads (PDF, images, docs)
- Streaming AI responses
- Tool calling for research tasks

Key files:

- `index.js` - Main UI component
- `hooks.js` - State management and API calls
- `message.js` - Message rendering
- `config.js` - AI model settings

### Client-Side ML

- **Vector Search**: Custom HNSW implementation in `utils/hnsw.js`
- **Embeddings**: Hugging Face Transformers.js for local text vectorization
- **Storage**: IndexedDB for user-isolated conversation data

### Development

**Key patterns:**

- Components use SolidJS tagged templates (`html` from `solid-js/html`)
- State with `createSignal`/`createStore`
- No bundler - dependencies via import maps in `index.html`
- Tests run in real browser environment

### Architecture Notes

- **Buildless**: No webpack/vite, just ES modules
- **CDN deps**: Import maps for external libraries
- **Client-heavy**: ML processing happens locally for privacy
- **Reactive**: SolidJS for efficient UI updates

---

# SolidJS Development Guide

A comprehensive guide for developing with SolidJS using tagged template literals (buildless approach) in the ARTI platform.

## Quick Reference

### Template Syntax Rules

- **Signals**: `${signal}` (auto-wrapped)
- **Store Properties**: `${() => store.property}` (always wrap)
- **Signal Properties**: `${() => signal().property}` (manual wrap)
- **Memos**: `${memo}` (auto-wrapped)
- **Computations**: `${() => calculation()}` (manual wrap)
- **Event Handlers**: `onClick=${e => handler(e)}` (1+ args, not wrapped)

## COMMON MISTAKES TO AVOID

| Mistake                                | Wrong                                   | Correct                                                      | Why                                                                                                      |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Signal Usage**                       | `${signal()}`                           | `${signal}` or `${() => signal()}`                           | Calling `signal()` immediately breaks reactivity. SolidJS needs the function reference to track changes. |
| **String Interpolation in Attributes** | `<div class="base ${props.className}">` | `<div class=${() => ["base", props.className].join(" ")}>`   | Template literals inside attributes don't work. Use a function that returns the complete string.         |
| **Alternative: classList**             | `<div class="base ${props.className}">` | `<div classList=${{ base: true, [props.className]: true }}>` | classList syntax handles conditional classes reactively and is more maintainable.                        |
| **Store Properties**                   | `${store.property}`                     | `${() => store.property}`                                    | Store properties return values, not functions. Wrap them so SolidJS can track changes.                   |
| **Props Destructuring**                | `function Component({ name, age })`     | `function Component(props)` then `${() => props.name}`       | Destructuring breaks reactivity by extracting values at creation time. Access via props object.          |
| **Signal Properties**                  | `${user().name}`                        | `${() => user().name}`                                       | Accessing properties of signal values needs manual wrapping for reactivity tracking.                     |
| **Event Handlers**                     | `onClick=${() => handler()}`            | `onClick=${e => handler(e)}` or `onClick=${handler}`         | Zero-argument functions get auto-wrapped, breaking event handling. Include event parameter.              |
| **JSX Syntax**                         | `<Component prop={value} />`            | `<${Component} prop=${value} />`                             | This is HTML template syntax, not JSX. Components need `${}` interpolation.                              |
| **Component Closing**                  | `<${Component}></${Component}>`         | `<${Component} />` or `<${Component}>children<//>`           | Use self-closing syntax or SolidJS's `<//>` closing tag, not JSX-style closing.                          |

### Key Concepts

- Functions with 0 arguments are auto-wrapped for reactivity
- Store properties return values, not functions - always wrap them
- Don't destructure props - breaks reactivity
- Use `createSignal` for simple state, `createStore` for complex objects

## Table of Contents

- [Setup & Import Maps](#setup--import-maps)
- [Reactivity Fundamentals](#reactivity-fundamentals)
- [Component Basics](#component-basics)
- [State Management](#state-management)
- [Control Flow](#control-flow)
- [Event Handling](#event-handling)
- [Styling](#styling)
- [Data Fetching](#data-fetching)
- [Best Practices](#best-practices)

## Setup & Import Maps

Dependencies are loaded via import maps in HTML:

```html
<script type="importmap">
  {
    "imports": {
      "solid-js": "https://cdn.jsdelivr.net/npm/solid-js@1.9.7/dist/solid.min.js",
      "solid-js/html": "https://cdn.jsdelivr.net/npm/solid-js@1.9.7/html/dist/html.min.js",
      "solid-js/store": "https://cdn.jsdelivr.net/npm/solid-js@1.9.7/store/dist/store.min.js",
      "solid-js/web": "https://cdn.jsdelivr.net/npm/solid-js@1.9.7/web/dist/web.min.js"
    }
  }
</script>
```

Import in components:

```js
import { createSignal, createMemo, createEffect, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import html from "solid-js/html";
```

## Reactivity Fundamentals

### Function Auto-Wrapping

SolidJS automatically wraps functions with 0 arguments in reactive effects:

```js
const [count, setCount] = createSignal(0);
const [user, setUser] = createSignal({ name: "John" });

// Auto-wrapped (0 arguments)
html`<div>${count}</div>`; // Works - signal getter
html`<div>${() => count() * 2}</div>`; // Works - computation

// Manual wrapping needed
html`<div>${() => user().name}</div>`; // Required - accessing property
html`<button onClick=${(e) => handler(e)}></button>`; // Required - event handler (1+ args)
```

### Signals

Basic reactive state:

```js
function Counter() {
  const [count, setCount] = createSignal(0);

  const increment = () => setCount(count() + 1);
  const decrement = () => setCount((prev) => prev - 1);

  return html`
    <div>
      <p>Count: ${count}</p>
      <button onClick=${increment}>+</button>
      <button onClick=${decrement}>-</button>
    </div>
  `;
}
```

### Stores - CRITICAL REACTIVITY RULES

**Store properties are NOT reactive with direct access. Always wrap them:**

```js
function StoreExample() {
  const [store, setStore] = createStore({
    name: "John",
    todos: [{ text: "Buy milk", done: false }],
  });

  return html`
    <div>
      <!-- CORRECT: Store properties must be wrapped -->
      <p>Name: ${() => store.name}</p>
      <p>First todo: ${() => store.todos[0].text}</p>

      <!-- WRONG: Direct access is not reactive -->
      <!-- <p>Name: ${store.name}</p> -->
    </div>
  `;
}
```

**Why:** Store properties return actual values (strings, numbers), not functions. The template system needs functions for reactivity tracking.

### Memos

Cached computations:

```js
function ExpensiveComponent() {
  const [data, setData] = createSignal([]);

  const processedData = createMemo(() => {
    return data().map((item) => ({ ...item, processed: true }));
  });

  return html`<div>Items: ${() => processedData().length}</div>`;
}
```

### Effects

Side effects:

```js
function DocumentTitle() {
  const [title, setTitle] = createSignal("Default");

  createEffect(() => {
    document.title = title();
  });

  return html` <input onInput=${(e) => setTitle(e.target.value)} /> `;
}
```

## Component Basics

### Basic Component

```js
export default function MyComponent() {
  return html`
    <div class="my-component">
      <h1>Hello World</h1>
    </div>
  `;
}
```

### Components with Props

```js
export default function Button(props) {
  const buttonClass = () => `btn ${props.variant || "primary"}`;

  return html`
    <button class=${buttonClass} onClick=${(e) => props.onClick?.(e)}>
      ${() => props.children}
    </button>
  `;
}
```

**Important:** Never destructure props - it breaks reactivity. Use `props.property` instead.

### Props Utilities

```js
import { mergeProps, splitProps } from "solid-js";

function Component(props) {
  // Set defaults while maintaining reactivity
  const merged = mergeProps({ variant: "primary" }, props);

  // Split props by category
  const [buttonProps, otherProps] = splitProps(props, ["onClick", "disabled"]);

  return html` <button ...${buttonProps}>${() => merged.children}</button> `;
}
```

## State Management

### Decision Tree: When to Use What

```
Template Expression:
├── Store property? → ${() => store.property} (always wrap)
├── Signal? → ${signal} (auto-wrapped)
├── Memo? → ${memo} (auto-wrapped)
├── Computation? → ${() => calculation()} (manual wrap)
└── Static value? → ${value} (direct)
```

### Local State with Signals

```js
function TodoForm() {
  const [todo, setTodo] = createSignal("");
  const [todos, setTodos] = createSignal([]);

  const addTodo = () => {
    if (todo().trim()) {
      setTodos((prev) => [...prev, { id: Date.now(), text: todo() }]);
      setTodo("");
    }
  };

  return html`
    <form
      onSubmit=${(e) => {
        e.preventDefault();
        addTodo();
      }}
    >
      <input value=${todo} onInput=${(e) => setTodo(e.target.value)} />
      <button type="submit">Add</button>
    </form>
  `;
}
```

### Complex State with Stores

```js
import { createStore, produce } from "solid-js/store";

function TodoApp() {
  const [todos, setTodos] = createStore([]);

  const addTodo = (text) => {
    setTodos(
      produce((d) =>
        d.push({
          id: Date.now(),
          text,
          completed: false,
        })
      )
    );
  };

  const toggleTodo = (id) => {
    setTodos(
      produce((d) => {
        const todo = d.find((t) => t.id === id);
        if (todo) todo.completed = !todo.completed;
      })
    );
  };

  return html`
    <div>
      <${For} each=${() => todos}>
        ${(todo) => html`
          <div>
            <input
              type="checkbox"
              checked=${() => todo.completed}
              onChange=${() => toggleTodo(todo.id)}
            />
            ${() => todo.text}
          </div>
        `}
      <//>
    </div>
  `;
}
```

### Context for Global State

```js
import { createContext, useContext } from "solid-js";

const ThemeContext = createContext();

function ThemeProvider(props) {
  const [mode, setMode] = createSignal("light");
  const toggle = () => setMode((m) => (m === "light" ? "dark" : "light"));

  return html` <${ThemeContext.Provider} value=${{ mode, toggle }}> ${() => props.children} <//> `;
}

function ThemeSwitch() {
  const theme = useContext(ThemeContext);

  return html`
    <button onClick=${theme.toggle}>${() => (theme.mode() === "light" ? "🌙" : "☀️")}</button>
  `;
}
```

## Control Flow

### Conditional Rendering

```js
import { Show } from "solid-js";

function UserGreeting() {
  const [user, setUser] = createSignal(null);

  return html`
    <${Show} when=${user} fallback=${html`<p>Please log in</p>`}>
      <p>Welcome, ${() => user().name}!</p>
    <//>
  `;
}
```

### Multiple Conditions

```js
import { Switch, Match } from "solid-js";

function StatusDisplay() {
  const [status, setStatus] = createSignal("loading");

  return html`
    <${Switch} fallback=${html`<p>Unknown status</p>`}>
      <${Match} when=${() => status() === "loading"}>
        <div>Loading...</div>
      <//>
      <${Match} when=${() => status() === "error"}>
        <div>Error occurred</div>
      <//>
      <${Match} when=${() => status() === "success"}>
        <div>Success!</div>
      <//>
    <//>
  `;
}
```

### List Rendering

```js
import { For, Index } from "solid-js";

// Use For when items have stable identity
function TodoList() {
  const [todos, setTodos] = createSignal([
    { id: 1, text: "Learn SolidJS" },
    { id: 2, text: "Build app" },
  ]);

  return html`
    <ul>
      <${For} each=${todos}> ${(todo, index) => html` <li>${() => todo.text}</li> `} <//>
    </ul>
  `;
}

// Use Index when order matters more than identity
function NumberList() {
  const [numbers, setNumbers] = createSignal([1, 2, 3]);

  return html`
    <ul>
      <${Index} each=${numbers}>
        ${(number, index) => html` <li>Position ${() => index()}: ${() => number()}</li> `}
      <//>
    </ul>
  `;
}
```

### Error Boundaries

```js
import { ErrorBoundary } from "solid-js";

function App() {
  return html`
    <${ErrorBoundary}
      fallback=${(error, reset) => html`
        <div class="alert alert-danger">
          <h3>Something went wrong</h3>
          <p>${error.message}</p>
          <button onClick=${reset}>Try Again</button>
        </div>
      `}
    >
      <${RiskyComponent} />
    <//>
  `;
}
```

## Event Handling

### Basic Events

```js
function EventExample() {
  const [message, setMessage] = createSignal("");

  const handleClick = (e) => {
    setMessage("Button clicked!");
  };

  const handleInput = (e) => {
    setMessage(e.target.value);
  };

  return html`
    <div>
      <button onClick=${handleClick}>Click me</button>
      <input onInput=${handleInput} />
      <p>${message}</p>
    </div>
  `;
}
```

### Form Handling

```js
function ContactForm() {
  const [formData, setFormData] = createStore({
    name: "",
    email: "",
    message: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      setFormData({ name: "", email: "", message: "" });
    }
  };

  return html`
    <form onSubmit=${handleSubmit}>
      <input
        value=${() => formData.name}
        onInput=${(e) => setFormData("name", e.target.value)}
        placeholder="Name"
      />
      <input
        type="email"
        value=${() => formData.email}
        onInput=${(e) => setFormData("email", e.target.value)}
        placeholder="Email"
      />
      <textarea
        value=${() => formData.message}
        onInput=${(e) => setFormData("message", e.target.value)}
        placeholder="Message"
      ></textarea>
      <button type="submit">Send</button>
    </form>
  `;
}
```

## Styling

### Dynamic Classes

```js
function StyledComponent() {
  const [isActive, setIsActive] = createSignal(false);
  const [theme, setTheme] = createSignal("light");

  const componentClass = () => `component ${theme()} ${isActive() ? "active" : ""}`;

  return html` <div class=${componentClass}>Content</div> `;
}
```

### Conditional Classes with classList

```js
function ConditionalClasses() {
  const [isLoading, setIsLoading] = createSignal(false);
  const [hasError, setHasError] = createSignal(false);

  return html`
    <button
      classList=${{
        btn: true,
        "btn-primary": () => !hasError(),
        "btn-danger": hasError,
        loading: isLoading,
      }}
    >
      Submit
    </button>
  `;
}
```

### Inline Styles

```js
function InlineStyles() {
  const [width, setWidth] = createSignal(100);
  const [color, setColor] = createSignal("blue");

  return html`
    <div
      style=${{
        width: () => `${width()}px`,
        height: "50px",
        "background-color": color,
      }}
    >
      Styled content
    </div>
  `;
}
```

## Data Fetching

### Basic Resource

```js
import { createResource, Suspense } from "solid-js";

function UserProfile() {
  const [userId, setUserId] = createSignal(1);

  const [user] = createResource(userId, async (id) => {
    const response = await fetch(`/api/users/${id}`);
    return response.json();
  });

  return html`
    <${Suspense} fallback=${html`<div>Loading...</div>`}>
      <${Show} when=${user}>
        <div>
          <h2>${() => user().name}</h2>
          <p>${() => user().email}</p>
        </div>
      <//>
    <//>
  `;
}
```

### Resource with Error Handling

```js
function DataComponent() {
  const [data, { mutate, refetch }] = createResource(async () => {
    const response = await fetch("/api/data");
    if (!response.ok) throw new Error("Failed to fetch");
    return response.json();
  });

  return html`
    <div>
      <button onClick=${refetch}>Refresh</button>

      <${Suspense} fallback=${html`<div>Loading...</div>`}>
        <${Show}
          when=${() => !data.error}
          fallback=${html`<div>Error: ${() => data.error?.message}</div>`}
        >
          <${For} each=${data}> ${(item) => html`<div>${() => item.name}</div>`} <//>
        <//>
      <//>
    </div>
  `;
}
```

## Best Practices

### Component Organization

```js
import { createResource, Suspense, ErrorBoundary, For } from "solid-js";

// Good: Single responsibility
function UserCard(props) {
  return html`
    <div class="card">
      <img src=${() => props.user.avatar} alt="Avatar" />
      <h3>${() => props.user.name}</h3>
      <p>${() => props.user.email}</p>
    </div>
  `;
}

// Good: Use createResource for data fetching
function UserList() {
  const [users] = createResource(async () => {
    const response = await fetch("/api/users");
    if (!response.ok) throw new Error(`Failed to fetch users: ${response.status}`);
    return response.json();
  });

  return html`
    <${ErrorBoundary}
      fallback=${(error, reset) => html`
        <div class="alert alert-danger">
          <h4>Error loading users</h4>
          <p>${error.message}</p>
          <button onClick=${reset}>Try Again</button>
        </div>
      `}
    >
      <${Suspense} fallback=${html`<div class="loading">Loading users...</div>`}>
        <div class="user-list">
          <${For} each=${users}> ${(user) => html`<${UserCard} user=${user} />`} <//>
        </div>
      <//>
    <//>
  `;
}
```

### Error Handling

```js
import { ErrorBoundary, Suspense, createResource } from "solid-js";

function DataComponent() {
  const [data, { refetch }] = createResource(async () => {
    const response = await fetch("/api/data");
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
    return response.json();
  });

  const onReset = async (e, callback) => {
    await refetch();
    callback?.();
  };

  return html`
    <${ErrorBoundary}
      fallback=${(err, reset) => html`
        <div class="alert alert-danger">
          <h4>Error: ${err.message}</h4>
          <button onClick=${(e) => onReset(e, reset)}>Clear Error</button>
        </div>
      `}
    >
      <${Suspense} fallback=${html`<div>Loading...</div>`}>
        <div>
          <h3>Data loaded successfully!</h3>
          <pre>${() => JSON.stringify(data(), null, 2)}</pre>
          <button onClick=${refetch}>Refresh Data</button>
        </div>
      <//>
    <//>
  `;
}
```

### Performance Tips

```js
import { batch, untrack } from "solid-js";

function OptimizedComponent() {
  const [firstName, setFirstName] = createSignal("John");
  const [lastName, setLastName] = createSignal("Doe");

  // Batch multiple updates
  const updateUser = (userData) => {
    batch(() => {
      setFirstName(userData.firstName);
      setLastName(userData.lastName);
    });
  };

  // Prevent tracking in specific cases
  createEffect(() => {
    const name = firstName(); // This creates dependency
    const untracked = untrack(() => lastName()); // This doesn't
    console.log(`Effect: ${name}, ${untracked}`);
  });

  return html`<div>Performance optimized</div>`;
}
```

### Common Mistakes

1. **Don't destructure props**:

```js
// Wrong
function Component({ name, age }) {
  return html`<div>${name} is ${age}</div>`;
}

// Correct
function Component(props) {
  return html`<div>${() => props.name} is ${() => props.age}</div>`;
}
```

2. **Store properties need wrapping**:

```js
const [store, setStore] = createStore({ name: "John" });

// Wrong
html`<div>${store.name}</div>`;

// Correct
html`<div>${() => store.name}</div>`;
```

3. **Event handlers need parameters**:

```js
// Wrong - gets auto-wrapped
html`<button onClick=${() => handleClick()}>Click</button>`;

// Correct - explicit parameter
html`<button onClick=${(e) => handleClick(e)}>Click</button>`;
```

### File Organization

```
client/
├── components/
│   ├── ui/              # Reusable components
│   ├── layout/          # Layout components
│   └── domain/          # Feature-specific components
├── pages/               # Route components
├── utils/               # Utility functions
├── stores/              # Global state
└── assets/              # Static assets
```

This guide covers the essential patterns for building SolidJS applications with tagged template literals. The key insight is understanding auto-wrapping behavior and when to use manual wrapping for reactivity.
