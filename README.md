# dropper

TestFlight not working? Need private distribution? Use this! Install links for internal iOS and Android builds. Upload an `.ipa` or `.apk`, open the link on your phone, tap install, voila!

Next.js on Cloudflare Workers. Builds are stored in R2.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/luke-h1/dropper)

## Setup

### Cloudflare + Terraform

`infra/` creates the R2 bucket, a scoped R2 key, the Worker, its domain and the API key.

1. Edit `infra/terraform.tfvars`. `name` must match `name` in `wrangler.jsonc`, CI checks this.
2. Create the tokens below and put them in the 1Password item `ci-cd/dropper` (or change the `op://` paths in `infra/op.env` and `.github/actions/load-secrets/action.yml`).
3. Turn on deploys:
   ```sh
   gh secret set OP_SERVICE_ACCOUNT
   gh variable set DEPLOY_ENABLED --body true
   ```
4. Push to `main` or run the Deploy workflow. Get the API key with:
   ```sh
   cd infra
   op run --env-file=op.env -- terraform init
   op run --env-file=op.env -- terraform output -raw api_key
   ```

### Tokens

You create three. Terraform creates the rest (the bucket-scoped R2 key and `API_KEY`) and hands them to the Worker as secrets.

| Secret                                        | Where              | What it needs                                                                                                                                               |
| --------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`                        | 1Password          | Account: Workers Scripts edit, Workers R2 Storage edit, API Tokens edit, Account Settings read. Zone (just yours): Workers Routes edit, DNS edit, Zone read |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | 1Password          | Read, write and delete on the terraform state bucket in `infra/versions.tf`                                                                                 |
| `OP_SERVICE_ACCOUNT`                          | GitHub repo secret | A 1Password service account token with read access to the vault above                                                                                       |

The Cloudflare token can't be made from a script with a dashboard session (Cloudflare returns 403), so use the dashboard. This link pre-fills the permissions, then set Zone Resources to your zone:

```
https://dash.cloudflare.com/profile/api-tokens?name=dropper%20deploy&permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_r2%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_api_tokens%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_routes%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22dns%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22zone%22%2C%22type%22%3A%22read%22%7D%5D
```

Without Account API Tokens edit, the plan fails reading `tokens/permission_groups` with a 403.

### Firewall

Set `apply_firewall = true` in `infra/terraform.tfvars` to block keyless `/api` calls and unused methods at the edge. The token then also needs Zone WAF edit on your zone. It creates the zone's custom firewall ruleset, so if something else already manages that, add the rules from `infra/firewall.tf` there instead.

### Anywhere else

Create a private bucket and a key that can read, write, delete and list it. Set the variables in `.env.example` (`openssl rand -hex 32` for the API key), then `bun run deploy`.

## Uploading

```sh
curl -fsSL https://dropper.example.com/dropper.mjs -o scripts/dropper.mjs
DROPPER_URL=https://dropper.example.com DROPPER_API_KEY=... \
  bun scripts/dropper.mjs upload build/app.ipa --profile preview --notes "Fix login crash"
```

This downloads the CLI. It reads the name, bundle id and version from the binary, records the git branch and commit, and prints a link and QR code. `dropper list` and `dropper delete <id>` also work.

## Installable builds

iOS only installs ad hoc, development or enterprise builds over the air. Android needs an APK, not an AAB. For EAS:

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    }
  }
}
```

Register test devices with `eas device:create`.

## Access

One `API_KEY` variable is responsible for protecting the endpoints. API calls should include it as `x-api-key`. In a browser, open any page with `?key=<API_KEY>`

## License

MIT
