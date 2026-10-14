import { setupPage } from './common';

const ta = document.querySelector('textarea')!;
const send = setupPage(() => ta.value, () => (ta.value = ''));
ta.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send();
  }
});
