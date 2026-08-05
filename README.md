# vibe-cli

Command-line interface for the [Vibe Public API][vibe-api]. Agent-first wrapper
around the auto-generated OpenAPI client — exposes every operation directly,
with OAuth 2.0 + PKCE authentication and no hidden business logic.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/vibe-ad/vibe-cli/main/install.sh | sh
```

This downloads the latest release binary for your platform, verifies its
SHA256, installs it to `~/.vibeco/bin/vibeco`, and appends the directory to your
shell rc file. Pass `--no-modify-path` to skip the PATH edit:

```sh
curl -fsSL https://raw.githubusercontent.com/vibe-ad/vibe-cli/main/install.sh | sh -s -- --no-modify-path
```

### Updating

The CLI checks GitHub Releases at most once per hour and prints a warning on
stderr when a newer version is out. To upgrade:

```sh
vibeco --update
```

Set `VIBECO_DISABLE_UPDATE_CHECK=1` to opt out of the passive check.

### Building from source

Only needed if you're hacking on the CLI itself:

```sh
git clone git@github.com:vibe-ad/vibe-cli.git
cd vibe-cli
bun install
bun run fetch-openapi    # pulls the spec from the public CDN
bun run gen-client
bun run build            # compiles dist/vibeco-<platform>-<arch>
./dist/vibeco-darwin-arm64 --help
```

## Quick start

```sh
vibeco login                  # opens a browser for OAuth + stores tokens locally
vibeco whoami                 # show the cached credential
vibeco operations             # list every callable operation
vibeco describe list-accounts # arguments + body schema for one operation
vibeco schemas CampaignCreate # resolve a schema $ref returned by `describe`
vibeco call list-advertisers  # invoke an operation by operationId
vibeco call create-campaign --body @./campaign.json
vibeco logout
```

Tokens are stored at `~/.config/vibeco/credentials.json` (mode `0600`).

### Calling an operation

```sh
vibeco call <operationId> [--path-param value ...] [--query-param value ...] [--body '<json>'|@file|-]
```

- Path, query, and header parameters are passed as `--<name> <value>` flags
  using the names defined in the OpenAPI spec.
- The request body is passed as `--body`. Use `--body '{"k":"v"}'` for inline
  JSON, `--body @path/to/file.json` for a file, or `--body -` to read JSON
  from stdin.
- Successful responses are written to stdout as JSON. Errors (auth, network,
  API, usage) are written to stderr as a structured envelope, with a
  non-zero exit code that distinguishes the failure mode.

### Environments

The CLI ships with the `prod` endpoint baked into `src/config.ts` and hits it
by default. To point at any other stack (a self-hosted gateway, internal
staging, etc.) copy `.env.example` to `.env`, fill it in, and pass
`--env local`. The `.env` is read at runtime from the current working
directory and is never bundled into the packaged CLI, so shipped binaries
only ever know about prod.

### API revision

The CLI vendors a single OpenAPI revision and sends it as `X-Vibe-Revision`
on every request. To move to a newer revision, run `vibeco --update`. The
version string encodes the revision — `vibeco --version` prints e.g.
`2026-06-01-3 (api=2026-06-01)`.

## How it works

```
┌────────────┐     OAuth 2.0 (PKCE)      ┌─────────────┐
│ vibeco CLI │ ─────────────────────────▶│  Vibe Auth  │
│            │ ◀─── access_token, ────── │             │
│            │      refresh_token        └─────────────┘
│            │
│            │     Bearer + X-Vibe-Revision
│            │ ──────────────────────────▶ api.vibe.co
└────────────┘
```

The OpenAPI spec is the source of truth: every CLI release pins a frozen
revision (recorded in [`openapi/manifest.json`](./openapi/manifest.json)) and
generates a runtime registry under `src/generated/`.

[vibe-api]: https://developers.vibe.co
Contact: team-integration@vibe.co

## License

[MIT](./LICENSE)