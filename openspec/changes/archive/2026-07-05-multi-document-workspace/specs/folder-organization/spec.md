## ADDED Requirements

### Requirement: Create a folder
The system SHALL allow the user to create a new folder in the document tree via a button in the sidebar or context menu.

#### Scenario: Create folder in root
- **WHEN** user clicks the folder icon button in the sidebar header
- **THEN** a new folder with default name "New Folder" is created at the root level and appears in the sidebar tree

#### Scenario: Create folder inside another folder
- **WHEN** user right-clicks an existing folder and selects "New Folder"
- **THEN** a new folder is created as a child of the selected folder and appears nested in the tree

### Requirement: Rename a folder
The system SHALL allow the user to rename a folder via right-click context menu.

#### Scenario: Rename folder
- **WHEN** user right-clicks a folder, selects "Rename", enters a new name, and confirms
- **THEN** the folder name is updated throughout the tree and persisted to the manifest

### Requirement: Delete a folder
The system SHALL allow the user to delete an empty folder via right-click context menu with confirmation.

#### Scenario: Delete empty folder
- **WHEN** user right-clicks an empty folder, selects "Delete", and confirms
- **THEN** the folder is removed from the tree and the manifest

#### Scenario: Delete non-empty folder
- **WHEN** user right-clicks a folder that contains documents or subfolders and selects "Delete"
- **THEN** the system SHALL show a warning that the folder is not empty and require explicit confirmation, then delete the folder and all its contents

### Requirement: Collapse and expand folders
The system SHALL allow the user to collapse and expand folders in the tree view by clicking the folder toggle icon.

#### Scenario: Toggle folder
- **WHEN** user clicks the chevron icon next to a folder name
- **THEN** the folder toggles between collapsed (hiding children) and expanded (showing children)

### Requirement: Persistent folder state
The system SHALL persist folder expand/collapse state across sessions.

#### Scenario: Reopen with same folder state
- **WHEN** user collapses some folders, closes the browser, and reopens the app
- **THEN** previously collapsed folders remain collapsed
