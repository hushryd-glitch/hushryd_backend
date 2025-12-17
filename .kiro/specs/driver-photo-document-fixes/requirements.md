# Requirements Document

## Introduction

This feature addresses two critical issues in the HushRyd platform:
1. Missing implementation for selfie with car and vehicle photo uploads on the driver frontend
2. Document approval/rejection errors in the admin operations panel ("Invalid document ID format") and synchronization of review comments to the driver dashboard

## Glossary

- **Driver_Document_System**: The system component responsible for managing driver document uploads, storage, and verification
- **Admin_Operations_Panel**: The administrative interface used by operations staff to review and verify driver documents
- **Document_ID**: A MongoDB ObjectId string that uniquely identifies a document within a driver's document array
- **Presigned_URL**: A time-limited URL that provides secure access to documents stored in S3
- **Rejection_Reason**: A text comment provided by admin when rejecting a document, explaining why it was rejected

## Requirements

### Requirement 1

**User Story:** As a driver, I want to upload selfie with car and vehicle photos, so that I can complete my profile with all optional documents.

#### Acceptance Criteria

1. WHEN a driver navigates to the document upload page THEN the Driver_Document_System SHALL display upload options for selfie_with_car and vehicle_photo document types
2. WHEN a driver selects a file for selfie_with_car or vehicle_photo THEN the Driver_Document_System SHALL validate the file type (JPEG, PNG, PDF) and size (max 5MB)
3. WHEN a driver confirms upload of selfie_with_car or vehicle_photo THEN the Driver_Document_System SHALL store the document and display it in the uploaded documents grid
4. WHEN a driver views their uploaded documents THEN the Driver_Document_System SHALL display selfie_with_car and vehicle_photo documents with their current status (pending, approved, rejected)

### Requirement 2

**User Story:** As an admin, I want to approve or reject driver documents without errors, so that I can efficiently verify driver profiles.

#### Acceptance Criteria

1. WHEN an admin clicks approve on a document THEN the Admin_Operations_Panel SHALL send the correct document ID format to the backend API
2. WHEN an admin clicks reject on a document and provides a reason THEN the Admin_Operations_Panel SHALL send the correct document ID format and reason to the backend API
3. WHEN the backend receives a document verification request THEN the Driver_Document_System SHALL validate the document ID is a valid MongoDB ObjectId before processing
4. WHEN a document verification succeeds THEN the Admin_Operations_Panel SHALL refresh the document list and display a success message

### Requirement 3

**User Story:** As a driver, I want to see admin comments on my rejected documents, so that I know what to fix when re-uploading.

#### Acceptance Criteria

1. WHEN an admin rejects a document with a comment THEN the Driver_Document_System SHALL store the rejection reason with the document
2. WHEN a driver views their dashboard THEN the Driver_Document_System SHALL display rejected documents with their rejection reasons prominently
3. WHEN a driver views the document upload page THEN the Driver_Document_System SHALL show the rejection reason for each rejected document
4. WHEN a document status changes THEN the Driver_Document_System SHALL make the updated status and reason available to the driver immediately upon page refresh

### Requirement 4

**User Story:** As a driver, I want to re-upload a rejected document, so that I can fix the issues and get my document approved.

#### Acceptance Criteria

1. WHEN a driver uploads a document of a type that was previously rejected THEN the Driver_Document_System SHALL replace the rejected document with the new upload
2. WHEN a rejected document is replaced with a new upload THEN the Driver_Document_System SHALL set the document status to pending (under review)
3. WHEN a rejected document is replaced THEN the Driver_Document_System SHALL clear the previous rejection reason
4. WHEN a driver re-uploads a rejected document THEN the Driver_Document_System SHALL delete the old rejected file from S3 storage
5. WHEN a driver successfully re-uploads a document THEN the Driver_Document_System SHALL display a success message confirming the document is under review

### Requirement 5

**User Story:** As an operations admin, I want to see re-uploaded documents for review, so that I can verify the driver has fixed the issues.

#### Acceptance Criteria

1. WHEN a driver re-uploads a rejected document THEN the Admin_Operations_Panel SHALL display the new document with pending status
2. WHEN viewing a re-uploaded document THEN the Admin_Operations_Panel SHALL show the document as a fresh submission requiring review
3. WHEN a driver re-uploads a document THEN the Admin_Operations_Panel SHALL update the pending documents count in the statistics
