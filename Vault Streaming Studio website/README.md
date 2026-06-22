# VaultStudio Website

Standalone product landing page and Lifetime Pro checkout for VaultStudio.

## Run locally

```powershell
cd "D:\VaultStudio\Vault Streaming Studio website"
npm run dev
```

## Current release

The site is prepared for VaultStudio `1.5.1`.

Download buttons point to:

```text
./downloads/VaultStudio Setup 1.5.1.exe
```

The installer is copied there before hosting so the folder can be uploaded as a
self-contained static site. macOS and Linux are listed as "coming soon" until the
native VSS engine is ported, built on those host OSes, and the packaged-app
smoke test passes in CI.

## In-app updates

The desktop app checks for new versions via a small JSON manifest. By default it
reads `https://vaultstudio-payments.vaultstudio.workers.dev/latest.json` (served by
the payments Worker, see `latestManifest` in `payments-worker/src/index.js`), and
`downloads/latest.json` here is the static-hosting manifest. The desktop updater
resolves relative download URLs against whichever manifest URL it fetched. Before
live hosting, set the Worker's `SITE_URL` (or `DOWNLOAD_WIN`, `DOWNLOAD_MAC`, and
`DOWNLOAD_LINUX`) so the hosted updater opens real installer URLs. The app's
manifest URL can be overridden with the `VAULTSTUDIO_UPDATE_URL` environment
variable for staging.

## Checkout

`buy.html` uses:

```text
payments-config.js
```

Current sandbox Worker:

```text
https://vaultstudio-payments.vaultstudio.workers.dev
```

Before live hosting:

1. Switch the PayPal app and Worker from sandbox to live.
2. Set `ALLOWED_ORIGIN` in `payments-worker/wrangler.toml` to the real domain.
3. Register the live PayPal webhook URL: `/paypal/webhook`.
4. Set the live `PAYPAL_SECRET` and `PAYPAL_WEBHOOK_ID` with Wrangler secrets.
5. Set a verified `EMAIL_FROM` and `RESEND_API_KEY` so keys are emailed.

Release copy should stay consistent: Free includes 3 stream targets and 3
dashboard platforms. Lifetime Pro is a one-time $19.99 USD upgrade for
unlimited stream targets and dashboard platforms.
