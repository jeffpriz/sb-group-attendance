// Example: run SB Group Attendance on Azure Container Apps with its data on
// an Azure Files (SMB) share. The storage account key is read by the
// Container Apps environment from Azure Key Vault (no key in this file, in
// parameters, or in the app).
//
// This is an EXAMPLE, not a complete infrastructure project. It assumes these
// already exist (see docs/azure-container-apps.md for the setup steps):
//   - a Container Apps environment that has the user-assigned identity below
//     assigned to it, and that identity has "Key Vault Secrets User" on the vault
//   - a storage account with a classic SMB file share
//   - a Key Vault secret holding the storage account key
//   - an Azure Container Registry with the app image, and the identity has
//     "AcrPull" on it
//
// Deploy:
//   az deployment group create -g <RESOURCE_GROUP> -f deploy/azure-container-apps/main.bicep \
//     -p environmentName=<ENV_NAME> appName=<APP_NAME> identityName=<IDENTITY_NAME> \
//        storageAccountName=<STORAGE_ACCOUNT> shareName=<SHARE_NAME> \
//        keyVaultName=<KEY_VAULT> keyVaultSecretName=<SECRET_NAME> \
//        acrLoginServer=<REGISTRY>.azurecr.io image=<REGISTRY>.azurecr.io/sb-group-attendance:<TAG>

@description('Location for the container app. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Name of the EXISTING Container Apps environment.')
param environmentName string

@description('Name of the container app to create or update.')
param appName string = 'sb-group-attendance'

@description('Name of the EXISTING user-assigned managed identity (in this resource group) used for Key Vault, ACR pull and the app.')
param identityName string

@description('Name of the EXISTING storage account that holds the file share.')
param storageAccountName string

@description('Name of the EXISTING SMB file share.')
param shareName string

@description('Name of the EXISTING Key Vault that holds the storage account key.')
param keyVaultName string

@description('Name of the Key Vault secret whose value is the storage account key.')
param keyVaultSecretName string

@description('Name of the storage definition (link) in the environment.')
param environmentStorageName string = 'attendance-files'

@description('ACR login server, e.g. myregistry.azurecr.io')
param acrLoginServer string

@description('Full image reference, e.g. myregistry.azurecr.io/sb-group-attendance:1.0.0')
param image string

@description('Port the app listens on inside the container.')
param port int = 3001

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: identityName
}

resource managedEnv 'Microsoft.App/managedEnvironments@2025-07-01' existing = {
  name: environmentName
}

// Link the file share to the environment. `accountKeyVaultProperties` makes
// the environment read the key from Key Vault with the given identity
// (available in GA API versions 2025-07-01 and later).
resource fileShareLink 'Microsoft.App/managedEnvironments/storages@2025-07-01' = {
  parent: managedEnv
  name: environmentStorageName
  properties: {
    azureFile: {
      accountName: storageAccountName
      shareName: shareName
      accessMode: 'ReadWrite'
      accountKeyVaultProperties: {
        identity: identity.id
        // Versionless secret URL (no version segment at the end).
        keyVaultUrl: 'https://${keyVaultName}${environment().suffixes.keyvaultDns}/secrets/${keyVaultSecretName}'
      }
    }
  }
}

resource app 'Microsoft.App/containerApps@2025-07-01' = {
  name: appName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: managedEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: port
        transport: 'auto'
        allowInsecure: false
      }
      // Pull the image from ACR with the managed identity (needs AcrPull).
      registries: [
        {
          server: acrLoginServer
          identity: identity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'app'
          image: image
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'DATA_DIR', value: '/data' }
            { name: 'PORT', value: string(port) }
          ]
          volumeMounts: [
            {
              volumeName: 'attendance-data'
              mountPath: '/data'
            }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: { path: '/api/health', port: port }
              initialDelaySeconds: 3
              periodSeconds: 5
              failureThreshold: 10
            }
            {
              type: 'Liveness'
              httpGet: { path: '/api/health', port: port }
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: { path: '/api/health', port: port }
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      // Exactly one replica: the app coordinates saves inside one process, so
      // two replicas writing the same share could overwrite each other.
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
      volumes: [
        {
          name: 'attendance-data'
          storageType: 'AzureFile'
          storageName: fileShareLink.name
          // The container runs as the non-root `node` user (uid/gid 1000).
          mountOptions: 'uid=1000,gid=1000,dir_mode=0770,file_mode=0660'
        }
      ]
    }
  }
}

output appUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
