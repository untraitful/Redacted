import Quill from 'quill';
import { setupPage } from './common';

const quill = new Quill('#editor', {
  modules: { keyboard: { bindings: { send: { key: 'Enter', shiftKey: false, handler: () => (send(), false) } } } },
});
const send = setupPage(() => quill.getText().replace(/\n$/, ''), () => quill.setText(''));
