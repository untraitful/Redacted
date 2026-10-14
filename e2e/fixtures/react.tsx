import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { setupPage } from './common';

// Controlled textarea: React ignores DOM changes it didn't see through onChange.
let current = '';
let reset: () => void = () => {};
function App() {
  const [value, setValue] = useState('');
  current = value;
  reset = () => setValue('');
  return (
    <>
      <textarea
        aria-label="Message"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div id="state">{value}</div>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
const send = setupPage(() => current, () => reset());
