import type { Detector } from './types';
import {
  b64decode,
  charClasses,
  entropy,
  ibanValid,
  isNonSecretValue,
  isPlaceholderSyntax,
  isSecretKey,
  labelFromKey,
  looksRandom,
  luhn,
} from './validate';

// Every pattern must stay linear-time: bounded quantifiers, no nested unbounded repeats.
const rx = (src: string, flags = '') => new RegExp(src, 'gd' + flags);
const B = '(?<![A-Za-z0-9_])';
const E = '(?![A-Za-z0-9_-])';

type Opts = Partial<Omit<Detector, 'id' | 'name' | 'label' | 'regex'>> & { flags?: string; raw?: boolean };

function d(id: string, name: string, label: string, src: string, opts: Opts = {}): Detector {
  const { flags, raw, ...rest } = opts;
  return {
    id,
    name,
    label,
    category: 'secret',
    confidence: 'high',
    priority: 90,
    defaultOn: true,
    regex: rx(raw ? src : B + src + E, flags),
    ...rest,
  };
}

/** `KEYWORD...= value` where the keyword gives the context; the value is group 1. */
const ctx = (kw: string, value: string) =>
  `(?<![A-Za-z0-9])${kw}["']?\\s{0,3}[:=]\\s{0,3}["']?(${value})(?![A-Za-z0-9_-])`;

const SECRET_NEARBY = /(?:secret|token|passw|pwd|api[_ -]?key|access[_ -]?key|private[_ -]?key|credential|auth)/i;
const AWS_NEARBY = /aws|secret[_ ]?access|secretaccesskey/i;
const DB_SCHEMES = /^(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|mssql|sqlserver|oracle|cockroachdb|clickhouse|couchdb|neo4j(?:\+s)?|cassandra|jdbc:\w+)$/i;

const notPlaceholder = (v: string) => !isPlaceholderSyntax(v);
const tokenish = (v: string) => charClasses(v) >= 2 && !isNonSecretValue(v, true);
const upperSnake = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

const PEM_LABEL = '-----(?:BEGIN|END) (?:[A-Z0-9]{1,20} ){0,4}PRIVATE KEY(?: BLOCK)?-----';
const NL = '(?:\\r?\\n|\\\\n)';

export const DETECTORS: Detector[] = [
  // --- Private keys -----------------------------------------------------------
  d(
    'private_key',
    'Private key block',
    'PRIVATE_KEY',
    '-----BEGIN (?:[A-Z0-9]{1,20} ){0,4}PRIVATE KEY(?: BLOCK)?-----' +
      // Complete block, or a truncated one: armor headers then base64 lines only.
      `(?:(?:(?!-----)[\\s\\S]){0,20000}${PEM_LABEL.replace('(?:BEGIN|END)', 'END')}` +
      `|(?:${NL}[A-Za-z-]{1,40}: [^\\r\\n]{0,200}(?![^\\r\\n]))*(?:${NL}[A-Za-z0-9+/=]{0,100}(?![^\\r\\n\\\\]))*)`,
    {
      raw: true,
      priority: 100,
      labelFor: (v) => (v.includes('OPENSSH') ? 'SSH_PRIVATE_KEY' : v.includes('PGP') ? 'PGP_PRIVATE_KEY' : 'PRIVATE_KEY'),
    },
  ),

  // --- Cloud ------------------------------------------------------------------
  d('aws_access_key_id', 'AWS access key ID', 'AWS_ACCESS_KEY_ID', '(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}'),
  d('aws_secret_key', 'AWS secret access key', 'AWS_SECRET_KEY', '(?<![A-Za-z0-9/+=])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])', {
    raw: true,
    priority: 88,
    validate: (v, m, text) =>
      /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v) && entropy(v) > 3.5 &&
      AWS_NEARBY.test(text.slice(Math.max(0, m.index - 80), m.index)),
  }),
  d('aws_session_token', 'AWS session token', 'AWS_SESSION_TOKEN', '(?:FwoGZXIvYXdz|IQoJb3JpZ2lu)[A-Za-z0-9/+=]{80,3000}(?![A-Za-z0-9/+=])'),
  d('gcp_api_key', 'Google API key', 'GCP_API_KEY', 'AIza[0-9A-Za-z_-]{35}'),
  d('gcp_oauth_secret', 'Google OAuth client secret', 'GCP_OAUTH_SECRET', 'GOCSPX-[0-9A-Za-z_-]{28}'),
  d('gcp_oauth_token', 'Google OAuth access token', 'GCP_OAUTH_TOKEN', 'ya29\\.[0-9A-Za-z_-]{20,2000}'),
  d('gcp_refresh_token', 'Google OAuth refresh token', 'GCP_REFRESH_TOKEN', '1//0[0-9A-Za-z_-]{30,500}', { confidence: 'medium' }),
  d('azure_storage_key', 'Azure connection-string key', 'AZURE_KEY',
    '(?<![A-Za-z0-9])(?:AccountKey|SharedAccessKey|AccessKey|PrimaryKey|SecondaryKey)=([A-Za-z0-9+/]{30,100}={0,2})(?![A-Za-z0-9+/=])',
    { raw: true, group: 1 }),
  d('azure_client_secret', 'Azure AD client secret', 'AZURE_CLIENT_SECRET',
    '(?<![A-Za-z0-9_~.-])[A-Za-z0-9_~.]{3}\\dQ~[A-Za-z0-9_~.-]{31,34}(?![A-Za-z0-9_~.-])', { raw: true }),
  d('digitalocean_token', 'DigitalOcean token', 'DIGITALOCEAN_TOKEN', 'do[por]_v1_[a-f0-9]{64}'),
  d('cloudflare_api_token', 'Cloudflare API token', 'CLOUDFLARE_TOKEN',
    ctx('(?:cloudflare|cf)[_-]?(?:api[_-]?)?(?:token|key)', '[A-Za-z0-9_-]{37,40}'),
    { raw: true, group: 1, flags: 'i' }),
  d('cloudflare_origin_ca_key', 'Cloudflare Origin CA key', 'CLOUDFLARE_ORIGIN_CA_KEY', 'v1\\.0-[a-f0-9]{24}-[a-f0-9]{146}'),
  d('heroku_api_key', 'Heroku API key', 'HEROKU_API_KEY', 'HRKU-[A-Za-z0-9_-]{60}'),
  d('heroku_legacy_key', 'Heroku API key (legacy)', 'HEROKU_API_KEY',
    ctx('heroku[\\w.-]{0,20}', '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'),
    { raw: true, group: 1, flags: 'i' }),

  // --- Code hosting & registries ---------------------------------------------
  d('github_token', 'GitHub token', 'GITHUB_TOKEN', 'gh[pousr]_[A-Za-z0-9]{36,251}'),
  d('github_fine_grained_token', 'GitHub fine-grained token', 'GITHUB_TOKEN', 'github_pat_[A-Za-z0-9]{20,30}_[A-Za-z0-9]{50,70}'),
  d('gitlab_token', 'GitLab token', 'GITLAB_TOKEN',
    'gl(?:pat|ptt|dt|rt|cbt|imt|oas|soat|ffct|agent)-[A-Za-z0-9_.-]{19,299}[A-Za-z0-9_-](?![A-Za-z0-9_-]|\\.[A-Za-z0-9_-])', { raw: true }),
  d('atlassian_token', 'Atlassian API token', 'ATLASSIAN_TOKEN', 'AT(?:ATT|CTT)3[A-Za-z0-9_=-]{150,400}'),
  d('npm_token', 'npm token', 'NPM_TOKEN', 'npm_[A-Za-z0-9]{36}'),
  d('pypi_token', 'PyPI token', 'PYPI_TOKEN', 'pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,1000}'),
  d('docker_token', 'Docker Hub token', 'DOCKER_TOKEN', 'dckr_(?:pat|oat)_[A-Za-z0-9_-]{20,64}'),

  // --- AI providers -----------------------------------------------------------
  d('openai_api_key', 'OpenAI API key', 'OPENAI_API_KEY',
    '(?:sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,250}|sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20})'),
  d('anthropic_api_key', 'Anthropic API key', 'ANTHROPIC_API_KEY', 'sk-ant-(?:api|admin|oat|ort|sid)\\d{2}-[A-Za-z0-9_-]{20,250}'),
  d('huggingface_token', 'Hugging Face token', 'HF_TOKEN', '(?:hf|api_org)_[A-Za-z0-9]{34}'),
  d('groq_api_key', 'Groq API key', 'GROQ_API_KEY', 'gsk_[A-Za-z0-9]{52}'),
  d('xai_api_key', 'xAI API key', 'XAI_API_KEY', 'xai-[A-Za-z0-9]{60,100}'),
  d('replicate_token', 'Replicate token', 'REPLICATE_TOKEN', 'r8_[A-Za-z0-9]{37}'),
  d('perplexity_api_key', 'Perplexity API key', 'PERPLEXITY_API_KEY', 'pplx-[A-Za-z0-9]{40,64}'),

  // --- Payments ---------------------------------------------------------------
  d('stripe_secret_key', 'Stripe secret key', 'STRIPE_SECRET_KEY', 'sk_(?:live|test)_[A-Za-z0-9]{20,247}'),
  d('stripe_restricted_key', 'Stripe restricted key', 'STRIPE_RESTRICTED_KEY', 'rk_(?:live|test)_[A-Za-z0-9]{20,247}'),
  d('stripe_webhook_secret', 'Stripe webhook secret', 'STRIPE_WEBHOOK_SECRET', 'whsec_[A-Za-z0-9+/=]{32,80}'),
  d('square_access_token', 'Square access token', 'SQUARE_TOKEN', 'EAAA[A-Za-z0-9_-]{59,100}', { confidence: 'medium' }),
  d('square_secret', 'Square application secret', 'SQUARE_SECRET', 'sq0(?:csp|atp)-[0-9A-Za-z_-]{22,43}'),
  d('shopify_token', 'Shopify token', 'SHOPIFY_TOKEN', 'shp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}'),

  // --- Messaging & SaaS -------------------------------------------------------
  d('slack_token', 'Slack token', 'SLACK_TOKEN',
    '(?:xox[abeoprs]-[0-9A-Za-z-]{10,250}|xapp-\\d-[A-Z0-9]{9,12}-\\d{10,14}-[a-f0-9]{40,80})'),
  d('slack_webhook', 'Slack webhook URL', 'SLACK_WEBHOOK', 'https://hooks\\.slack\\.com/(?:services|workflows|triggers)/[A-Za-z0-9/_-]{20,200}'),
  d('discord_webhook', 'Discord webhook URL', 'DISCORD_WEBHOOK',
    'https://(?:ptb\\.|canary\\.)?discord(?:app)?\\.com/api/(?:v\\d{1,2}/)?webhooks/\\d{17,20}/[A-Za-z0-9_-]{60,80}'),
  d('discord_bot_token', 'Discord bot token', 'DISCORD_BOT_TOKEN', '[A-Za-z0-9]{23,28}\\.[A-Za-z0-9_-]{6,7}\\.[A-Za-z0-9_-]{27,40}', {
    // The first segment is the base64 of the bot's numeric user ID.
    validate: (v) => /^\d{17,20}$/.test(b64decode(v.slice(0, v.indexOf('.'))) ?? ''),
  }),
  d('telegram_bot_token', 'Telegram bot token', 'TELEGRAM_BOT_TOKEN', '(?<!\\d)\\d{8,10}:[A-Za-z0-9_-]{35}' + E, { raw: true }),
  d('teams_webhook', 'Microsoft Teams webhook URL', 'TEAMS_WEBHOOK', 'https://[a-z0-9-]{1,63}\\.webhook\\.office\\.com/webhookb2/[A-Za-z0-9@/_-]{20,400}'),
  d('twilio_api_key', 'Twilio API key', 'TWILIO_API_KEY', 'SK[0-9a-fA-F]{32}', { confidence: 'medium' }),
  d('sendgrid_api_key', 'SendGrid API key', 'SENDGRID_API_KEY', 'SG\\.[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}'),
  d('mailgun_api_key', 'Mailgun API key', 'MAILGUN_API_KEY', '(?:key-[0-9a-f]{32}|[0-9a-f]{32}-[0-9a-f]{8}-[0-9a-f]{8})'),
  d('notion_token', 'Notion token', 'NOTION_TOKEN', '(?:secret_[A-Za-z0-9]{43}|ntn_[A-Za-z0-9]{40,50})'),
  d('linear_api_key', 'Linear API key', 'LINEAR_API_KEY', 'lin_(?:api|oauth)_[A-Za-z0-9]{40,64}'),
  d('sentry_token', 'Sentry token', 'SENTRY_TOKEN', '(?:sntrys_[A-Za-z0-9+/=_-]{60,400}|sntryu_[a-f0-9]{64})'),
  d('datadog_api_key', 'Datadog API/app key', 'DATADOG_API_KEY',
    ctx('(?:dd|datadog)[_-]?(?:api|app(?:lication)?)[_-]?key', '[a-f0-9]{40}|[a-f0-9]{32}'),
    { raw: true, group: 1, flags: 'i' }),
  d('newrelic_key', 'New Relic key', 'NEWRELIC_KEY', '(?:NR(?:AK|II|JS|AA|IQ)-[A-Za-z0-9]{19,32}|[a-f0-9]{36}NRAL)'),
  d('grafana_token', 'Grafana token', 'GRAFANA_TOKEN', '(?:glsa_[A-Za-z0-9]{32}_[A-Fa-f0-9]{8}|glc_[A-Za-z0-9+/]{32,400}={0,2})'),
  d('vault_token', 'HashiCorp Vault token', 'VAULT_TOKEN', 'hv[sbr]\\.[A-Za-z0-9_-]{24,300}'),
  d('terraform_token', 'Terraform Cloud token', 'TERRAFORM_TOKEN', '[A-Za-z0-9]{14}\\.atlasv1\\.[A-Za-z0-9_=-]{60,70}'),
  d('tailscale_key', 'Tailscale key', 'TAILSCALE_KEY', 'tskey-[a-z]{3,8}-[A-Za-z0-9]{6,24}-[A-Za-z0-9]{20,64}'),
  d('supabase_token', 'Supabase token', 'SUPABASE_KEY', '(?:sbp_[a-f0-9]{40}|sb_secret_[A-Za-z0-9_-]{20,64})'),

  // --- Generic auth -----------------------------------------------------------
  d('jwt', 'JSON Web Token', 'JWT', 'eyJ[A-Za-z0-9_-]{8,4000}\\.eyJ[A-Za-z0-9_-]{8,8000}\\.[A-Za-z0-9_-]{0,2000}', {
    priority: 80,
    validate: (v) => {
      try {
        const h: unknown = JSON.parse(b64decode(v.slice(0, v.indexOf('.'))) ?? '');
        return typeof h === 'object' && h !== null && ('alg' in h || 'typ' in h);
      } catch {
        return false;
      }
    },
  }),
  d('auth_header', 'Authorization header', 'AUTH_TOKEN',
    '(?<![A-Za-z0-9-])(?:proxy-)?authorization["\']?\\s{0,3}[:=]\\s{0,3}["\']?' +
      '(?:(?:Bearer|Basic|Token|Digest|Bot|ApiKey|SSWS|Negotiate|NTLM)\\s{1,3})?([A-Za-z0-9._~+/=:,-]{8,4000})',
    {
      raw: true, group: 1, flags: 'i', priority: 75,
      validate: tokenish,
      labelFor: (_v, m) => (/basic/i.test(m[0]) ? 'BASIC_AUTH' : 'AUTH_TOKEN'),
    }),
  d('bearer_token', 'Bearer token', 'BEARER_TOKEN', '(?<![A-Za-z0-9_-])Bearer\\s{1,3}([A-Za-z0-9._~+/=-]{16,4000})', {
    raw: true, group: 1, flags: 'i', priority: 74, validate: tokenish,
  }),
  d('api_key_header', 'API key header', 'API_KEY',
    '(?<![A-Za-z0-9_-])((?:x-[a-z0-9-]{0,30}?(?:api-?key|token|secret|auth|key)|api-key|apikey))["\']?\\s{0,3}:\\s{0,3}["\']?([A-Za-z0-9._~+/=-]{8,1000})',
    { raw: true, group: 2, flags: 'i', priority: 72, validate: tokenish, labelFor: (_v, m) => upperSnake(m[1]!) }),
  d('uri_password', 'Password in connection URI', 'URL_PASSWORD',
    '(?<![A-Za-z0-9+.-])([a-z][a-z0-9+.:-]{1,20})://[^\\s:/@?#\'"<>]{0,200}:([^\\s/@?#\'"<>]{1,300})@',
    {
      raw: true, group: 2, flags: 'i', priority: 85,
      validate: notPlaceholder,
      labelFor: (_v, m) => (DB_SCHEMES.test(m[1]!) ? 'DB_PASSWORD' : 'URL_PASSWORD'),
    }),
  d('url_query_secret', 'Secret in URL query', 'TOKEN',
    '[?&;]((?:access|refresh|id|auth|session|private)?[_-]?token|api[_-]?key|apikey|key|secret|client[_-]?secret|password|passwd|pwd|sig|signature|X-Amz-(?:Signature|Credential|Security-Token)|X-Goog-(?:Signature|Credential)|jwt|sessionid|code_verifier)=([^&#\\s"\'<>]{6,4000})',
    {
      raw: true, group: 2, flags: 'i', priority: 70,
      validate: tokenish,
      labelFor: (_v, m) => (/^sig$/i.test(m[1]!) ? 'SIGNATURE' : upperSnake(m[1]!)),
    }),

  // --- Generic assignments ----------------------------------------------------
  d('assignment', 'Secret-named assignment', 'SECRET',
    // key (optionally quoted) [: type annotation] separator value (quoted, with escapes, or bare)
    '(?<![\\w.$-])(["\'`]?)((?=[A-Za-z_])[\\w.-]{0,40}?(?:pass|pwd|secret|token|key|cred|dsn|conn)[\\w.-]{0,40})\\1' +
      '(?:\\s{0,4}:\\s{0,4}[A-Za-z_][\\w.\\[\\], |]{0,40}?\\s{0,4}(?==))?\\s{0,4}(?::=|=>|=|:)\\s{0,4}' +
      '(?:(["\'`])((?:\\\\.|(?!\\3)[^\\\\\\r\\n]){1,2000})\\3|([^\\s"\'`,;)}\\]]{1,2000}))',
    {
      raw: true, group: [4, 5], flags: 'i', priority: 50, confidence: 'medium',
      validate: (_v, m) => isSecretKey(m[2]!) && !isNonSecretValue(m[4] ?? m[5]!, m[4] !== undefined),
      labelFor: (_v, m) => labelFromKey(m[2]!),
    }),
  d('cli_flag', 'Secret-named CLI flag', 'SECRET',
    '(?<![\\w-])--?((?=[A-Za-z])[\\w-]{0,40}?(?:pass|pwd|secret|token|key|cred)[\\w-]{0,40})(?:=|\\s{1,4})' +
      '(?:(["\'])((?:\\\\.|(?!\\2)[^\\\\\\r\\n]){1,2000})\\2|([^\\s"\'-][^\\s"\']{0,1999}))',
    {
      raw: true, group: [3, 4], flags: 'i', priority: 50, confidence: 'medium',
      validate: (_v, m) => isSecretKey(m[1]!) && !isNonSecretValue(m[3] ?? m[4]!, m[3] !== undefined),
      labelFor: (_v, m) => labelFromKey(m[1]!),
    }),
  d('high_entropy', 'High-entropy string near a secret keyword', 'SECRET',
    '(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/=_-]{20,500}(?![A-Za-z0-9+/=_-])',
    {
      raw: true, priority: 30, confidence: 'low',
      validate: (v, m, text) =>
        // shortcut: pure hex is skipped (hashes, UUIDs); hex secrets rely on the assignment/context detectors.
        !/^[0-9a-f-]+$/i.test(v) && charClasses(v) >= 3 && entropy(v) >= 3.5 && looksRandom(v) &&
        SECRET_NEARBY.test(text.slice(Math.max(0, m.index - 40), m.index)),
    }),

  // --- PII --------------------------------------------------------------------
  d('email', 'Email address', 'EMAIL', '(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\\.[A-Za-z0-9-]{1,63}){0,8}\\.[A-Za-z]{2,24}(?![A-Za-z0-9-])', {
    raw: true, category: 'pii', priority: 40,
    validate: (v) => !/@(?:[\w-]+\.)*(?:example\.(?:com|org|net)|example|test|invalid|localhost|local)$/i.test(v) &&
      !/\.(?:png|jpe?g|gif|svg|webp|ico|js|ts|css|map)$/i.test(v),
  }),
  d('phone', 'Phone number', 'PHONE',
    '(?<![\\w+.-])(?<!\\d )(?:(?:\\+\\d{1,3}[ .-]?)?(?:\\(\\d{2,4}\\)[ .-]?|\\d{2,4}[ .-])\\d{3,4}[ .-]\\d{3,4}|\\+\\d{10,15})(?!\\w|[ .-]\\d)',
    {
      raw: true, category: 'pii', confidence: 'medium', priority: 35,
      validate: (v) => {
        const digits = v.replace(/\D/g, '');
        return digits.length >= 10 && digits.length <= 15 && !/^(\d)\1+$/.test(digits);
      },
    }),
  d('credit_card', 'Payment card number', 'CARD_NUMBER', '(?<![\\d-])(?:\\d[ -]?){12,18}\\d(?![\\d-])', {
    raw: true, category: 'pii', priority: 60,
    validate: (v) => {
      const digits = v.replace(/\D/g, '');
      const seps = new Set(v.replace(/\d/g, ''));
      return seps.size <= 1 && digits.length >= 13 && digits.length <= 19 &&
        /^(?:4|5[1-5]|2[2-7]|3[0478]|6)/.test(digits) && !/^(\d)\1+$/.test(digits) && luhn(digits);
    },
  }),
  d('us_ssn', 'US Social Security number', 'SSN', '(?<![\\d-])(?!000|666|9\\d\\d)\\d{3}-(?!00)\\d{2}-(?!0000)\\d{4}(?![\\d-])', {
    raw: true, category: 'pii', priority: 55,
  }),
  d('iban', 'IBAN', 'IBAN', '(?<![A-Za-z0-9])[A-Z]{2}\\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?(?![A-Za-z0-9])', {
    raw: true, category: 'pii', priority: 60, validate: ibanValid,
  }),

  // --- Network ----------------------------------------------------------------
  d('public_ipv4', 'Public IPv4 address', 'IP_ADDRESS', ipv4Src(), {
    raw: true, category: 'network', confidence: 'medium', priority: 20,
    validate: (v, m, text) => ipv4Kind(v) === 'public' && !VERSION_BEFORE.test(text.slice(Math.max(0, m.index - 24), m.index)),
  }),
  d('private_ipv4', 'Private / local IPv4 address', 'PRIVATE_IP', ipv4Src(), {
    raw: true, category: 'network', confidence: 'low', priority: 19, defaultOn: false,
    validate: (v) => ipv4Kind(v) === 'private',
  }),
  d('ipv6', 'IPv6 address', 'IPV6', '(?<![\\w:.])[0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4}){2,7}(?![\\w:])', {
    raw: true, category: 'network', confidence: 'low', priority: 18, defaultOn: false, validate: ipv6Valid,
  }),
  d('mac_address', 'MAC address', 'MAC_ADDRESS', '(?<![\\w:-])[0-9A-Fa-f]{2}([:-])[0-9A-Fa-f]{2}(?:\\1[0-9A-Fa-f]{2}){4}(?![\\w:-])', {
    raw: true, category: 'network', confidence: 'low', priority: 18, defaultOn: false,
    validate: (v) => !/^(?:00[:-]){5}00$/.test(v),
  }),
];

const VERSION_BEFORE = /(?:version|ver\.?|release|build|v)\s*[:=]?\s*$/i;

function ipv4Src(): string {
  const o = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
  return `(?<![\\w.])${o}(?:\\.${o}){3}(?![\\w]|\\.\\d)`;
}

export function ipv4Kind(ip: string): 'public' | 'private' | 'reserved' {
  const [a, b, c] = ip.split('.').map(Number) as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)) return 'private';
  if (a >= 224 || (a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113))
    return 'reserved';
  return 'public';
}

function ipv6Valid(v: string): boolean {
  const halves = v.split('::');
  if (halves.length > 2) return false;
  const groups = halves.flatMap((h) => (h ? h.split(':') : []));
  if (groups.some((g) => g.length === 0 || g.length > 4)) return false;
  // Needs at least one letter or a `::` so times like 10:30:45 don't qualify.
  return (halves.length === 2 ? groups.length < 8 && groups.length >= 1 : groups.length === 8) && /[a-f]|::/i.test(v);
}
