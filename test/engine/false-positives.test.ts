import { describe, expect, it } from 'vitest';
import { engineDefault } from './helpers';

// Each line must produce zero findings with default settings.
const corpus: Array<[string, string]> = [
  ['git SHA', 'commit 3f786850e387550fdab836ed7e6dc881de23001b'],
  ['short SHA', 'fixed in a1b2c3d, see 9fceb02'],
  ['SHA-256 checksum', 'sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['SHA-256 near "key"', 'key fingerprint e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['UUID', 'request id: 550e8400-e29b-41d4-a716-446655440000'],
  ['UUID near token', 'token id 550e8400-e29b-41d4-a716-446655440000'],
  ['semver', 'upgrade to 1.12.3-beta.2 or 2.0.0'],
  ['4-part version (Chrome)', 'Chrome 120.0.6099.109 on Windows 10.0.19045.3803'],
  ['4-part version (prefixed)', 'version 4.2.1.0 and v1.2.3.4'],
  ['ISO dates', 'created 2024-01-15T10:30:00Z, updated 2024-02-01 08:00:00'],
  ['base64 data URI', 'src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="'],
  ['CSS hex colors', '.a { color: #ff00aa; background: #1e1e1e; border-color: #ABCDEF }'],
  ['unix path', '/usr/local/lib/node_modules/typescript/bin/tsc'],
  ['windows path', 'C:\\Users\\dev\\AppData\\Local\\Temp\\build_output.log'],
  ['long identifier near token', 'call getUserAuthenticationTokenFromRequestContext() first'],
  ['example.com email', 'contact admin@example.com or test@sub.example.org'],
  ['asset filename', 'icon@2x.png and logo@3x.webp'],
  ['LAN IP', 'ssh pi@192.168.1.10 and 10.0.0.5'],
  ['localhost', 'http://127.0.0.1:8080/health and localhost:3000'],
  ['netmask', 'netmask 255.255.255.0'],
  ['non-Luhn 16 digits', 'order number 4111 1111 1111 1112'],
  ['timestamp', 'ts=1700000000000'],
  ['prose: reset password', 'Please reset your password: it expired last week.'],
  ['prose: never share', 'Never share your API key or token with anyone, and rotate passwords often.'],
  ['prose: bearer', 'He was the bearer of bad news about the token rotation.'],
  ['prose: authorization', 'Authorization: required for admin endpoints'],
  ['TS type annotation', 'interface User { password: string; token?: string }'],
  ['Python Optional', 'token: Optional[str] = None'],
  ['process.env', 'const token = process.env.API_TOKEN;'],
  ['os.environ', 'password = os.environ["DB_PASSWORD"]'],
  ['function call', 'const apiKey = getApiKey();'],
  ['zod schema', 'password: z.string().min(8)'],
  ['shell var', 'password: ${DB_PASSWORD}'],
  ['template var', 'api_key: {{ api_key }}'],
  ['angle placeholder', 'API_KEY=<your-api-key>'],
  ['your-key placeholder', 'OPENAI_API_KEY=your_api_key_here'],
  ['masked', 'password: "********"'],
  ['boolean', 'remember_password: true'],
  ['URL key', 'token_url: https://oauth2.googleapis.com/token'],
  ['length config', 'password_min_length: 12'],
  ['max_tokens', '{"max_tokens": 4096, "prompt_tokens": 12}'],
  ['sort key', 'sort_key: created_at'],
  ['public key / cert', '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----'],
  ['docker port', 'docker run -p 8080:80 nginx:1.25.3'],
  ['npm package', 'npm install @types/node@20.11.5'],
  ['times', 'meeting at 10:30:45, then 14:00'],
];

describe('false-positive corpus', () => {
  const engine = engineDefault();
  it('has at least 30 cases', () => expect(corpus.length).toBeGreaterThanOrEqual(30));
  it.each(corpus)('%s', (_name, text) => {
    expect(engine.scan(text).map((f) => `${f.detectorId}: ${f.value}`)).toEqual([]);
  });
});
