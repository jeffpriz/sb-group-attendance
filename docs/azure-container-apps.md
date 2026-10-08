# Deploying to Azure Container Apps

This guide runs SB Group Attendance on **Azure Container Apps (ACA)**, with its JSON data on an **Azure Files SMB share** and the storage account key kept in **Azure Key Vault**.

```
                  Key Vault secret (storage account key)
                         │ read by the ENVIRONMENT's managed identity
                         ▼
 Container Apps environment ── storage link "attendance-files" ──► Azure Files SMB share
                         │
                         ▼ volume (mountOptions uid=1000,gid=1000,…)
 Container app (1 replica) ── /data ── DATA_DIR=/data
```

**The app never sees the key.** The key belongs to the *environment's* storage definition (`Microsoft.App/managedEnvironments/storages`). ACA mounts the share into the container at `/data`, and the app just reads and writes files there because `DATA_DIR=/data`. Don't add the key to the container app as a secret or environment variable; it isn't used.

Placeholders look like `<THIS>`. Commands are for bash with the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli). Some flags used below are from the `containerapp` CLI extension and are marked *preview* in the CLI reference:

```bash
az extension add --name containerapp --upgrade
```

## What's confirmed in the docs (checked October 2026)

| Topic | Status | Source |
| ----- | ------ | ------ |
| Environment storage can reference the key in Key Vault natively: `azureFile.accountKeyVaultProperties { keyVaultUrl, identity }` | Yes, in ARM/Bicep API **2025-07-01 and later** (GA API versions; first added in 2025-02-02-preview). `identity` is a managed identity resource ID, or `System` for system-assigned. | [managedEnvironments/storages reference](https://learn.microsoft.com/azure/templates/microsoft.app/managedenvironments/storages) (updated 2026-09-21), [change log](https://learn.microsoft.com/azure/templates/microsoft.app/change-log/managedenvironments/storages) |
| CLI support for the Key Vault reference: `az containerapp env storage set --azure-file-key-vault-secret-url … --azure-file-key-vault-identity …` | Yes, in the `containerapp` extension. These two flags are marked **Preview**. | [az containerapp env storage](https://learn.microsoft.com/cli/azure/containerapp/env/storage) (2026-09-01) |
| Assigning a managed identity to the **environment**: `az containerapp env identity assign` | Yes. The command group is **Preview** in the CLI. Bicep: `identity` on `Microsoft.App/managedEnvironments`. | [az containerapp env identity](https://learn.microsoft.com/cli/azure/containerapp/env/identity), [managedEnvironments reference](https://learn.microsoft.com/azure/templates/microsoft.app/managedenvironments) |
| SMB volumes accept `mountOptions` (comma-separated string on the **volume** in the container app template) | Yes. Property name: `template.volumes[].mountOptions`. | [containerApps reference](https://learn.microsoft.com/azure/templates/microsoft.app/containerapps) (updated 2026-09-21), [Use storage mounts in ACA](https://learn.microsoft.com/azure/container-apps/storage-mounts) (2026-08-21) |
| `uid=1000,gid=1000,dir_mode=…,file_mode=…` as mount options | The ACA docs link to the Azure Files mountOptions guide, which recommends exactly this least-privilege form. **Not tested in ACA by us.** | [mountOptions settings for Azure Files](https://learn.microsoft.com/troubleshoot/azure/azure-kubernetes/storage/mountoptions-settings-azure-files) (2026-07-24) |
| Pulling images from ACR with a managed identity (`AcrPull` role) | Yes | [Image pull with managed identity](https://learn.microsoft.com/azure/container-apps/managed-identity-image-pull) |
| Health probes (Startup / Liveness / Readiness, `httpGet`) | Yes | [Health probes in ACA](https://learn.microsoft.com/azure/container-apps/health-probes) |
| Key Vault role needed by the identity reading the secret | **Key Vault Secrets User** is the role the ACA docs use for Key Vault secret references in *apps*. Assuming the same for the environment storage link is reasonable but **not stated explicitly** in the storage docs. | [Manage secrets in ACA](https://learn.microsoft.com/azure/container-apps/manage-secrets) (2026-09-04) |
| Whether the environment re-reads the Key Vault secret automatically after rotation | **Not documented.** Follow the rotation steps below and don't rely on automatic pickup. | — |

> **Note:** the ACA SMB tutorial ([storage-mounts-azure-files](https://learn.microsoft.com/azure/container-apps/storage-mounts-azure-files), dated 2025-06-09) still says only a raw account key is supported. The newer API and CLI references above supersede it. The CLI reference also lists a **preview** `--azure-file-identity` flag for mounting with a managed identity and *no key at all* (needs the "Storage File Data SMB MI Admin" role and "Managed Identity for SMB" enabled on the storage account). That isn't in the GA ARM API (`2026-07-01`), so this guide doesn't use it. It's worth revisiting once it's GA.

## Prerequisites

- A **storage account** with a classic SMB **file share** (e.g. `attendance`). Because this setup mounts with the account key, the storage account must allow **shared key access**. ACA's SMB mount uses port 445. If the storage account has a firewall, the environment must be VNet-integrated and allowed by the storage account's network rules.
- A **Key Vault** using Azure RBAC.
- An **Azure Container Registry** (ACR).
- A **Container Apps environment**.
- One **user-assigned managed identity** used for: reading the key from Key Vault (assigned to the *environment*), and pulling the image (assigned to the *app*). You can use separate identities if you prefer.

```bash
RG=<RESOURCE_GROUP>
ENV=<CONTAINERAPPS_ENVIRONMENT>
APP=sb-group-attendance
STORAGE=<STORAGE_ACCOUNT>
SHARE=<FILE_SHARE>
KV=<KEY_VAULT>
SECRET=<KV_SECRET_NAME>            # e.g. attendance-storage-key
ACR=<REGISTRY_NAME>                # without .azurecr.io
IDENTITY_ID=$(az identity show -g $RG -n <IDENTITY_NAME> --query id -o tsv)
IDENTITY_PRINCIPAL=$(az identity show -g $RG -n <IDENTITY_NAME> --query principalId -o tsv)
```

## 1. Build and push the image

```bash
az acr build -r $ACR -t sb-group-attendance:1.0.0 .
```

## 2. Put the storage account key in Key Vault

```bash
# Read the key and store it without printing it
az keyvault secret set --vault-name $KV --name $SECRET \
  --value "$(az storage account keys list -g $RG -n $STORAGE --query '[0].value' -o tsv)" \
  --output none
```

## 3. Give the identity access

```bash
# Read the secret (scope it to the vault, or to the single secret)
az role assignment create --assignee-object-id $IDENTITY_PRINCIPAL --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope $(az keyvault show -n $KV --query id -o tsv)

# Pull images from ACR
az role assignment create --assignee-object-id $IDENTITY_PRINCIPAL --assignee-principal-type ServicePrincipal \
  --role AcrPull \
  --scope $(az acr show -n $ACR --query id -o tsv)

# The ENVIRONMENT uses this identity to read Key Vault (preview command group)
az containerapp env identity assign -g $RG -n $ENV --user-assigned $IDENTITY_ID
```

Role assignments can take a few minutes to take effect.

## 4. Link the file share to the environment (key from Key Vault)

### Option A (recommended): native Key Vault reference

The environment reads the key from Key Vault itself. Nothing secret passes through your shell or deployment.

```bash
az containerapp env storage set -g $RG -n $ENV \
  --storage-name attendance-files \
  --storage-type AzureFile \
  --azure-file-account-name $STORAGE \
  --azure-file-share-name $SHARE \
  --access-mode ReadWrite \
  --azure-file-key-vault-secret-url "https://$KV.vault.azure.net/secrets/$SECRET" \
  --azure-file-key-vault-identity $IDENTITY_ID
```

Bicep equivalent (also in [`deploy/azure-container-apps/main.bicep`](../deploy/azure-container-apps/main.bicep)):

```bicep
resource fileShareLink 'Microsoft.App/managedEnvironments/storages@2025-07-01' = {
  parent: managedEnv
  name: 'attendance-files'
  properties: {
    azureFile: {
      accountName: storageAccountName
      shareName: shareName
      accessMode: 'ReadWrite'
      accountKeyVaultProperties: {
        identity: identity.id   // or 'System'
        keyVaultUrl: 'https://${keyVaultName}${environment().suffixes.keyvaultDns}/secrets/${keyVaultSecretName}'
      }
    }
  }
}
```

### Option B (fallback): read the key from Key Vault at deploy time

Use this if Option A isn't available to you. The key is copied into the environment's storage definition when you run the command or deployment, so **you must re-run it after every key rotation**.

```bash
az containerapp env storage set -g $RG -n $ENV \
  --storage-name attendance-files \
  --storage-type AzureFile \
  --azure-file-account-name $STORAGE \
  --azure-file-share-name $SHARE \
  --access-mode ReadWrite \
  --azure-file-account-key "$(az keyvault secret show --vault-name $KV -n $SECRET --query value -o tsv)"
```

In Bicep, `getSecret()` can only be passed to a module parameter marked `@secure()`:

```bicep
// main.bicep
resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = { name: keyVaultName }

module shareLink 'share-link.bicep' = {
  name: 'attendance-share-link'
  params: {
    environmentName: environmentName
    storageAccountName: storageAccountName
    shareName: shareName
    storageAccountKey: kv.getSecret(keyVaultSecretName)
  }
}

// share-link.bicep
param environmentName string
param storageAccountName string
param shareName string
@secure()
param storageAccountKey string

resource managedEnv 'Microsoft.App/managedEnvironments@2025-07-01' existing = { name: environmentName }

resource link 'Microsoft.App/managedEnvironments/storages@2025-07-01' = {
  parent: managedEnv
  name: 'attendance-files'
  properties: {
    azureFile: {
      accountName: storageAccountName
      accountKey: storageAccountKey
      shareName: shareName
      accessMode: 'ReadWrite'
    }
  }
}
```

The person or pipeline running the deployment needs permission to read the secret during the deployment. For Bicep `getSecret()`, the vault must also allow ARM template deployment (`enabledForTemplateDeployment`).

## 5. Create the container app

The easiest route is the example Bicep file, which creates the storage link (Option A) and the app together:

```bash
az deployment group create -g $RG -f deploy/azure-container-apps/main.bicep \
  -p environmentName=$ENV appName=$APP identityName=<IDENTITY_NAME> \
     storageAccountName=$STORAGE shareName=$SHARE \
     keyVaultName=$KV keyVaultSecretName=$SECRET \
     acrLoginServer=$ACR.azurecr.io image=$ACR.azurecr.io/sb-group-attendance:1.0.0
```

It sets up the following. If you build the app another way (portal, CLI + YAML), configure the same:

| Setting | Value | Why |
| ------- | ----- | --- |
| Image pull | `registries: [{ server: '<ACR>.azurecr.io', identity: '<IDENTITY_ID>' }]` | Pull from ACR with the managed identity (no registry password). |
| Volume | `name: attendance-data`, `storageType: AzureFile`, `storageName: attendance-files`, `mountOptions: 'uid=1000,gid=1000,dir_mode=0770,file_mode=0660'` | The container runs as the non-root `node` user (uid/gid 1000). These options make the share's files owned by and writable for that user. |
| Volume mount | `volumeName: attendance-data`, `mountPath: /data` | Where the share appears in the container. |
| Environment variables | `DATA_DIR=/data`, `PORT=3001` | The app saves to `/data/groups/*.json`. |
| Ingress | external, `targetPort: 3001` | |
| Scale | `minReplicas: 1`, `maxReplicas: 1` | See [one replica](#why-exactly-one-replica). `minReplicas: 1` also avoids cold starts from scaling to zero. |
| Revision mode | `Single` | |
| Probes | Startup, Liveness and Readiness: `httpGet` on `/api/health`, port 3001 | `/api/health` returns 503 if `/data` isn't writable (e.g. the share is unavailable), so ACA restarts or stops routing to the replica. |

CLI + YAML alternative: create the app with `az containerapp create … --user-assigned $IDENTITY_ID --registry-identity $IDENTITY_ID --registry-server $ACR.azurecr.io --env-vars DATA_DIR=/data PORT=3001 --target-port 3001 --ingress external --min-replicas 1 --max-replicas 1`. Then export it with `az containerapp show -o yaml > app.yaml`, add the following under `properties.template`, and apply with `az containerapp update -n $APP -g $RG --yaml app.yaml`:

```yaml
    containers:
    - name: app
      image: <ACR>.azurecr.io/sb-group-attendance:1.0.0
      env:
      - name: DATA_DIR
        value: /data
      - name: PORT
        value: "3001"
      volumeMounts:
      - volumeName: attendance-data
        mountPath: /data
      probes:
      - type: Startup
        httpGet: { path: /api/health, port: 3001 }
        periodSeconds: 5
        failureThreshold: 10
      - type: Liveness
        httpGet: { path: /api/health, port: 3001 }
        periodSeconds: 30
      - type: Readiness
        httpGet: { path: /api/health, port: 3001 }
        periodSeconds: 10
    scale:
      minReplicas: 1
      maxReplicas: 1
    volumes:
    - name: attendance-data
      storageType: AzureFile
      storageName: attendance-files
      mountOptions: uid=1000,gid=1000,dir_mode=0770,file_mode=0660
```

### Check it worked

```bash
az containerapp logs show -n $APP -g $RG --tail 50
```

Look for `Data folder: /data (from DATA_DIR)`. If you see `Cannot create data folder` or `is not writable`, the mount options or share permissions are wrong. After creating a group in the app, a file should appear in the share under `groups/`.

## Why exactly one replica

The app writes each group's JSON file safely within **one** process: saves are queued per group, and each file is written to a temp file and renamed into place. Two replicas sharing the same Azure Files share don't coordinate, so two leaders saving the same group at the same moment could lose one change. Keep `minReplicas = maxReplicas = 1`. For a church attendance app, one small replica (0.5 vCPU / 1 GiB) is plenty.

When a new revision is deployed in Single revision mode, the old and new replica can briefly run at the same time during the switchover. Avoid deploying while someone is actively taking attendance.

## Rotating the storage account key

Use the storage account's two keys so the share is never left with an invalid key:

1. Put **key2** in Key Vault: `az keyvault secret set --vault-name $KV --name $SECRET --value "$(az storage account keys list -g $RG -n $STORAGE --query '[1].value' -o tsv)" --output none`
2. Re-run the step 4 `az containerapp env storage set …` command (Option A or B) so the environment picks up the new value. Whether the environment refreshes Option A automatically isn't documented, so do this either way.
3. Restart the app so the share is mounted again with the new key: `az containerapp revision restart -n $APP -g $RG --revision $(az containerapp show -n $APP -g $RG --query properties.latestRevisionName -o tsv)`
4. Check the logs and the app, then regenerate **key1**: `az storage account keys renew -g $RG -n $STORAGE --key primary`. Next time, rotate back the other way.

## Troubleshooting

- **Container exits with `Cannot create data folder /data/groups` / `not writable`:** the volume is missing `mountOptions: uid=1000,gid=1000,…`, or the storage link is `ReadOnly`.
- **Mount errors / revision won't start:**
  - Check that the storage link's account name, share name and Key Vault secret URL are right.
  - Check the identity is assigned to the **environment** and has **Key Vault Secrets User**.
  - Check the storage account allows shared key access.
  - Check that the network allows port 445 from the environment.
- **Health probe failing:** `curl https://<app-fqdn>/api/health` should return `{"ok":true,"dataWritable":true}`.

## Local development

You don't need any of this to work on the app locally. See [Local development](../README.md#local-development) in the README: `npm install`, then `npm run dev`. Data goes to `./data`.
