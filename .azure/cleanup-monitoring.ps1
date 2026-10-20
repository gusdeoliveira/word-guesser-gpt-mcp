param([switch]$Execute)
$ErrorActionPreference = 'Stop'
$subscription = '0e928795-9229-4a02-a62f-537616f6e5da'
$group = 'rg-word-guesser-brazilsouth'
$app = 'func-word-guesser-6e5da'
$prefix = "/subscriptions/$subscription/resourceGroups/$group/providers"
$insightsId = "$prefix/Microsoft.Insights/components/appi-word-guesser"
$workspaceId = "$prefix/Microsoft.OperationalInsights/workspaces/log-word-guesser"
$actionId = "$prefix/Microsoft.Insights/actionGroups/Application Insights Smart Detection"
$ruleId = "$prefix/Microsoft.AlertsManagement/smartDetectorAlertRules/Failure Anomalies - appi-word-guesser"
$siteId = "$prefix/Microsoft.Web/sites/$app"
$deleteIds = @($ruleId, $insightsId, $workspaceId, $actionId)

function Read-AzJson([string[]]$CliArgs) {
    $output = & az @CliArgs -o json
    if ($LASTEXITCODE -ne 0) { throw "Azure read failed: $($CliArgs[0]) $($CliArgs[1])" }
    return (($output -join "`n") | ConvertFrom-Json)
}

$resources = @(Read-AzJson @('resource', 'list', '--subscription', $subscription, '--resource-group', $group, '--query', '[].{id:id,name:name,type:type}'))
$core = @($resources | Where-Object { $_.id -notin $deleteIds })
if ($core.Count -ne 3 -or
    @($core | Where-Object { $_.type -ieq 'Microsoft.Web/sites' -and $_.name -eq $app }).Count -ne 1 -or
    @($core | Where-Object { $_.type -ieq 'Microsoft.Web/serverfarms' -and $_.name -eq 'plan-word-guesser' }).Count -ne 1 -or
    @($core | Where-Object { $_.type -ieq 'Microsoft.Storage/storageAccounts' -and $_.name -eq 'stwgypciqab3k7fnq' }).Count -ne 1) {
    throw 'Resource inventory differs from the approved three core resources plus four monitoring resources.'
}

# Inspect indexed references throughout this subscription before deleting shared-capable resources.
$graphBody = @{
    subscriptions = @($subscription)
    query = "Resources | where id !in~ ('$insightsId', '$workspaceId', '$actionId', '$ruleId', '$siteId') | where tostring(properties) contains '$workspaceId' or tostring(properties) contains '$actionId' or tostring(properties) contains '$insightsId' | project id, name, type"
    options = @{ resultFormat = 'objectArray' }
} | ConvertTo-Json -Depth 8
$bodyPath = Join-Path $PSScriptRoot 'monitoring-reference-query.json'
[IO.File]::WriteAllText($bodyPath, $graphBody, (New-Object Text.UTF8Encoding($false)))
$references = Read-AzJson @('rest', '--method', 'post', '--url', 'https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01', '--body', "@$bodyPath", '--subscription', $subscription)
if (@($references.data).Count -gt 0) {
    $references.data | ConvertTo-Json -Depth 8 | Write-Output
    throw 'Another resource references the monitoring resources; cleanup stopped.'
}

$siteDocument = Read-AzJson @('rest', '--method', 'get', '--url', "https://management.azure.com${siteId}?api-version=2024-04-01", '--subscription', $subscription)
$site = [PSCustomObject]@{ id=$siteDocument.id; identity=$siteDocument.identity.principalId; state=$siteDocument.properties.state; hostname=$siteDocument.properties.defaultHostName; plan=$siteDocument.properties.serverFarmId; functionAppConfig=$siteDocument.properties.functionAppConfig; tagNames=@($siteDocument.tags.PSObject.Properties.Name) }
$settingNames = @(Read-AzJson @('functionapp', 'config', 'appsettings', 'list', '--name', $app, '--resource-group', $group, '--subscription', $subscription, '--query', '[].name'))
$telemetrySettings = @($settingNames | Where-Object { $_ -match '^(APPLICATIONINSIGHTS_|APPINSIGHTS_)' })
$snapshot = @{ checkedUtc = [DateTime]::UtcNow.ToString('o'); retainedResources = $core; removeResources = @($resources | Where-Object { $_.id -in $deleteIds }); site = $site; settingNames = $settingNames; telemetrySettingNames = $telemetrySettings; externalReferences = @($references.data) }
$snapshot | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'monitoring-preflight.json') -Encoding UTF8
Write-Output 'Dependency check passed: no other indexed resources reference this monitoring setup.'
$snapshot | ConvertTo-Json -Depth 20 | Write-Output
if (-not $Execute) { exit 0 }

if ($telemetrySettings.Count -gt 0) {
    az functionapp config appsettings delete --name $app --resource-group $group --subscription $subscription --setting-names @telemetrySettings -o none
    if ($LASTEXITCODE -ne 0) { throw 'Could not disconnect Application Insights; nothing will be deleted.' }
}
$remainingSettings = @(Read-AzJson @('functionapp', 'config', 'appsettings', 'list', '--name', $app, '--resource-group', $group, '--subscription', $subscription, '--query', '[].name'))
if (@($remainingSettings | Where-Object { $_ -match '^(APPLICATIONINSIGHTS_|APPINSIGHTS_)' }).Count -gt 0) { throw 'Telemetry settings remain; deletion stopped.' }
$insightsTags = @($site.tagNames | Where-Object { $_ -match '^hidden-link:.*app-insights' })
if ($insightsTags.Count -gt 0) {
    az tag update --resource-id $siteId --operation Delete --tags @insightsTags --subscription $subscription -o none
    if ($LASTEXITCODE -ne 0) { throw 'Could not remove stale Application Insights link tags.' }
}

foreach ($resourceId in $deleteIds) {
    if ($resourceId -notlike "$prefix/*" -or $resourceId -notin $deleteIds) { throw 'Unexpected deletion scope.' }
    if (@($resources | Where-Object { $_.id -ieq $resourceId }).Count -eq 0) { continue }
    Write-Output "Removing approved monitoring resource: $resourceId"
    az resource delete --ids $resourceId --subscription $subscription -o none
    if ($LASTEXITCODE -ne 0) { throw 'Resource deletion failed; inspect Azure state before retrying.' }
}
$after = @(Read-AzJson @('resource', 'list', '--subscription', $subscription, '--resource-group', $group, '--query', '[].{id:id,name:name,type:type}'))
$after | ConvertTo-Json -Depth 8 | Write-Output
if ($after.Count -ne 3 -or @($after | Where-Object { $_.id -notin $core.id }).Count -gt 0) { throw 'Final resource inventory is not the approved three resources.' }
Write-Output 'PASS: only the Function App, Flex plan and storage account remain.'
