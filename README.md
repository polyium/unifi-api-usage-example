# UniFi API Usage Example

This repository is a small TypeScript CLI that demonstrates how to call the UniFi Network Integration API with an application API key.

The current example sends a `GET` request to the `sites` endpoint, handles common self-signed certificate problems, and prints the parsed JSON response to stdout.

## Prerequisites

- A recent version of Node.js and npm
- Network access to your UniFi controller or gateway
- A UniFi application API key
- Local DNS or a hosts entry that resolves `unifi` to your UniFi endpoint

## Setup

### 1. Create `runtime.json` before installing dependencies

This project runs a TypeScript build during `npm install`, so `runtime.json` must exist first.

Create a file named `runtime.json` in the repository root:

```json
{
  "api-key": "paste-your-unifi-application-api-key-here"
}
```

Notes:

- `runtime.json` is gitignored and should stay local
- The API key must be an application API key
- Site Manager keys and Protect API keys are not valid for this example

### 2. Make `unifi` resolve in your environment

The hostname is currently hard-coded as `unifi` in `src/main.ts`.

If your UniFi controller is reachable at `192.168.1.1`, a local hosts entry would look like this:

```text
192.168.1.1 unifi
```

If your environment uses a different hostname, either:

- Update local DNS or your hosts file so `unifi` resolves correctly
- Change the hostname constant in `src/main.ts`

### 3. Install dependencies

```bash
npm install
```

### 4. Run the example

```bash
npm start
```

### 5. Optionally run the linked CLI directly

This package also publishes a CLI named `unifi-api-usage-example` in `package.json`.
During `npm install`, the `postinstall` hook runs `npm link --ignore-scripts .`, so a successful install can also expose the example as a direct shell command:

```bash
unifi-api-usage-example
```

This uses the same repository checkout, `runtime.json`, and compiled `distribution/` output as `npm start`.

Notes:

- This assumes your npm-linked executable path is configured correctly in your shell environment
- Because the linked executable points back to this checkout, keep the repository at the same path or rerun `npm install` after moving it
- In shell setups that append `${PWD}/node_modules/.bin` or the git root's `node_modules/.bin` to `PATH` when you `cd` into the repository, other project-local npm binaries in this checkout will also be callable directly

## Example Request

The current implementation sends a request equivalent to:

```http
GET /proxy/network/integration/v1/sites?offset=0&limit=0&filter= HTTP/1.1
Host: unifi
Accept: application/json
X-API-Key: <your-api-key>
```

On success, the CLI prints the parsed response:

```text
{ data: ... }
```

## TLS and Self-Signed Certificate Behavior

Many UniFi deployments use self-signed or privately issued certificates. This example includes a fallback for common certificate validation failures such as:

- `DEPTH_ZERO_SELF_SIGNED_CERT`
- `ERR_TLS_CERT_ALTNAME_INVALID`
- `SELF_SIGNED_CERT_IN_CHAIN`
- `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`
- `UNABLE_TO_VERIFY_LEAF_SIGNATURE`

When one of those errors occurs, the CLI:

1. Opens a TLS connection with verification temporarily disabled so it can inspect the peer certificate
2. Converts the peer certificate into PEM format
3. Builds an `https.Agent` that trusts that certificate
4. Retries the request using a hostname that matches the certificate when possible

This makes the example more useful in lab, home, and internal-network environments where public CA trust is not always available.

## Available Scripts

- `npm start` builds and runs the compiled CLI from `distribution/`
- `npm run build` compiles the TypeScript sources
- `npm test` runs Jest after building
- `npm run lint` runs ESLint
- `npm run fix` runs ESLint with automatic fixes
- `npm run generate-secret` prints a random URL-safe secret

## Project Layout

- `src/main.ts` contains the CLI, request logic, and TLS certificate fallback
- `src/runtime.ts` loads the runtime configuration from `runtime.json`
- `runtime.schema.json` documents the required runtime configuration shape
- `scripts/` contains optional helper scripts for certificate, PKCE, and local environment tasks

## Troubleshooting

### `npm install` fails because `runtime.json` is missing

Create `runtime.json` before running `npm install`.

### `unifi-api-usage-example` is not found

Make sure `npm install` completed successfully, your npm-linked executable directory is on `PATH`, and rerun `npm install` if the repository was moved after it was linked.

### The request fails with `ENOTFOUND unifi`

Your machine cannot resolve `unifi`. Fix local DNS, add a hosts entry, or update the hostname in `src/main.ts`.

### The API returns `401 Unauthorized`

Make sure the key in `runtime.json` is an application API key and that it is still active.

### TLS errors still occur

If the certificate fallback still cannot complete the request, use a hostname that appears in the certificate's SAN or common name, or install the correct CA certificate in your environment.

## Security

- Do not commit `runtime.json` or real API keys
- Use the least-privileged API key that works for your use case
- If you discover a security issue, see `SECURITY.md`

## Contributing

See `CONTRIBUTING.md` for contribution guidance and `CODE_OF_CONDUCT.md` for community expectations.
