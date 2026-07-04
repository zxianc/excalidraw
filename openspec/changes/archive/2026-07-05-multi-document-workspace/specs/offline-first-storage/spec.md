## ADDED Requirements

### Requirement: Local document persistence via IndexedDB
The system SHALL persist all document data (elements, appState, files) to IndexedDB as the primary local storage, independent of network connectivity.

#### Scenario: Save document offline
- **WHEN** user edits a document while offline (no network)
- **THEN** the document is successfully saved to IndexedDB and the dirty flag is set

#### Scenario: Load document offline
- **WHEN** user switches to a previously saved document while offline
- **THEN** the document loads from IndexedDB with full fidelity

#### Scenario: Survive browser restart
- **WHEN** user closes the browser and reopens the app
- **THEN** all previously saved documents and the manifest are restored from IndexedDB

### Requirement: Manifest persistence
The system SHALL persist the document manifest (folder tree, document metadata) to IndexedDB separately from document content for fast listing without loading all documents.

#### Scenario: Load manifest on startup
- **WHEN** the app initializes
- **THEN** the manifest is loaded from IndexedDB, and the sidebar displays the folder tree and document list

#### Scenario: Manifest survives data changes
- **WHEN** a document is created, renamed, or deleted
- **THEN** the manifest is immediately updated in IndexedDB before any remote sync attempt

### Requirement: Auto-save on every change
The system SHALL automatically save the current document to IndexedDB after a debounced interval following any canvas change.

#### Scenario: Auto-save triggers after edit
- **WHEN** user draws on the canvas and stops for 500ms
- **THEN** the document is saved to IndexedDB automatically

#### Scenario: Rapid successive edits
- **WHEN** user makes multiple rapid changes to the canvas
- **THEN** the auto-save debounce resets on each change, and a single save occurs 500ms after the last change

### Requirement: Storage quota awareness
The system SHALL handle IndexedDB storage quota errors gracefully by notifying the user and preventing data loss.

#### Scenario: Storage quota exceeded
- **WHEN** IndexedDB write fails due to quota exceeded
- **THEN** the system displays a warning message and the current document data is preserved in memory until space is freed

### Requirement: Local-only mode
The system SHALL operate fully in local-only mode when no remote storage is configured, with no sync attempts or error messages related to missing remote config.

#### Scenario: First-time user with no S3 config
- **WHEN** a new user opens the app without configuring cloud sync
- **THEN** all document operations work locally, no sync errors appear, and the sync status shows "Local only"
