# Word Guesser Azure Functions deployment

Status: Deployed

Authorization: user requested creation after reviewing the Functions hosting assessment and proposed Brazil South target.

## Current change: minimal resources (2026-10-19)

Authorization: user explicitly requested keeping only the Function App, hosting plan and storage to simplify the deployment and avoid optional costs. This authorizes removing the four monitoring resources identified in the live inventory and disconnecting their configuration. No new resource, subscription or region selection is involved.

Plan:
1. Verify the four monitoring resources are not shared, and record the retained runtime/storage configuration.
2. Remove monitoring resources/settings/role from Bicep and sampling configuration from host.json; update hosting/privacy documentation.
3. Compile and validate Bicep, review what-if, validate the updated package, and complete the Azure validation workflow.
4. Delete only telemetry app settings and the four exact monitoring resource IDs; retain the existing storage identity roles and deployment package.
5. Publish the updated host/privacy assets, verify MCP behavior and confirm exactly three resources remain.

Application Insights, Log Analytics, smart failure detection and its action group are optional and will be removed. No always-ready instances are configured. Function executions and storage can still incur usage charges; no zero-cost guarantee is made. Past deployment evidence below is historical.

Progress: completed on 2026-10-20. Exactly three active resources remain; updated host/privacy files published and public MCP behavior verified.

### Minimal-resource validation proof (2026-10-20)

- Azure skill core validation helper: OVERALL PASS (CLI/auth, Bicep build, ARM validate and what-if).
- Resource-level what-if reviewed separately: existing monitoring resources are Ignore under incremental deployment, so deletion uses the explicit four-ID cleanup script. No ARM redeployment of the core resources is needed for this change. The helper's line-based Create/Modify/Delete counts include property changes and are not resource counts.
- `.azure/cleanup-monitoring.ps1` preflight: PASS; exact seven-resource inventory, unchanged Node 22 / 512 MB / maximum 40 / no always-ready instances, existing storage package location and system identity verified. No other indexed resources reference the monitoring setup; the game app's own connection is intentionally removed.
- Host JSON (source and staged): valid; Application Insights sampling removed. Only host.json and public/privacy.html are changed in the existing production package, preserving executable and widget assets.
- `node scripts/check-mcp.mjs http://localhost:8791`: PASS against that staged production package. No application executable code changed; rebuild/unit-test reruns are unnecessary for these configuration/static-page edits.
- Static RBAC review: only the three existing resource-scoped storage roles remain; optional monitoring publisher role removed with its target resource. Runtime and deployment identity stay unchanged.
- Privacy/hosting documentation updated. Existing working-tree changes preserved; no Git staging, commits or stashes requested or performed.
- Current user instruction to keep only three resources explicitly authorizes deletion of the four monitoring resources. Azure guidance to enable Application Insights is overridden by this requested minimal setup.

### Minimal-resource execution

- `.azure/cleanup-monitoring.ps1 -Execute`: PASS. Removed both Application Insights settings, its hidden link tag, the failure alert, Application Insights component, Log Analytics workspace and alert action group. Standard workspace deletion used, without a force purge.
- Final ARM inventory: `func-word-guesser-6e5da`, `plan-word-guesser`, `stwgypciqab3k7fnq` only.
- Live IAM: all three original storage roles remain assigned to the same Function App identity.
- OneDeploy: succeeded, id `1b50134e-6122-4ebc-b483-df2bcf8b7125`. Only host.json and public/privacy.html were updated in the existing production package; executable and bundled widget files are unchanged.
- `node scripts/check-mcp.mjs https://func-word-guesser-6e5da.azurewebsites.net`: PASS after publication (public pages, initialization/notification, tools, widget origin/content, English/Portuguese, valid/invalid guesses, retry behavior and GET 405).
- Live privacy page contains the updated monitoring disclosure; app-setting names confirm no APPLICATIONINSIGHTS_/APPINSIGHTS_ settings remain.
- Final Azure plugin `group_resource_list`: exactly the three retained resources, all Brazil South. No optional monitoring resources were recreated by publishing.
- Temporary local smoke server stopped. Function executions/storage remain usage billed; historical charges are unaffected by deletion.

## Target

- Subscription: Azure subscription 1 (0e928795-9229-4a02-a62f-537616f6e5da)
- Tenant: fc091796-6c49-4dbf-8252-1d44c1b3ac17
- Region: Brazil South
- New dedicated resource group: rg-word-guesser-brazilsouth
- Runtime: Node 22, Functions v4, Flex Consumption, self-hosted MCP custom-handler preview
- Authentication: public game with no user login; managed identity for Azure storage
- Deployment recipe: Azure CLI with checked-in subscription-scope Bicep templates; no azd dependency

## Original scope (2026-10-02)

Create the function app, Flex plan, host/deployment storage, managed identity and Application Insights resources. Preserve existing game/UI changes. Add the Functions host configuration, a reproducible Linux deployment package, a configurable widget origin, and fail-fast checks for missing assets.

## Steps

1. Research current custom-handler and Flex infrastructure configuration.
2. Implement deployment artifacts and production startup.
3. Build, test and exercise the packaged MCP server locally.
4. Validate infrastructure, roles, quota and resource names; run the Azure validation workflow.
5. Provision the new resources and upload the application package.
6. Check the public HTTPS health, tools, resources and representative tool calls.

## Cost and limits

Flex Consumption uses 512 MB instances, a maximum of 40 instances (the supported minimum), and no always-ready instances. Functions execution and storage can incur charges. The optional monitoring resources and their ingestion are being removed. Public OpenAI submission remains a separate task.

## Progress

- [x] Azure CLI and plugin authenticated; Owner role confirmed.
- [x] Web/Storage registered; Brazil South Flex capability confirmed.
- [x] Existing Function App inventory empty; policy restrictions checked.
- [x] Application prepared.
- [x] Local verification passed.
- [x] Azure validation passed.
- [x] Resources provisioned.
- [x] Code deployed and public endpoint verified.

## Validation checklist

- Azure CLI login, subscription and regional availability.
- Bicep compilation, subscription deployment validation and what-if.
- Application build, unit tests and packaged MCP smoke check.
- Static managed identity role review and assignment permissions.
- Record command results and resolve errors before marking Validated.

All validation checks pass:
- [x] Core validation helper: CLI, authentication, build, validate and what-if.
- [x] Docker build: not applicable; compiled Node package.
- [x] Azure policy review: audit initiative; writes/deletes MFA; West Europe restriction does not affect Brazil South.

## Role Assignment Verification

Status: Verified. The function app's system-assigned identity receives Storage Blob Data Owner, Storage Queue Data Contributor and Storage Table Data Contributor scoped to its dedicated host/deployment storage account. Monitoring Metrics Publisher is scoped to Application Insights for AAD telemetry ingestion. The deployment user has subscription Owner, including role-assignment permissions. Local game testing uses no Azure data access.

## Section 7: Validation Proof

Verified 2026-10-01/02 (Brazil time/UTC):

- `npm run build:azure`: PASS; bundled web build, typecheck and compiled backend package.
- `npm test`: PASS; 2 files, 10 tests.
- `npm ci --omit=dev --ignore-scripts --prefix dist/azure`: PASS; production dependencies installed.
- `node scripts/check-mcp.mjs http://localhost:8790`: PASS; public pages, initialize, tools, complete UI resource, locale selection, valid/invalid guesses and deterministic retries.
- Azure skill `validate-deployment.ps1 -Scope sub -Location brazilsouth -Template ./infra/main.bicep -Parameters ./infra/main.parameters.json -Subscription 0e928795-9229-4a02-a62f-537616f6e5da`: OVERALL PASS; authenticated account, Bicep compilation, ARM validation and what-if (Create 13, Modify 0, Delete 0).
- Static roles: PASS; resource-scoped data roles and managed identity telemetry.
- Quota/provider/policy: PASS for deployment validation; regional capability checked with Azure plugin/API; final creation still subject to live regional capacity.
- Validation workflow uses a local copy with the enum parser adjusted for Windows PowerShell 5.1; step logic is unchanged.
- Pre-deploy subscription and region were presented in the assessment and authorized by the user's request to create it. The dedicated resource group does not yet exist; no name/location conflict. AZD-specific steps do not apply to the Azure CLI recipe.

Resolved: Bicep float quota encoded using JSON. Azure-hosted checks exposed an idle standalone SSE GET timeout; the stateless endpoint now explicitly returns HTTP 405 for GET, as permitted by the MCP transport specification. Backend compilation, all 10 unit tests and the packaged smoke check passed after the fix. Infrastructure is unchanged. No outstanding pre-deployment validation failures.

## Deployment progress

- Infrastructure deployment `word-guesser-20261002`: Succeeded.
- Function App: `func-word-guesser-6e5da`; Azure plugin reports Running.
- Initial OneDeploy package: Succeeded, id `d1363084-e6b3-436b-9407-e68e859d7296`.
- HTTPS checks passed through public pages, MCP initialize, tools/resource metadata, language selection, guesses, retries and errors; final standalone SSE check exposed the issue described above.
- Final OneDeploy package: Succeeded, id `2b4ce4db-21ea-4286-9ede-ab27f6adee3e`.
- `node scripts/check-mcp.mjs https://func-word-guesser-6e5da.azurewebsites.net`: PASS on 2026-10-02; public pages, initialization/notification, both tools, bundled widget and matching dedicated origin, locale selection, accepted/rejected guesses, retries, error results and standalone GET HTTP 405.
- Public site: https://func-word-guesser-6e5da.azurewebsites.net/
- ChatGPT Developer Mode MCP URL: https://func-word-guesser-6e5da.azurewebsites.net/mcp (no authentication).
- Azure portal resource: https://portal.azure.com/#resource/subscriptions/0e928795-9229-4a02-a62f-537616f6e5da/resourceGroups/rg-word-guesser-brazilsouth/providers/Microsoft.Web/sites/func-word-guesser-6e5da/overview
- No OpenAI public submission was performed; domain challenge, packaging/review assets, dictionary provenance and ChatGPT web/mobile UI testing remain.

### Live Role Verification

PASS. Azure CLI `az role assignment list --scope <storage-or-insights-id> --query <function-principal-filter>` confirmed all four roles for principal `8410de16-d02a-410e-85be-e0ac7267babc`: Storage Blob Data Owner, Storage Queue Data Contributor and Storage Table Data Contributor at `stwgypciqab3k7fnq`; Monitoring Metrics Publisher at `appi-word-guesser`. Azure plugin's role-list tool returned an internal FileNotFoundException; CLI verification succeeded.
