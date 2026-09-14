# Better Loop browser handoff

`@better-loop/handoff@0.1.0-draft.1` transfers an exact, already reviewed `ContributionApproval` from `@better-loop/evidence@0.1.0-draft.1` into a website browser window. It opens no browser automatically, makes no production request itself, and does not authenticate or publish.

The person opens an ephemeral local preview, sees the full contribution, capability capsule and consent, and clicks **Open website to review sharing**. Only after the captured website window signals readiness does the local window send the approval through `postMessage`. The website validates it, acknowledges local import and presents its own memory-only preview. Sign-in and explicit publication are separate website actions.

## Node API

```ts
import { startHandoff } from "@better-loop/handoff";

const handoff = await startHandoff(alreadyReviewedApproval, {
  targetOrigin: "https://better-loop.com",
  ttlMs: 120_000,
});
// Show handoff.url to the person. It contains a random access token, never payload data.
// The caller retains the server until completion/expiry or explicitly cancels:
// await handoff.close();
```

`startHandoff(approval, options)` returns `Promise<LocalHandoff>`:

```ts
interface LocalHandoff {
  url: string;
  origin: string;
  close(): Promise<void>;
}
```

- `targetOrigin` must equal `https://better-loop.com` or, for local review, `http://127.0.0.1:3100`. No other ports, aliases, paths, credentials, query strings or fragments are accepted.
- `ttlMs` defaults to 120,000; integer range 1,000–300,000 milliseconds.
- The listener binds an ephemeral port on `127.0.0.1`. It snapshots validated minimized data in memory, writes no contribution file and emits no request/payload logs.
- `close()` is idempotent. It releases the server-held approval and prevents further preview/claim requests. An approval already delivered to the browser cannot be recalled by closing this server.
- Validation checks exact shapes, bounds, digest and evidence cross-field rules through the evidence package. Serialized approval validation does not prove prior review or human confirmation; callers must supply their actually reviewed approval. This transport does not manufacture clearance.

## Browser API

Import the browser subpath, which contains no Node server imports:

```ts
import { receiveHandoff } from "@better-loop/handoff/browser";

// Run promptly on /share, before analytics or auth initialization.
const receiver = receiveHandoff({ timeoutMs: 120_000 });
if (receiver) {
  receiver.result.then(
    approval => renderMemoryOnlyPreview(approval),
    () => showManualImport(),
  );
  // On component disposal/navigation: receiver.cancel().
}
```

`receiveHandoff(options?)` returns `{result: Promise<ContributionApproval>, cancel(): void} | null`. Null means there is no handoff fragment. A present rendezvous fragment is removed synchronously before validation or messaging; invalid rendezvous, missing opener, expiry and cancellation reject the result without import. Receiver timeout is an integer from 1–300,000 milliseconds. The default is 120,000.

Store the resolved approval only in the current browser page's memory. Show the exact candidate, capsule, consent and digest. Do not store it in local/session storage, a URL, analytics or a cloud draft. The caller's website must independently enforce admission and explicit publication.

## Exact protocol

The local button opens:

```text
ALLOWED_ORIGIN/share#bl_handoff=NONCE&bl_origin=ENCODED_LOOPBACK_ORIGIN
```

Both rendezvous parameters are required exactly once; unknown fields are rejected. The nonce is 32 random bytes encoded as 43 base64url characters, separate from the local preview access token. Payload bytes never appear in the URL.

All messages use `protocol: "bl-handoff-0.1"` and reject unknown fields:

| Direction | Exact fields |
| --- | --- |
| Website → captured local opener | `{protocol, type:"ready", nonce}` |
| Local opener → captured website popup | `{protocol, type:"payload", nonce, expires_at, approval}` |
| Website → captured local opener | `{protocol, type:"ack", nonce, digest}` |

`expires_at` is an integer epoch-millisecond deadline. The receiver rejects expired deadlines and deadlines more than five minutes ahead. `digest` equals the approval's `preview_digest`.

Every handler checks exact `event.origin`, exact captured `event.source` WindowProxy and nonce. Every outbound `postMessage` names the exact target origin; none uses `*`. Unknown/malformed envelopes or changed approvals never resolve to imported data. The envelope limit is 32 KiB; the evidence package applies its tighter candidate/contribution/approval limits.

Sender states are preview → opening → claiming → sent → acknowledged. A real button gesture opens the popup. A validated `ready` triggers a one-use **same-origin loopback POST**, containing only the rendezvous nonce. The server rechecks token, Host, Origin, method, content type, body shape, TTL and claim state before returning its snapshot. The sender validates that response and compares it with the original preview digest before transferring it. This local claim makes host closure effective even for a page that is already open.

There is no retry after send, acknowledgement, expiry or failure; duplicate readiness and acknowledgement messages have no effect. Timeouts leave an explicit failure/unknown-completion state, not an automatic resend. Start a new handoff or use manual import if needed.

## Browser and privacy boundaries

- Preview HTML escapes all candidate text. Executable inline code and styles use CSP hashes; there are no remote scripts/assets, `unsafe-eval`, form submissions or candidate-bearing URLs. CSP permits only the same-origin loopback claim connection.
- Responses use no-store, no-referrer, nosniff, no framing and no indexing headers. The preview access token is removed from the browser address/history entry as soon as the page script runs. The receiver immediately removes rendezvous fragments.
- No cookies, email, OTP or website session tokens are read by the host/helper. The website receives the payload only in its browser window, not through an HTTP submission by this helper.
- The local page erases its displayed approval after acknowledgement, expiry or failure. The website page still controls its own imported memory. Closing a transferred preview is not contribution withdrawal.
- A blocked popup or COOP policy that severs `window.opener` prevents handoff; support manual import. Use compatible opener policies for this explicit flow rather than weakening origin/source checks. Each fresh handoff requires a fresh preview and user gesture.
- Loopback access is not isolation from a malicious process running as the same local user. This helper also does not certify semantic review or work authenticity.

## Build and verification

From the workspace, install/build the pinned contracts and evidence dependencies first. The parent workspace owns its lockfile and package linking.

```sh
npm run build --workspace @better-loop/handoff
npm run typecheck --workspace @better-loop/handoff
npm test --workspace @better-loop/handoff
npm run test:browser --workspace @better-loop/handoff
npm run test:consumer --workspace @better-loop/handoff
```

The build produces ESM/CommonJS and declarations for both exports, plus the inline sender asset. Browser tests use installed Chrome or an already installed Playwright browser. They intercept website origins with synthetic local test pages and never contact the running app, production, email or a model. They cover a real button gesture, exact transfer, CSP, immediate fragment cleanup, wrong origin/source/nonce, malformed envelopes, no transfer before ready, close/expiry, changed payload and no resend after acknowledgement.

The offline consumer check packs this package and installs it with the already packed contracts, privacy draft.3 and evidence draft.1 archives in a package-local ignored directory. It checks both module/type export modes and shipped assets without a registry request.

This package does not edit the host CLI or website. Integrators own their UI lifecycle, memory-only import, local/production deployment settings, user consent and publication controls. Roll back by removing the handoff integration and returning to manual approved JSON import.
