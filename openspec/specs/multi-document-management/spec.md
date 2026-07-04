# Multi-Document Management

**Purpose:** Enable users to create, switch, rename, delete, and duplicate multiple documents within a single Excalidraw session, with visual indicators for document state (dirty/clean). This replaces the single-document model with a workspace that supports managing many drawings without export/import workarounds.

## Requirements

### Requirement: Create a new document
The system SHALL allow the user to create a new empty document with a default name (e.g., "Untitled") via a button in the sidebar or a keyboard shortcut.

#### Scenario: Create document from sidebar
- **WHEN** user clicks the "+" button in the sidebar header
- **THEN** a new document with name "Untitled" is created in the root folder, the sidebar shows the new document, and the canvas switches to the new empty document

#### Scenario: Create document when sidebar is closed
- **WHEN** user presses Cmd/Ctrl+Shift+N with the sidebar closed
- **THEN** a new document is created and the sidebar opens to show it

### Requirement: Switch between documents
The system SHALL allow the user to switch between documents by clicking a document in the sidebar, loading the target document content onto the canvas while saving the current document state.

#### Scenario: Switch to another document
- **WHEN** user has unsaved changes in Document A and clicks Document B in the sidebar
- **THEN** Document A changes are persisted to local storage, Document B content is loaded onto the canvas, and Document A dirty indicator is updated

#### Scenario: Switch to the same document
- **WHEN** user clicks the currently active document in the sidebar
- **THEN** no operation occurs (no-op)

### Requirement: Rename a document
The system SHALL allow the user to rename a document via right-click context menu or inline rename (double-click).

#### Scenario: Rename via prompt
- **WHEN** user right-clicks a document and selects "Rename", enters a new name, and confirms
- **THEN** the document name is updated in the sidebar and persisted to the manifest

#### Scenario: Cancel rename
- **WHEN** user right-clicks a document, selects "Rename", but cancels the prompt
- **THEN** the document name remains unchanged

### Requirement: Delete a document
The system SHALL allow the user to delete a document via right-click context menu with confirmation.

#### Scenario: Delete with confirmation
- **WHEN** user right-clicks a document, selects "Delete", and confirms
- **THEN** the document and its data are removed from local storage, and the sidebar no longer shows it

#### Scenario: Cancel delete
- **WHEN** user right-clicks a document, selects "Delete", but cancels the confirmation
- **THEN** the document remains unchanged

### Requirement: Duplicate a document
The system SHALL allow the user to duplicate a document via right-click context menu, creating a copy with " - Copy" appended to the name.

#### Scenario: Duplicate a document
- **WHEN** user right-clicks "My Drawing" and selects "Duplicate"
- **THEN** a new document named "My Drawing - Copy" appears in the same folder with identical content

### Requirement: Document dirty state indicator
The system SHALL visually indicate when a document has unsaved local changes (dirty state).

#### Scenario: Mark dirty on edit
- **WHEN** user makes any change to the canvas
- **THEN** the document shows a dot or highlight in the sidebar indicating unsaved changes

#### Scenario: Clear dirty on save
- **WHEN** the document is successfully persisted to both local and remote storage
- **THEN** the dirty indicator is cleared
