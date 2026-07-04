# Cloud Sync - S3

**Purpose:** Enable bidirectional sync of documents and folder structure to S3-compatible object storage (AWS S3, Cloudflare R2, MinIO, Alibaba OSS, Tencent COS, etc.) with conflict detection and user-choice resolution, allowing multi-device access without a backend server.

## Requirements

### Requirement: Configure S3 cloud sync
The system SHALL allow the user to configure S3-compatible cloud storage via a Settings dialog, providing endpoint, bucket, access key, secret key, region, and optional path prefix.

#### Scenario: Save valid S3 config
- **WHEN** user enters valid S3 credentials in Settings and clicks "Save"
- **THEN** the config is persisted to local storage and the SyncEngine begins syncing

#### Scenario: Test connection succeeds
- **WHEN** user enters valid S3 credentials and clicks "Test Connection"
- **THEN** the system performs a connectivity check and displays "Connection successful"

#### Scenario: Test connection fails
- **WHEN** user enters invalid S3 credentials and clicks "Test Connection"
- **THEN** the system displays a descriptive error message (e.g., "Access Denied", "Network Error")

#### Scenario: Clear S3 config
- **WHEN** user clicks "Clear Config" in Settings
- **THEN** the S3 config is removed and sync stops; local documents are unaffected

### Requirement: Sync documents to S3
The system SHALL sync document content from local IndexedDB to S3-compatible storage as individual JSON files, organized by folder structure.

#### Scenario: Auto-sync on save
- **WHEN** a document is saved locally (auto-save debounced 500ms after last edit)
- **THEN** within 2 seconds, the document is uploaded to S3 at the correct path (e.g., `root/doc-abc.excalidraw`)

#### Scenario: Sync folder structure
- **WHEN** the manifest changes (document or folder creation/deletion/rename)
- **THEN** the manifest is uploaded to S3 at `__manifest.json`

#### Scenario: Sync embedded assets
- **WHEN** a document contains embedded images or files
- **THEN** binary assets are uploaded to the `assets/` folder with unique filenames

### Requirement: Pull documents from S3 on startup
The system SHALL fetch the remote manifest on app startup and reconcile with local state.

#### Scenario: New documents on remote
- **WHEN** the remote manifest has documents not present locally
- **THEN** those documents are downloaded and added to the local manifest and IndexedDB

#### Scenario: Remote document is newer
- **WHEN** a document exists locally but the remote version has a higher version
- **THEN** the remote version is downloaded and replaces local data if no local dirty flag is set

#### Scenario: No remote configured
- **WHEN** no S3 config is set
- **THEN** the app operates in local-only mode with no sync attempts

### Requirement: Conflict detection and resolution
The system SHALL detect when local and remote versions of a document have both changed since the last sync, and SHALL present the user with a choice dialog.

#### Scenario: Conflict detected
- **WHEN** a document has dirty local changes AND the remote version number is higher than the last known common version
- **THEN** a conflict dialog appears showing document name, local update time, and remote update time

#### Scenario: User chooses "Keep Local"
- **WHEN** user selects "Keep Local" in the conflict dialog
- **THEN** the local version is uploaded to S3, overwriting the remote version, and the conflict is resolved

#### Scenario: User chooses "Use Remote"
- **WHEN** user selects "Use Remote" in the conflict dialog
- **THEN** the remote version is downloaded and replaces local data, discarding local changes

#### Scenario: User chooses "Keep Both"
- **WHEN** user selects "Keep Both" in the conflict dialog
- **THEN** the remote version is saved as the original document, and a new local copy named "Document - Copy YYYY-MM-DD" is created with the local changes

### Requirement: Sync status indicator
The system SHALL display a sync status indicator showing the current sync state.

#### Scenario: Syncing
- **WHEN** a sync operation is in progress
- **THEN** the indicator shows yellow with "Syncing..."

#### Scenario: Synced
- **WHEN** all documents are up to date with remote
- **THEN** the indicator shows green with "Synced"

#### Scenario: Error
- **WHEN** a sync operation fails
- **THEN** the indicator shows red with the error message

#### Scenario: Offline
- **WHEN** the browser detects no network connectivity
- **THEN** the indicator shows gray with "Offline"
