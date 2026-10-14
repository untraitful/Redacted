import { baseKeymap, chainCommands, createParagraphNear, newlineInCode } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { schema } from 'prosemirror-schema-basic';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { setupPage } from './common';

const read = () => view.state.doc.textBetween(0, view.state.doc.content.size, '\n');
const clear = () => view.dispatch(view.state.tr.delete(0, view.state.doc.content.size));
const view = new EditorView(document.getElementById('editor')!, {
  state: EditorState.create({
    schema,
    plugins: [
      keymap({ Enter: () => (send(), true), 'Shift-Enter': chainCommands(newlineInCode, createParagraphNear, baseKeymap.Enter!) }),
      keymap(baseKeymap),
    ],
  }),
});
const send = setupPage(read, clear);
