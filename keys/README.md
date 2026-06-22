# VaultStudio License Key Management

## Overview

VaultStudio uses RSA-2048 signed license keys for offline tier validation.
Keys are verified locally using an embedded public key — no server required.

## Key Format

```
VS-PRO-XXXX-XXXX-XXXX-XXXX    (Pro tier — unlimited targets)
VS-FREE-XXXX-XXXX-XXXX-XXXX   (Free tier — max 3 targets)
```

- Prefix identifies the tier (`PRO` or `FREE`)
- 16 alphanumeric characters encode a unique license token
- Keys are case-insensitive on entry

## Key Pair Generation

Generate the RSA-2048 key pair using OpenSSL:

```bash
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

### Embed the public key

Copy the contents of `keys/public.pem` into
`electron/services/license-service.ts`, replacing the `PUBLIC_KEY_PEM`
placeholder string. Keep the PEM header/footer lines.

**Never ship the private key with the application.** The private key is only
used by the license generator tool and must remain secret.

## Signing a License

Current checkout keys are signed over the bare key string:

```bash
printf "VS-PRO-A1B2-C3D4-E5F6-G7H8" | \
  openssl dgst -sha256 -sign keys/private.pem | \
  openssl base64 -A
```

The resulting base64 string is appended to the key:

```text
VS-PRO-A1B2-C3D4-E5F6-G7H8.<signature>
```

The app derives the tier from the signed key prefix (`VS-PRO` or `VS-FREE`) and
does not trust editable stored metadata for tier elevation.

## Worker Auto-Signing

The payments Worker can generate keys on demand if you configure
`LICENSE_PRIVATE_KEY_PEM`. Convert the private key to PKCS#8 first:

```bash
openssl pkcs8 -topk8 -nocrypt -in keys/private.pem -out keys/private.pkcs8.pem
```

Set that PEM as a Cloudflare secret. Do not commit either private key file.

## Security Notes

- The private key (`keys/private.pem`) must **never** be committed to the repo
  or bundled with the app
- `keys/private.pem` is already in `.gitignore` — verify before committing
- The public key in the source code is safe to distribute
- Compromising the private key allows unlimited Pro key generation

## File Inventory

| File                  | Purpose                                    |
| --------------------- | ------------------------------------------ |
| `keys/private.pem`    | RSA private key (secret, not in repo)      |
| `keys/private.pkcs8.pem` | Worker auto-signing secret source (secret, not in repo) |
| `keys/public.pem`     | RSA public key (embed in license-service)  |
| `keys/README.md`      | This file                                |
