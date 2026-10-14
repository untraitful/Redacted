import { setupPage } from './common';

// An editor that rejects outside writes, like a framework re-rendering from its own model:
// any DOM change it didn't make itself (paste, execCommand, typing) is reverted on `input`.
// Note: Chrome's execCommand('insertText') does not fire `beforeinput`, so cancelling that isn't enough.
declare global {
  interface Window { __setModel(text: string): void }
}
const ed = document.getElementById('editor')!;
let model = '';
const render = () => (ed.textContent = model);
window.__setModel = (text) => {
  model = text;
  render();
};
ed.addEventListener('paste', (e) => e.preventDefault());
ed.addEventListener('input', render);
const send = setupPage(() => model, () => window.__setModel(''));
ed.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
