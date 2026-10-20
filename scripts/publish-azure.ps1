param(
    [string]$Subscription = '0e928795-9229-4a02-a62f-537616f6e5da',
    [string]$ResourceGroup = 'rg-word-guesser-brazilsouth',
    [string]$AppName = 'func-word-guesser-6e5da',
    [switch]$SkipPackaging
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$packageRoot = Join-Path $projectRoot 'dist/azure'
$zipPath = Join-Path $projectRoot 'dist/word-guesser-azure.zip'
foreach ($requiredFile in @('host.json', 'package.json', 'server/src/index.js', 'dist/web/index.html', 'node_modules/@modelcontextprotocol/sdk/package.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $packageRoot $requiredFile))) {
        throw "Missing packaged asset: $requiredFile. Run build:azure and install production dependencies first."
    }
}

# Preserve forward slashes in ZIP entry names when packaging on Windows for Linux.
if (-not $SkipPackaging) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zipStream = [IO.File]::Open($zipPath, [IO.FileMode]::Create)
    $archive = New-Object IO.Compression.ZipArchive($zipStream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        Get-ChildItem -LiteralPath $packageRoot -File -Recurse -Force | ForEach-Object {
            $entryName = $_.FullName.Substring($packageRoot.Length + 1).Replace('\', '/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally {
        $archive.Dispose()
        $zipStream.Dispose()
    }
}
if (-not (Test-Path -LiteralPath $zipPath)) { throw 'Deployment ZIP is missing.' }
Write-Output ('Package size: {0:N1} MB' -f ((Get-Item -LiteralPath $zipPath).Length / 1MB))

$resourceId = "/subscriptions/$Subscription/resourceGroups/$ResourceGroup/providers/Microsoft.Web/sites/$AppName"
$siteJson = az rest --method get --url "https://management.azure.com${resourceId}?api-version=2024-04-01" --subscription $Subscription -o json
if ($LASTEXITCODE -ne 0) { throw 'Could not read Function App configuration.' }
$site = ($siteJson -join "`n") | ConvertFrom-Json
$origin = 'https://' + $site.properties.defaultHostName
$scmHost = $site.properties.enabledHostNames | Where-Object { $_ -like '*.scm.*' } | Select-Object -First 1
if (-not $scmHost) { throw 'Function App has no SCM deployment hostname.' }

az functionapp config appsettings set --name $AppName --resource-group $ResourceGroup --subscription $Subscription --settings "WIDGET_DOMAIN=$origin" -o none
if ($LASTEXITCODE -ne 0) { throw 'Could not set the dedicated widget origin.' }

$cloudJson = az cloud show -o json
if ($LASTEXITCODE -ne 0) { throw 'Could not determine Azure cloud.' }
$cloud = ($cloudJson -join "`n") | ConvertFrom-Json
$tokenResource = $cloud.endpoints.appServiceResourceId
if (-not $tokenResource -and $cloud.name -eq 'AzureCloud') {
    # Azure CLI 2.53 predates this endpoint property; current Azure CLI defines this audience.
    $tokenResource = 'https://appservice.azure.com'
}
if (-not $tokenResource) { throw 'Could not determine App Service token audience for this cloud.' }
$accessToken = az account get-access-token --resource $tokenResource --subscription $Subscription --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $accessToken) { throw 'Could not obtain a deployment token.' }
$headers = @{ Authorization = "Bearer $accessToken"; 'Cache-Control' = 'no-cache' }

# Flex Consumption uses OneDeploy /api/publish, without a remote build.
Write-Output "Publishing to $origin"
$response = Invoke-WebRequest -UseBasicParsing -Uri "https://$scmHost/api/publish?RemoteBuild=False&Deployer=word_guesser" -Method Post -InFile $zipPath -ContentType 'application/zip' -Headers $headers -TimeoutSec 180
Write-Output "Upload accepted: HTTP $($response.StatusCode)"
for ($attempt = 1; $attempt -le 120; $attempt++) {
    Start-Sleep -Seconds 5
    $deployment = Invoke-RestMethod -Uri "https://$scmHost/api/deployments/latest" -Headers $headers -TimeoutSec 30
    Write-Output "Deployment status: $($deployment.status) (complete: $($deployment.complete))"
    if ($deployment.status -eq 4) {
        Write-Output "Deployment succeeded: $($deployment.id)"
        Write-Output "MCP endpoint: $origin/mcp"
        exit 0
    }
    if ($deployment.status -in @(3, 5, 6)) { throw "Deployment failed; status $($deployment.status), id $($deployment.id)." }
}
throw 'Deployment did not complete within ten minutes. Check SCM deployment logs before retrying.'
