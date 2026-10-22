param(
    [string]$Subscription = '0e928795-9229-4a02-a62f-537616f6e5da',
    [string]$Tenant = 'fc091796-6c49-4dbf-8252-1d44c1b3ac17',
    [string]$ResourceGroup = 'rg-word-guesser-brazilsouth',
    [string]$AppName = 'func-word-guesser-6e5da',
    [string]$Repository = 'gusdeoliveira/word-guesser-gpt-mcp',
    [ValidatePattern('^\d+$')]
    [string]$RepositoryOwnerId = '59635709',
    [ValidatePattern('^\d+$')]
    [string]$RepositoryId = '1308416393',
    [ValidatePattern('^[A-Za-z0-9._/-]+$')]
    [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'

function Invoke-AzureJson {
    param([string[]]$Arguments)
    $result = & az @Arguments --only-show-errors -o json
    if ($LASTEXITCODE -ne 0) { throw "Azure CLI failed: $($Arguments -join ' ')" }
    if ($result) {
        # Windows PowerShell 5.1 otherwise emits an empty JSON array as one item.
        $parsed = ($result -join "`n") | ConvertFrom-Json
        foreach ($entry in $parsed) { $entry }
    }
}

$account = Invoke-AzureJson -Arguments @('account', 'show', '--subscription', $Subscription)
if ($account.id -ne $Subscription -or $account.tenantId -ne $Tenant) {
    throw 'Sign into the expected Azure subscription and tenant before running setup.'
}
$scope = "/subscriptions/$Subscription/resourceGroups/$ResourceGroup/providers/Microsoft.Web/sites/$AppName"
$site = Invoke-AzureJson -Arguments @('functionapp', 'show', '--subscription', $Subscription, '--resource-group', $ResourceGroup, '--name', $AppName)
if ($site.id -ne $scope) { throw 'Function App resource ID does not match the expected target.' }

$identityName = 'word-guesser-github-deploy'
$applications = @(Invoke-AzureJson -Arguments @('ad', 'app', 'list', '--display-name', $identityName) | Where-Object { $_.displayName -eq $identityName })
if ($applications.Count -gt 1) { throw 'Multiple deployment applications have this name; select an identity explicitly before continuing.' }
if ($applications.Count -eq 0) {
    $application = Invoke-AzureJson -Arguments @('ad', 'app', 'create', '--display-name', $identityName, '--sign-in-audience', 'AzureADMyOrg')
} else {
    $application = $applications[0]
}
if ($application.signInAudience -ne 'AzureADMyOrg') { throw 'Deployment application must be single tenant.' }

$principals = @(Invoke-AzureJson -Arguments @('ad', 'sp', 'list', '--filter', "appId eq '$($application.appId)'"))
if ($principals.Count -gt 1) { throw 'Multiple service principals found for the deployment application.' }
if ($principals.Count -eq 0) {
    $principal = Invoke-AzureJson -Arguments @('ad', 'sp', 'create', '--id', $application.appId)
} else {
    $principal = $principals[0]
}
if (-not $principal.id) { throw 'Deployment service principal has no object ID.' }

$issuer = 'https://token.actions.githubusercontent.com'
$repositoryParts = $Repository.Split('/')
if ($repositoryParts.Count -ne 2 -or [string]::IsNullOrWhiteSpace($repositoryParts[0]) -or [string]::IsNullOrWhiteSpace($repositoryParts[1])) {
    throw 'Repository must use the owner/repository format.'
}
$owner = $repositoryParts[0]
$repositoryName = $repositoryParts[1]
$subject = "repo:${owner}@${RepositoryOwnerId}/${repositoryName}@${RepositoryId}:ref:refs/heads/$Branch"
$legacySubject = "repo:${Repository}:ref:refs/heads/$Branch"
$audience = 'api://AzureADTokenExchange'
$credentialName = 'github-' + $Branch.Replace('/', '-')
$credentials = @(Invoke-AzureJson -Arguments @('ad', 'app', 'federated-credential', 'list', '--id', $application.id))
$matchingCredentials = @($credentials | Where-Object { $_.issuer -eq $issuer -and $_.subject -eq $subject -and $_.audiences.Count -eq 1 -and $_.audiences[0] -eq $audience })
$namedCredentials = @($credentials | Where-Object { $_.name -eq $credentialName })
if ($matchingCredentials.Count -gt 1 -or $namedCredentials.Count -gt 1) {
    throw "Multiple federated credentials match the expected name or immutable subject for '$credentialName'."
}
if ($matchingCredentials.Count -eq 0) {
    $credentialPath = Join-Path ([IO.Path]::GetTempPath()) ('word-guesser-oidc-' + [Guid]::NewGuid().ToString() + '.json')
    $credential = @{
        name = $credentialName
        issuer = $issuer
        subject = $subject
        audiences = @($audience)
        description = "Word Guesser deployment from $Repository branch $Branch"
    }
    try {
        [IO.File]::WriteAllText($credentialPath, ($credential | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
        if ($namedCredentials.Count -eq 1) {
            $existingCredential = $namedCredentials[0]
            $expectedLegacyCredential = $existingCredential.issuer -eq $issuer -and
                $existingCredential.subject -eq $legacySubject -and
                $existingCredential.audiences.Count -eq 1 -and
                $existingCredential.audiences[0] -eq $audience
            if (-not $expectedLegacyCredential) {
                throw "Federated credential '$credentialName' exists but does not match the expected legacy issuer, subject, and audience; refusing to change it."
            }
            Invoke-AzureJson -Arguments @('ad', 'app', 'federated-credential', 'update', '--id', $application.id, '--federated-credential-id', $credentialName, '--parameters', $credentialPath) | Out-Null
        } else {
            Invoke-AzureJson -Arguments @('ad', 'app', 'federated-credential', 'create', '--id', $application.id, '--parameters', $credentialPath) | Out-Null
        }
    } finally {
        if (Test-Path -LiteralPath $credentialPath) { Remove-Item -LiteralPath $credentialPath }
    }
}

$websiteContributor = 'de139f84-1756-47ae-9be6-808fbbe84772'
$assignments = @(Invoke-AzureJson -Arguments @('role', 'assignment', 'list', '--subscription', $Subscription, '--scope', $scope))
$matchingAssignments = @($assignments | Where-Object { $_.principalId -eq $principal.id -and $_.scope -eq $scope -and $_.roleDefinitionId.EndsWith('/' + $websiteContributor) })
if ($matchingAssignments.Count -eq 0) {
    Invoke-AzureJson -Arguments @('role', 'assignment', 'create', '--subscription', $Subscription, '--assignee-object-id', $principal.id, '--assignee-principal-type', 'ServicePrincipal', '--role', $websiteContributor, '--scope', $scope) | Out-Null
}

$verifiedCredentials = @(Invoke-AzureJson -Arguments @('ad', 'app', 'federated-credential', 'list', '--id', $application.id) | Where-Object { $_.name -eq $credentialName -and $_.issuer -eq $issuer -and $_.subject -eq $subject -and $_.audiences.Count -eq 1 -and $_.audiences[0] -eq $audience })
$verifiedAssignments = @(Invoke-AzureJson -Arguments @('role', 'assignment', 'list', '--subscription', $Subscription, '--scope', $scope) | Where-Object { $_.principalId -eq $principal.id -and $_.scope -eq $scope -and $_.roleDefinitionId.EndsWith('/' + $websiteContributor) })
if ($verifiedCredentials.Count -ne 1 -or $verifiedAssignments.Count -ne 1) {
    throw 'Could not verify the branch trust and app-scoped deployment role after setup.'
}

# These are public identifiers, not credentials. No client secret is created.
[ordered]@{
    clientId = $application.appId
    applicationObjectId = $application.id
    servicePrincipalObjectId = $principal.id
    tenantId = $Tenant
    subscriptionId = $Subscription
    subject = $subject
    issuer = $issuer
    audience = $audience
    role = 'Website Contributor'
    scope = $scope
} | ConvertTo-Json
