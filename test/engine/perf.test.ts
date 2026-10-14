import { describe, expect, it } from 'vitest';
import { URLSAFE, engineAll, fake } from './helpers';

const time = (fn: () => void) => {
  const t = performance.now();
  fn();
  return performance.now() - t;
};

describe('performance', () => {
  const engine = engineAll();

  it('1 MB of mixed text in under 2 s', () => {
    const chunk = [
      'Lorem ipsum dolor sit amet, the password policy says rotate tokens often. ',
      'const config = { host: "db.acme.io", port: 5432, retries: 3 };\n',
      `OPENAI_API_KEY=sk-proj-${fake(80, URLSAFE)}\n`,
      'commit 3f786850e387550fdab836ed7e6dc881de23001b 2024-01-15T10:30:00Z\n',
      `{"id":"550e8400-e29b-41d4-a716-446655440000","token":"${fake(32)}"}\n`,
      'mail jane@acme.io from 8.8.4.4 card 4111 1111 1111 1111\n',
    ].join('');
    const text = chunk.repeat(Math.ceil(1_000_000 / chunk.length)).slice(0, 1_000_000);
    let n = 0;
    const ms = time(() => (n = engine.scan(text).length));
    expect(n).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(2000);
  });
});

describe('ReDoS', () => {
  const engine = engineAll();
  const inputs: Array<[string, string]> = [
    ['50k chars after password=', 'password=' + 'a'.repeat(50_000)],
    ['50k mixed after password=', 'password=' + 'aB1'.repeat(17_000)],
    ['unterminated key headers', '-----BEGIN RSA PRIVATE KEY-----\n'.repeat(2_000)],
    ['BEGIN with a long label', '-----BEGIN ' + 'A '.repeat(30_000)],
    ['a: x30k', 'a:'.repeat(30_000)],
    ['a= x30k', 'a='.repeat(30_000)],
    ['key: x10k', 'key: '.repeat(10_000)],
    ['sk- x20k', 'sk-'.repeat(20_000)],
    ['digits and spaces', '1 '.repeat(30_000)],
    ['digits and dashes', '1-'.repeat(30_000)],
    ['dotted digits', '1.'.repeat(30_000)],
    ['colons and hex', 'a:'.repeat(15_000) + ':' + 'f:'.repeat(15_000)],
    ['scheme with no host', 'postgres://' + 'a'.repeat(50_000)],
    ['scheme with colon, no @', 'postgres://u:' + 'p'.repeat(50_000)],
    ['eyJ repeated', 'eyJ'.repeat(20_000)],
    ['eyJ.eyJ unterminated', ('eyJ' + 'a'.repeat(20) + '.').repeat(3_000)],
    ['@ repeated', 'a@'.repeat(30_000)],
    ['quotes after key', 'token="' + '\\'.repeat(50_000)],
    ['authorization no value', 'Authorization: '.repeat(5_000)],
    ['query params', '?token='.repeat(10_000)],
    ['long base64 run', 'A'.repeat(100_000)],
    ['long word run', 'secret '.repeat(15_000)],
  ];

  it.each(inputs)('%s', (_name, text) => {
    expect(time(() => engine.scan(text))).toBeLessThan(1000);
  });
});
