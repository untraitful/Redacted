import { describe, expect, it } from 'vitest';
import { DETECTORS } from '../../src/engine';
import { B64, HEX, UPNUM, URLSAFE, engineAll, fake } from './helpers';

const b64url = (s: string) => btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const uuid = () => [8, 4, 4, 4, 12].map((n) => fake(n, HEX)).join('-');
const digits = (n: number) => fake(n, '0123456789').replace(/^0/, '1');

// [detectorId, text, value expected to be found]. One builder per case so values are fresh.
const cases: Array<[string, () => [string, string]]> = [
  ['private_key', () => {
    const k = `-----BEGIN OPENSSH PRIVATE KEY-----\n${fake(70, B64)}\n${fake(70, B64)}\n-----END OPENSSH PRIVATE KEY-----`;
    return [`key:\n${k}\nthanks`, k];
  }],
  ['aws_access_key_id', () => ['id AKIAIOSFODNN7EXAMPLE ok', 'AKIAIOSFODNN7EXAMPLE']],
  ['aws_secret_key', () => ['aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY']],
  ['aws_session_token', () => { const v = 'IQoJb3JpZ2lu' + fake(200, B64); return [`token ${v}`, v]; }],
  ['gcp_api_key', () => { const v = 'AIza' + fake(35, URLSAFE); return [`maps ${v}`, v]; }],
  ['gcp_oauth_secret', () => { const v = 'GOCSPX-' + fake(28, URLSAFE); return [`"client_secret_x" ${v}`, v]; }],
  ['gcp_oauth_token', () => { const v = 'ya29.' + fake(100, URLSAFE); return [`got ${v}`, v]; }],
  ['gcp_refresh_token', () => { const v = '1//0' + fake(60, URLSAFE); return [`refresh ${v}`, v]; }],
  ['azure_storage_key', () => {
    const v = fake(86, B64) + '==';
    return [`DefaultEndpointsProtocol=https;AccountName=acct;AccountKey=${v};EndpointSuffix=core.windows.net`, v];
  }],
  ['azure_client_secret', () => { const v = fake(3) + '8Q~' + fake(34); return [`secret ${v}`, v]; }],
  ['digitalocean_token', () => { const v = 'dop_v1_' + fake(64, HEX); return [v, v]; }],
  ['cloudflare_api_token', () => { const v = fake(40, URLSAFE); return [`CLOUDFLARE_API_TOKEN=${v}`, v]; }],
  ['cloudflare_origin_ca_key', () => { const v = `v1.0-${fake(24, HEX)}-${fake(146, HEX)}`; return [v, v]; }],
  ['heroku_api_key', () => { const v = 'HRKU-' + fake(60); return [`heroku ${v}`, v]; }],
  ['heroku_legacy_key', () => { const v = uuid(); return [`HEROKU_API_KEY: ${v}`, v]; }],
  ['github_token', () => { const v = 'ghp_' + fake(36); return [`git ${v}`, v]; }],
  ['github_fine_grained_token', () => { const v = `github_pat_${fake(22)}_${fake(59)}`; return [v, v]; }],
  ['gitlab_token', () => { const v = 'glpat-' + fake(20); return [`token is ${v}.`, v]; }],
  ['atlassian_token', () => { const v = 'ATATT3' + fake(186, URLSAFE); return [v, v]; }],
  ['npm_token', () => { const v = 'npm_' + fake(36); return [`//registry.npmjs.org/:_authToken=${v}`, v]; }],
  ['pypi_token', () => { const v = 'pypi-AgEIcHlwaS5vcmc' + fake(70, URLSAFE); return [v, v]; }],
  ['docker_token', () => { const v = 'dckr_pat_' + fake(27); return [v, v]; }],
  ['openai_api_key', () => { const v = 'sk-proj-' + fake(150, URLSAFE); return [`use ${v} please`, v]; }],
  ['anthropic_api_key', () => { const v = 'sk-ant-api03-' + fake(93, URLSAFE) + 'AA'; return [v, v]; }],
  ['huggingface_token', () => { const v = 'hf_' + fake(34); return [v, v]; }],
  ['groq_api_key', () => { const v = 'gsk_' + fake(52); return [v, v]; }],
  ['xai_api_key', () => { const v = 'xai-' + fake(80); return [v, v]; }],
  ['replicate_token', () => { const v = 'r8_' + fake(37); return [v, v]; }],
  ['perplexity_api_key', () => { const v = 'pplx-' + fake(48); return [v, v]; }],
  ['stripe_secret_key', () => { const v = 'sk_live_' + fake(99); return [v, v]; }],
  ['stripe_restricted_key', () => { const v = 'rk_live_' + fake(99); return [v, v]; }],
  ['stripe_webhook_secret', () => { const v = 'whsec_' + fake(32); return [v, v]; }],
  ['square_access_token', () => { const v = 'EAAA' + fake(60, URLSAFE); return [v, v]; }],
  ['square_secret', () => { const v = 'sq0csp-' + fake(43, URLSAFE); return [v, v]; }],
  ['shopify_token', () => { const v = 'shpat_' + fake(32, HEX); return [v, v]; }],
  ['slack_token', () => { const v = `xoxb-${digits(12)}-${digits(13)}-${fake(24)}`; return [v, v]; }],
  ['slack_webhook', () => {
    const v = `https://hooks.slack.com/services/T${fake(8, UPNUM)}/B${fake(10, UPNUM)}/${fake(24)}`;
    return [`post to ${v}`, v];
  }],
  ['discord_webhook', () => { const v = `https://discord.com/api/webhooks/${digits(18)}/${fake(68, URLSAFE)}`; return [v, v]; }],
  ['discord_bot_token', () => { const v = `${btoa(digits(18))}.${fake(6, URLSAFE)}.${fake(38, URLSAFE)}`; return [`bot ${v}`, v]; }],
  ['telegram_bot_token', () => { const v = `${digits(9)}:AA${fake(33, URLSAFE)}`; return [v, v]; }],
  ['teams_webhook', () => {
    const v = `https://contoso.webhook.office.com/webhookb2/${uuid()}@${uuid()}/IncomingWebhook/${fake(32, HEX)}/${uuid()}`;
    return [v, v];
  }],
  ['twilio_api_key', () => { const v = 'SK' + fake(32, HEX); return [v, v]; }],
  ['sendgrid_api_key', () => { const v = `SG.${fake(22, URLSAFE)}.${fake(43, URLSAFE)}`; return [v, v]; }],
  ['mailgun_api_key', () => { const v = 'key-' + fake(32, HEX); return [v, v]; }],
  ['notion_token', () => { const v = 'ntn_' + fake(46); return [v, v]; }],
  ['linear_api_key', () => { const v = 'lin_api_' + fake(40); return [v, v]; }],
  ['sentry_token', () => { const v = 'sntryu_' + fake(64, HEX); return [v, v]; }],
  ['datadog_api_key', () => { const v = fake(32, HEX); return [`DD_API_KEY=${v}`, v]; }],
  ['newrelic_key', () => { const v = 'NRAK-' + fake(27, UPNUM); return [v, v]; }],
  ['grafana_token', () => { const v = `glsa_${fake(32)}_${fake(8, HEX)}`; return [v, v]; }],
  ['vault_token', () => { const v = 'hvs.' + fake(90, URLSAFE); return [v, v]; }],
  ['terraform_token', () => { const v = `${fake(14)}.atlasv1.${fake(67, URLSAFE)}`; return [v, v]; }],
  ['tailscale_key', () => { const v = `tskey-auth-${fake(12)}-${fake(32)}`; return [v, v]; }],
  ['supabase_token', () => { const v = 'sbp_' + fake(40, HEX); return [v, v]; }],
  ['jwt', () => {
    const v = `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(`{"sub":"${digits(10)}","name":"x"}`)}.${fake(43, URLSAFE)}`;
    return [`cookie=${v}`, v];
  }],
  ['auth_header', () => { const v = btoa('admin:' + fake(14)); return [`Authorization: Basic ${v}`, v]; }],
  ['bearer_token', () => { const v = fake(40, URLSAFE); return [`send it as Bearer ${v} in the call`, v]; }],
  ['api_key_header', () => { const v = fake(32); return [`curl -H "X-API-Key: ${v}" https://api.acme.io`, v]; }],
  ['uri_password', () => ['postgres://admin:S3cr3t-Pa55@db.internal:5432/app', 'S3cr3t-Pa55']],
  ['url_query_secret', () => { const v = fake(32); return [`https://api.acme.io/v1/data?access_token=${v}&page=2`, v]; }],
  ['assignment', () => ['DB_PASSWORD=hunter2Secret!', 'hunter2Secret!']],
  ['cli_flag', () => ['mysqldump --password=Sup3rS3cret prod', 'Sup3rS3cret']],
  ['high_entropy', () => { const v = 'Xq7' + fake(29); return [`the secret is ${v}`, v]; }],
  ['email', () => ['mail jane.doe@acme-corp.io today', 'jane.doe@acme-corp.io']],
  ['phone', () => ['call +1 415 555 0134 now', '+1 415 555 0134']],
  ['credit_card', () => ['card 4111 1111 1111 1111 exp', '4111 1111 1111 1111']],
  ['us_ssn', () => ['ssn 123-45-6789', '123-45-6789']],
  ['iban', () => ['pay GB82 WEST 1234 5698 7654 32 now', 'GB82 WEST 1234 5698 7654 32']],
  ['public_ipv4', () => ['server at 8.8.8.8 is up', '8.8.8.8']],
  ['private_ipv4', () => ['router 192.168.1.20 ok', '192.168.1.20']],
  ['ipv6', () => ['addr 2001:db8::8a2e:370:7334 ok', '2001:db8::8a2e:370:7334']],
  ['mac_address', () => ['mac 00:1A:2B:3C:4D:5E ok', '00:1A:2B:3C:4D:5E']],
];

describe('detectors: positives', () => {
  const engine = engineAll();

  it('every built-in detector has a positive case', () => {
    const covered = new Set(cases.map(([id]) => id));
    expect(DETECTORS.map((d) => d.id).filter((id) => !covered.has(id))).toEqual([]);
  });

  it.each(cases)('%s', (id, build) => {
    const [text, value] = build();
    const findings = engine.scan(text);
    expect(findings.map((f) => [f.detectorId, f.value])).toContainEqual([id, value]);
  });
});

describe('detectors: details', () => {
  const engine = engineAll();
  const one = (text: string) => engine.scan(text);

  it('legacy OpenAI keys', () => {
    const v = `sk-${fake(20)}T3BlbkFJ${fake(20)}`;
    expect(one(v)[0]).toMatchObject({ detectorId: 'openai_api_key', value: v });
  });

  it('truncated private key with no END line stops at prose', () => {
    const body = `${fake(64, B64)}\n${fake(64, B64)}`;
    const text = `-----BEGIN RSA PRIVATE KEY-----\n${body}\nI cut it off here`;
    const [f] = one(text);
    expect(f).toMatchObject({ detectorId: 'private_key', value: `-----BEGIN RSA PRIVATE KEY-----\n${body}` });
  });

  it('PGP private key block', () => {
    const k = `-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: GnuPG v2\n\n${fake(64, B64)}\n=${fake(4, B64)}\n-----END PGP PRIVATE KEY BLOCK-----`;
    expect(one(k)[0]).toMatchObject({ value: k, label: 'PGP_PRIVATE_KEY' });
  });

  it('private key inside a JSON string with escaped newlines', () => {
    const k = `-----BEGIN PRIVATE KEY-----\\n${fake(64, B64)}\\n-----END PRIVATE KEY-----`;
    expect(one(`{"private_key": "${k}\\n"}`)[0]).toMatchObject({ detectorId: 'private_key', value: k });
  });

  it('specific detector beats the generic assignment on the same span', () => {
    const v = 'sk-proj-' + fake(80, URLSAFE);
    expect(one(`OPENAI_API_KEY=${v}`)).toMatchObject([{ detectorId: 'openai_api_key', label: 'OPENAI_API_KEY', value: v }]);
  });

  it('URI password beats the email-shaped match and only the password is taken', () => {
    const f = one('mongodb+srv://admin:pass@cluster0.acme.net/db');
    expect(f).toMatchObject([{ detectorId: 'uri_password', value: 'pass', label: 'DB_PASSWORD' }]);
  });

  it('https basic auth in URLs', () => {
    expect(one('https://bob:Tr0ub4dor@git.acme.io/repo.git')[0]).toMatchObject({ value: 'Tr0ub4dor', label: 'URL_PASSWORD' });
  });

  it('redis/amqp with empty user', () => {
    expect(one('redis://:R3disPass99@cache:6379')[0]).toMatchObject({ value: 'R3disPass99', label: 'DB_PASSWORD' });
    expect(one('amqp://guest:Gu3stPass7@mq:5672')[0]).toMatchObject({ value: 'Gu3stPass7', label: 'URL_PASSWORD' });
  });

  it('X-Amz-Signature in presigned URLs', () => {
    const sig = fake(64, HEX);
    const f = one(`https://b.s3.amazonaws.com/f?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=${sig}`);
    expect(f).toContainEqual(expect.objectContaining({ value: sig, label: 'X_AMZ_SIGNATURE' }));
  });

  it.each([
    ['.env', 'export DB_PASSWORD="p@ss w0rd!"', 'p@ss w0rd!', 'DB_PASSWORD'],
    ['yaml', 'spring:\n  datasource:\n    password: Pr0dPassw0rd', 'Pr0dPassw0rd', 'PASSWORD'],
    ['json', '{"client_secret": "abcDEF123456"}', 'abcDEF123456', 'CLIENT_SECRET'],
    ['json escaped quote', '{"password": "ab\\"cd12"}', 'ab\\"cd12', 'PASSWORD'],
    ['code', 'const apiKey = "k3y-Value-99";', 'k3y-Value-99', 'API_KEY'],
    ['python annotated', 'password: str = "hunter2xyz"', 'hunter2xyz', 'PASSWORD'],
    ['php', "'db_password' => 'Secr3tPhp',", 'Secr3tPhp', 'DB_PASSWORD'],
    ['go', 'Token := "tok_9xYz12345"', 'tok_9xYz12345', 'TOKEN'],
    ['dotted', 'spring.datasource.password=Spr1ngPass', 'Spr1ngPass', 'SPRING_DATASOURCE_PASSWORD'],
  ])('assignment in %s keeps the key and derives the label', (_n, text, value, label) => {
    expect(one(text)).toContainEqual(expect.objectContaining({ value, label }));
  });

  it('CLI flag with a space', () => {
    expect(one('vault login --token s3cr3tT0ken')[0]).toMatchObject({ detectorId: 'cli_flag', value: 's3cr3tT0ken', label: 'TOKEN' });
  });

  it('IBAN with a bad checksum is rejected; DE example passes', () => {
    expect(one('DE89 3704 0044 0532 0130 00')[0]).toMatchObject({ detectorId: 'iban' });
    expect(one('DE88 3704 0044 0532 0130 00').filter((f) => f.detectorId === 'iban')).toEqual([]);
  });
});
