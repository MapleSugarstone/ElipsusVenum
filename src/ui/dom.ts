type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

/** Creates an element. `class`, `style` (string or object), `on<event>` handlers, and plain attributes are supported. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function toast(root: HTMLElement, text: string): void {
  const t = h('div', { class: 'toast' }, text);
  root.append(t);
  setTimeout(() => t.remove(), 2300);
}

export function banner(root: HTMLElement, text: string, color?: string): void {
  const b = h('div', { class: 'banner', style: color ? { color } : undefined }, text);
  root.append(b);
  setTimeout(() => b.remove(), 1700);
}

export function floatNum(root: HTMLElement, x: number, y: number, text: string, kind = ''): void {
  const n = h('div', { class: `float-num ${kind}`, style: { left: `${x}px`, top: `${y}px` } }, text);
  root.append(n);
  setTimeout(() => n.remove(), 850);
}
