# Deploy from GitHub Actions

`.github/workflows/deploy-functions.yml` deploys every push to `main`, including
merge, squash, and rebase merges. Direct pushes also deploy. The workflow can be
run manually from the Actions tab with `main` selected; other branches do not deploy.

The Linux runner uses Node 22, installs locked dependencies, runs the unit tests,
builds and typechecks the Azure package, installs its production dependencies,
and runs `scripts/publish-azure.ps1`. It then checks the public pages and MCP
behavior at `https://word-guesser.mcp.11feed.com`, retrying for startup delays.
Tests and builds must pass before publishing. Live verification failures mark the
run failed after publication; they do not automatically roll back the app.

Production runs share a concurrency group so an active publication is never
cancelled by a new push. GitHub can replace an older pending run with a newer one
when several pushes arrive during a deployment, so the latest pending version is deployed next.
The workflow updates the existing Function App only; infrastructure changes still
use the manual Azure deployment process in the README.

## Configured Azure authentication

The deployment identity and OIDC trust were created and verified in Azure on
2026-10-22. The workflow contains its public identifiers, so no GitHub secrets,
repository variables, client secret, or publish profile are needed.

| Setting | Value |
| --- | --- |
| Entra application | `word-guesser-github-deploy` |
| Application (client) ID | `5a362a3e-6b8d-4bd8-b162-935ef9bedbca` |
| Application object ID | `ae247445-d06f-464e-aa71-941ff8aebc4f` |
| Service principal object ID | `662ca8a1-4e52-4c04-b192-71e7bacb1ff9` |
| Tenant ID | `fc091796-6c49-4dbf-8252-1d44c1b3ac17` |
| Subscription ID | `0e928795-9229-4a02-a62f-537616f6e5da` |
| Federated credential | `github-main` |
| Issuer | `https://token.actions.githubusercontent.com` |
| Subject | `repo:gusdeoliveira/word-guesser-gpt-mcp:ref:refs/heads/main` |
| Audience | `api://AzureADTokenExchange` |
| Azure role | Website Contributor |
| Role scope | Function App `func-word-guesser-6e5da` only |

The role's exact scope is
`/subscriptions/0e928795-9229-4a02-a62f-537616f6e5da/resourceGroups/rg-word-guesser-brazilsouth/providers/Microsoft.Web/sites/func-word-guesser-6e5da`.
It permits the publish script to read the app, preserve its widget setting, and
publish code without subscription-wide Contributor access.

OIDC obtains a short-lived token at run time, with trust restricted to this
repository's `main` branch. The job requests `id-token: write` for that exchange
and `contents: read` for checkout. The workflow deliberately has no GitHub
environment; adding one changes the OIDC subject and requires a matching
federated credential.

## Recreate or verify the setup

With an Azure CLI account authorized to manage this application and assign the
app-scoped role, run:

```powershell
./scripts/setup-github-azure.ps1
```

The script reuses the named single-tenant Entra application and service principal,
creates any missing branch trust or app-scoped Website Contributor assignment,
and reads both back to verify the result. It creates no client secrets and does
not deploy app code. It stops if the account's tenant or target Function App does
not match the expected configuration, or if duplicate identities make reuse ambiguous.
If recreating a deleted application, update the workflow's public client ID from
the script output.

After the workflow is pushed or merged into `main`, check the first run in
**Actions > Deploy Word Guesser to Azure Functions**. You can also use **Run
workflow** on `main` to retry a deployment. Changes to the app name, resource group,
or public hostname must also update the workflow's `env` values.

Official references:

- [Azure Login with OpenID Connect](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect)
- [GitHub Actions deployments to Azure Functions](https://learn.microsoft.com/en-us/azure/azure-functions/functions-how-to-github-actions)
- [Website Contributor permissions](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/web-and-mobile#website-contributor)
