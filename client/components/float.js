import { createSignal, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import html from 'solid-js/html';
import { computePosition, autoUpdate, flip, shift } from '@floating-ui/dom';

export default function Float(props) {
  const [targetRef, setTargetRef] = createSignal(null);
  const [floatingRef, setFloatingRef] = createSignal(null);
  const [position, setPosition] = createSignal({ x: 0, y: 0 });

  createEffect(() => {
    const targetEl = targetRef();
    const floatingEl = floatingRef();
    if (!targetEl || !floatingEl) return;
    const placement = props.placement || 'top';
    const middleware = props.middleware || [flip(), shift()];
    const options = { placement, middleware };
    const update = async () => setPosition(await computePosition(targetEl, floatingEl, options));
    const cleanup = autoUpdate(targetEl, floatingEl, update);
    onCleanup(cleanup);
  });

  return html`
    <span ref=${setTargetRef}>
      ${props.children}
    </span>
    <${Portal}>
      <div 
        ref=${setFloatingRef} 
        class="position-absolute z-5"
        style=${() => ({
          left: position().x + "px",
          top: position().y + "px",
        })}>
        ${props.content}
      </div>
    <//>
  `;
}
