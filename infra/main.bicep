targetScope = 'subscription'

param location string = 'brazilsouth'
param resourceGroupName string = 'rg-word-guesser-brazilsouth'
param appName string = 'func-word-guesser-6e5da'
param widgetDomain string = ''

resource group 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: { application: 'word-guesser' }
}
module app './functions.bicep' = {
  name: 'word-guesser-functions'
  scope: group
  params: {
    location: location
    appName: appName
    widgetDomain: empty(widgetDomain) ? 'https://${appName}.azurewebsites.net' : widgetDomain
  }
}

output functionAppName string = app.outputs.functionAppName
output functionAppHostname string = app.outputs.functionAppHostname
output functionAppId string = app.outputs.functionAppId
output resourceGroupName string = group.name
output storageAccountName string = app.outputs.storageAccountName
output managedIdentityPrincipalId string = app.outputs.managedIdentityPrincipalId
