import { onCleanup, createSignal } from "solid-js";
import html from "solid-js/html";

export default function CountUp() {
  const [count, setCount] = createSignal(0);
  const decrement = () => setCount(count() - 1);
  const doubleCount = () => count() * 2;
  const interval = setInterval(() => setCount((count) => count + 1), 1000);
  onCleanup(() => clearInterval(interval));
  return html`<div>Count value is <button onClick=${decrement}>${count}</button> &times; 2 = ${doubleCount}</div>`;
}