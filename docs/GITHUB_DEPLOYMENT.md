# Deploy from GitHub Actions

`.github/workflows/deploy-functions.yml` deploys every push to `main`, including
merge, squash, and rebase merges. Direct pushes also deploy. The workflow can be
run manually from the Actions tab with `main` selected; other branches do not deploy.

The Linux runner uses Node 22, installs locked dependencies, runs the unit tests,
builds and typechecks the Azure package, installs its production dependencies,
and runs `scripts/publish-azure.ps1`. It then checks the public pages and MCP
behavior at the configured public hostname, retrying for startup delays. Tests
and builds must pass before publishing. Live verification failures mark the run
failed after publication; they do not automatically roll back the app.

Production runs share a concurrency group so an active publication is never
cancelled by a new push. GitHub can replace an older pending run with a newer one
when several pushes arrive during a deployment, so the latest pending version is
deployed next. The workflow updates the existing Function App only; infrastructure
changes still use the manual Azure deployment process in the README.

## Azure authentication

The workflow uses GitHub Actions OIDC to request a short-lived Azure token. The
Azure client, tenant, and subscription values in the workflow identify the
deployment application and target account; they are identifiers, not passwords
or client secrets. The deployment uses no client secret or publish profile.
`id-token: write` is required for token exchange and `contents: read` is used for
checkout.

Azure's federated credential must exactly match the subject emitted by the GitHub
runner. New repositories created on or after 2026-07-15 use immutable owner and
repository IDs in that subject, for example:

```text
repo:OWNER@OWNER_ID/REPOSITORY@REPOSITORY_ID:ref:refs/heads/main
```

Repositories created before that date keep the earlier format unless they opt in
to immutable subject claims. Repository visibility is a separate claim; public
or private visibility does not change the repository identity in the subject.
Do not infer the subject from the repository URL: use the actual runner subject
and configure Azure trust to match it exactly. Adding a GitHub environment also
changes the subject and requires a corresponding federated credential.

The application receives Website Contributor at the Function App scope so the
publish script can read the app and publish code without subscription-wide
Contributor access.

## Recreate or verify the setup

With an Azure CLI account authorized to manage the deployment application and
assign its app-scoped role, run:

```powershell
./scripts/setup-github-azure.ps1
```

For another repository, pass its `owner/repository` slug and immutable numeric
IDs with `-Repository`, `-RepositoryOwnerId`, and `-RepositoryId`. Set the Azure
target parameters for the Function App being deployed. The script creates a
missing branch trust or app-scoped Website Contributor assignment and reads both
back to verify the result. If the expected branch credential already exists with
the old name-only subject, the script updates it only when its name, issuer,
subject, and audience match the expected legacy credential; otherwise it stops
without changing that credential. The script creates no client secrets and does
not deploy app code.

After the workflow is pushed or merged into `main`, check the first run in
**Actions > Deploy Word Guesser to Azure Functions**. You can also use **Run
workflow** on `main` to retry a deployment. Changes to the app name, resource
group, or public hostname must also update the workflow configuration.

The Azure packaging command includes the app runtime and required deployment
files; this runbook under `docs/` is not copied into the Azure package.

Official references:

- [GitHub Actions immutable subject claims](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims)
- [Azure Login with OpenID Connect](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect)
- [GitHub Actions deployments to Azure Functions](https://learn.microsoft.com/en-us/azure/azure-functions/functions-how-to-github-actions)
- [Website Contributor permissions](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/web-and-mobile#website-contributor)
