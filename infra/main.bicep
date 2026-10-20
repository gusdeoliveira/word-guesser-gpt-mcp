targetScope = 'subscription'

param location string = 'brazilsouth'
param resourceGroupName string = 'rg-word-guesser-brazilsouth'
param appName string = 'func-word-guesser-6e5da'

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
  }
}

output functionAppName string = app.outputs.functionAppName
output functionAppHostname string = app.outputs.functionAppHostname
output functionAppId string = app.outputs.functionAppId
output resourceGroupName string = group.name
output storageAccountName string = app.outputs.storageAccountName
output managedIdentityPrincipalId string = app.outputs.managedIdentityPrincipalId
