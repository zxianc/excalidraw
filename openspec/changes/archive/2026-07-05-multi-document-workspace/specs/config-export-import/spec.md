## ADDED Requirements

### Requirement: Export encrypted S3 config
The system SHALL allow the user to export their S3 configuration as an AES-GCM encrypted string and QR code, protected by a user-chosen password.

#### Scenario: Export config with password
- **WHEN** user enters a password and clicks "Export Config" in Settings
- **THEN** the system encrypts the S3 config (endpoint, bucket, access key, secret key, region, path prefix) using AES-GCM via Web Crypto API, encodes it as base64+QR code, and displays both

#### Scenario: Export without password
- **WHEN** user clicks "Export Config" without entering a password
- **THEN** the system prompts the user to enter a password before proceeding

### Requirement: Import encrypted S3 config
The system SHALL allow the user to import an S3 configuration by pasting an encrypted string or scanning a QR code, then entering the password to decrypt.

#### Scenario: Import with correct password
- **WHEN** user pastes a valid encrypted config string and enters the correct password
- **THEN** the config is decrypted, validated, and applied; the SyncEngine begins syncing

#### Scenario: Import with wrong password
- **WHEN** user pastes an encrypted config string but enters the wrong password
- **THEN** the system displays "Invalid password — could not decrypt config"

#### Scenario: Import malformed data
- **WHEN** user pastes a string that is not a valid encrypted config
- **THEN** the system displays "Invalid config format"

### Requirement: Config import via QR code
The system SHALL support scanning a QR code (via device camera or image upload) to import the encrypted config string.

#### Scenario: Scan QR code from another device
- **WHEN** user displays the QR code on their desktop and scans it with their mobile device camera
- **THEN** the encrypted config string is captured and ready for decryption with the password

### Requirement: Config persistence across sessions
The system SHALL persist the decrypted S3 config in local storage so it survives browser restarts.

#### Scenario: Config survives restart
- **WHEN** user configures S3 sync and closes/reopens the browser
- **THEN** the S3 config is loaded from local storage and sync resumes automatically
