# Dropper example - Expo app with CI/CD

A minimal Expo (expo-router) app that builds an internal-distribution IPA and APK
with EAS, then uploads both to a [Dropper](../README.md) site from CI so anyone with
the link can install them over the air.

```
example/
  app/                      a one-screen app showing its own version/build
  app.json                  bundle ids + slug
  eas.json                  the "preview" profile: internal distribution, APK on Android
  .github/workflows/
    distribute.yml          build with EAS, upload the artifacts to Dropper
```

## The app

Nothing interesting - a single screen that prints its version and build number so you
can tell which build you installed. The point is the pipeline, not the UI.

```sh
cd example
bun install
bun start
```

## Why these EAS settings

iOS only installs **ad hoc**, **development** or **enterprise** builds over the air, and
Android needs an **APK**, not an AAB. The `preview` profile in `eas.json` sets exactly that:

```json
{
  "preview": {
    "distribution": "internal",
    "android": { "buildType": "apk" }
  }
}
```

Register the devices your ad hoc iOS builds are allowed to run on first:

```sh
eas device:create
```

A `production` build (store signed, AAB) can't be installed from Dropper - the CLI warns
you if you try.

## CI/CD

`.github/workflows/distribute.yml` runs on every push to `main` (and on demand). It:

1. builds the `preview` profile for both platforms with `eas build --json`,
2. reads the artifact URLs out of that JSON,
3. downloads `dropper.mjs` from your Dropper site,
4. uploads each artifact with `dropper upload`, tagged with the branch and commit.

Dropper reads the app name, bundle id and version straight out of the binary and prints
an install link (and QR) per build.

> GitHub only runs workflows from the **repository root**, so copy `distribute.yml` into
> your app repo's `.github/workflows/`. Here it sits under `example/` only to keep the
> example self-contained.

### Secrets

The workflow needs three values:

| Name              | What it is                                                        |
| ----------------- | ---------------------------------------------------------------- |
| `EXPO_TOKEN`      | an Expo access token so EAS can build non-interactively          |
| `DROPPER_URL`     | your Dropper site, e.g. `https://dropper.example.com`            |
| `DROPPER_API_KEY` | the `API_KEY` configured on that site                            |

**This repo uses [1Password](https://developer.1password.com/docs/ci-cd/github-actions/)
for secret management** - CI pulls them at runtime with a service account token (see the
root [`.github/actions/load-secrets`](../.github/actions/load-secrets/action.yml) and
`infra/op.env`). You can do the same here and resolve `op://` references instead of
reading from `secrets.*`:

```yaml
- uses: 1password/load-secrets-action@v4
  with:
    export-env: true
  env:
    OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT }}
    EXPO_TOKEN: op://ci-cd/dropper-example/EXPO_TOKEN
    DROPPER_URL: op://ci-cd/dropper-example/DROPPER_URL
    DROPPER_API_KEY: op://ci-cd/dropper-example/DROPPER_API_KEY
```

But 1Password is optional - **any secret store works**. The example workflow uses plain
**GitHub Actions secrets** so it runs with no extra tooling:

```sh
gh secret set EXPO_TOKEN
gh secret set DROPPER_URL
gh secret set DROPPER_API_KEY
```

### Local one-off

You don't need CI to try it. Build locally and upload by hand:

```sh
eas build --profile preview --platform android --local --output build/app.apk

curl -fsSL "$DROPPER_URL/dropper.mjs" -o dropper.mjs
DROPPER_URL=https://dropper.example.com DROPPER_API_KEY=... \
  node dropper.mjs upload build/app.apk --profile preview --notes "testing"
```
