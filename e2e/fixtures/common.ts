// Fake chat page plumbing: records what the "site" sent so tests can assert on it.
declare global {
  interface Window { __sent: string[]; __uploads: string[]; __dropped: string[]; __ready: boolean }
}

export function setupPage(read: () => string, clear: () => void): () => void {
  window.__sent = [];
  window.__uploads = [];
  const log = document.getElementById('sent')!;
  const send = () => {
    const text = read();
    if (!text.trim()) return;
    window.__sent.push(text);
    // Poe's transcript class, so the Poe adapter's message selector (restore mode) matches.
    log.append(Object.assign(document.createElement('li'), { textContent: text, className: 'Message_messageTextContainer__x' }));
    clear();
  };
  document.getElementById('send')!.addEventListener('click', send);
  const file = document.querySelector<HTMLInputElement>('input[type=file]');
  file?.addEventListener('change', async () => {
    for (const f of file.files ?? []) window.__uploads.push(await f.text());
  });
  window.__dropped = [];
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    for (const f of e.dataTransfer?.files ?? []) window.__dropped.push(await f.text());
  });
  window.__ready = true;
  return send;
}
