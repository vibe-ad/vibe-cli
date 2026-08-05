import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

/**
 * RFC 8252 §7.3 loopback redirect for native OAuth clients.
 *
 * Starts an HTTP server on 127.0.0.1 with an OS-assigned port, waits for the
 * IdP to redirect there with a `code` (or `error`), and resolves with the
 * parsed query. The server is closed before this returns.
 */
export interface LoopbackResult {
  code: string;
  state: string;
}

export interface LoopbackOptions {
  expectedState: string;
  timeoutMs?: number;
  successHtml?: string;
  errorHtml?: (description: string) => string;
}

// ---- Branded callback pages
// The last thing a user sees after authenticating in the browser. Rendered in Vibe's
// brand: indigo "V" mark, Inter type, a light centered card. Success and failure share
// one shell so the chrome lives in exactly one place.

/** The Vibe "V" logo mark path (viewBox 0 0 27 24), filled with the indigo gradient. */
const VIBE_V_PATH =
  'M19.4726 14.6154C23.4492 14.6574 26.7559 11.5408 26.8996 7.57042C27.0455 3.53699 23.872 0.149744 19.8113 0.00480693C16.6702 -0.10734 13.9183 1.75349 12.7655 4.46897L11.8384 3.0723C9.89275 0.141289 5.92341 -0.668075 2.97258 1.26452C0.0217745 3.19711 -0.793067 7.13981 1.15258 10.0708L8.5016 21.1417C10.4473 24.0727 14.4166 24.8821 17.3674 22.9495C20.1624 21.1189 21.041 17.4849 19.4726 14.6154ZM22.9488 7.44119C22.8815 9.30078 21.3093 10.7541 19.4371 10.6873C17.565 10.6204 16.1018 9.05876 16.1691 7.19917C16.2364 5.33954 17.8086 3.88622 19.6808 3.95309C21.553 4.01991 23.0161 5.5816 22.9488 7.44119ZM5.25216 4.60318C6.35183 3.88296 7.83109 4.18459 8.55617 5.27688L15.8935 16.3301C16.6186 17.4224 16.3149 18.8917 15.2152 19.6119C14.1156 20.3322 12.6363 20.0305 11.9112 18.9383L4.57391 7.88497C3.84882 6.79268 4.1525 5.32336 5.25216 4.60318Z';

/** V mark used as the favicon, indigo (#23 == '#'), URL-encoded for a data: URI. */
const FAVICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 27 24'%3E%3Cpath d='${encodeURIComponent(
  VIBE_V_PATH,
)}' fill='%234F46E5'/%3E%3C/svg%3E`;

const SUCCESS_ICON =
  '<path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
const ERROR_ICON =
  '<path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';

/**
 * Renders one branded callback page. `message` is treated as trusted HTML — callers
 * MUST escape any interpolated user input before passing it in.
 */
function renderAuthPage(opts: {
  title: string;
  heading: string;
  message: string;
  variant: 'success' | 'error';
}): string {
  const isError = opts.variant === 'error';
  const icon = isError ? ERROR_ICON : SUCCESS_ICON;
  // Best-effort: close the tab shortly after success. Browsers block window.close()
  // for tabs the user opened rather than script, so this often no-ops — the message
  // below is the reliable path back to the terminal.
  const autoClose = isError
    ? ''
    : '\n<script>setTimeout(function () { window.close(); }, 1500);</script>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opts.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">
<link rel="icon" href="${FAVICON}">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 1.5rem;
    background: linear-gradient(180deg, #E0E7FF 0%, #EEF2FF 42%, #FFFFFF 100%);
    color: #334155; -webkit-font-smoothing: antialiased;
  }
  .card {
    width: 100%; max-width: 26rem; padding: 2.5rem 2.25rem;
    background: #FFFFFF; border: 1px solid #EEF2FF; border-radius: 16px;
    box-shadow: 0 12px 40px -12px rgba(79, 70, 229, 0.28), 0 2px 8px rgba(15, 23, 42, 0.04);
    text-align: center;
  }
  .logo { height: 36px; width: auto; }
  .status {
    margin: 1.5rem auto 0; width: 56px; height: 56px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
  }
  .status svg { width: 28px; height: 28px; }
  .status--success { background: #DCFCE7; color: #16A34A; }
  .status--error { background: #FEE2E2; color: #DC2626; }
  h1 {
    margin: 1.25rem 0 0.5rem; font-size: 1.5rem; font-weight: 600;
    letter-spacing: -0.02em; color: #0F172A;
  }
  p { margin: 0; font-size: 0.95rem; line-height: 1.55; color: #64748B; }
</style>
</head>
<body>
<main class="card">
  <svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 27 24" fill="none" role="img" aria-label="Vibe">
    <path d="${VIBE_V_PATH}" fill="url(#vibe-mark)"/>
    <defs>
      <linearGradient id="vibe-mark" x1="13.4997" y1="0" x2="13.4997" y2="24" gradientUnits="userSpaceOnUse">
        <stop stop-color="#3730A3"/>
        <stop offset="1" stop-color="#4F46E5"/>
      </linearGradient>
    </defs>
  </svg>
  <div class="status status--${opts.variant}">
    <svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>
  </div>
  <h1>${opts.heading}</h1>
  <p>${opts.message}</p>
</main>${autoClose}
</body>
</html>`;
}

const DEFAULT_SUCCESS_HTML = renderAuthPage({
  title: 'Vibe CLI — login complete',
  heading: 'Login complete',
  message: 'You can close this window and return to your terminal.',
  variant: 'success',
});

const defaultErrorHtml = (description: string): string =>
  renderAuthPage({
    title: 'Vibe CLI — login failed',
    heading: 'Login failed',
    message: `${escapeHtml(description)}<br>Return to your terminal for details.`,
    variant: 'error',
  });

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

export interface ListeningLoopback {
  readonly redirectUri: string;
  readonly port: number;
  /** Resolves once the OAuth provider has redirected back. */
  readonly result: Promise<LoopbackResult>;
  /** Shuts the server down regardless of whether `result` resolved. */
  close(): Promise<void>;
}

export async function startLoopback(options: LoopbackOptions): Promise<ListeningLoopback> {
  const timeoutMs = options.timeoutMs ?? 5 * 60_000;

  let server: Server;
  let resolveResult!: (value: LoopbackResult) => void;
  let rejectResult!: (err: Error) => void;

  const result = new Promise<LoopbackResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1`);
    if (url.pathname !== '/callback') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }

    const error = url.searchParams.get('error');
    if (error) {
      const description = url.searchParams.get('error_description') ?? error;
      res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      res.end((options.errorHtml ?? defaultErrorHtml)(description));
      rejectResult(new Error(`OAuth provider returned error: ${error} — ${description}`));
      return;
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) {
      res.writeHead(400, { 'content-type': 'text/plain' });
      res.end('missing code or state');
      rejectResult(new Error('Loopback callback missing code or state'));
      return;
    }
    if (state !== options.expectedState) {
      res.writeHead(400, { 'content-type': 'text/plain' });
      res.end('state mismatch');
      rejectResult(new Error('OAuth state mismatch — possible CSRF, aborting'));
      return;
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(options.successHtml ?? DEFAULT_SUCCESS_HTML);
    resolveResult({ code, state });
  };

  server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  const port = address.port;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const timeout = setTimeout(() => {
    rejectResult(new Error(`OAuth callback timed out after ${Math.round(timeoutMs / 1000)}s`));
  }, timeoutMs);
  timeout.unref();

  const close = async (): Promise<void> => {
    clearTimeout(timeout);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  // Best-effort: close the server once we have a result either way. The rejection is
  // surfaced to whoever awaits `result`; swallow it on this branch so closing the
  // server never raises an unhandled rejection.
  result.then(
    () => close(),
    () => close(),
  );

  return { redirectUri, port, result, close };
}
