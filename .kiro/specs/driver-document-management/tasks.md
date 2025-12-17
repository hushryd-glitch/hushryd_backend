# Implementation Plan

- [x] 1. Set up AWS S3 infrastructure and service






  - [x] 1.1 Install AWS SDK and configure environment variables

    - Add @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner packages
    - Add S3 configuration to environment.js (bucket name, region, credentials)
    - Update .env.example with required AWS variables
    - _Requirements: 4.1, 4.2_
  - [x] 1.2 Create S3 service with upload, delete, and presigned URL methods


    - Implement uploadFile method with unique key generation
    - Implement deleteFile method
    - Implement getPresignedUrl method with configurable expiry
    - Implement generateDocumentKey helper following the key structure pattern
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ]* 1.3 Write property test for S3 key uniqueness and structure
    - **Property 2: S3 Key Uniqueness and Structure**
    - **Validates: Requirements 4.1, 4.2**

- [x] 2. Update document service for S3 integration






  - [x] 2.1 Update Driver model schema with S3 fields


    - Add s3Key, s3Bucket, originalFilename, contentType, fileSize fields
    - Keep url field for backward compatibility during migration

    - _Requirements: 4.1_
  - [x] 2.2 Modify submitDocument to upload to S3 instead of local storage

    - Accept file buffer instead of file path
    - Generate S3 key and upload file
    - Store S3 metadata in document record
    - _Requirements: 4.1, 4.2_
  - [x] 2.3 Implement deleteDocument method for pending documents


    - Validate document belongs to driver
    - Check document status is pending
    - Delete from S3 and remove from database
    - _Requirements: 3.1, 3.2_
  - [ ]* 2.4 Write property test for pending document deletion
    - **Property 4: Pending Document Deletion**
    - **Validates: Requirements 3.1, 4.4**
  - [ ]* 2.5 Write property test for approved document protection
    - **Property 5: Approved Document Protection**
    - **Validates: Requirements 3.2**
  - [x] 2.6 Implement getDriverDocumentsWithUrls method


    - Retrieve all documents for a driver
    - Generate presigned URLs for each document
    - Include all required fields (type, uploadedAt, status, rejectionReason)
    - _Requirements: 1.1, 1.2, 1.4, 4.3_
  - [ ]* 2.7 Write property test for document retrieval completeness
    - **Property 1: Document Retrieval Completeness**
    - **Validates: Requirements 1.1, 1.2, 1.4**
  - [x] 2.8 Implement getDocumentWithUrl method for single document


    - Generate fresh presigned URL
    - Return document with URL and expiry information
    - _Requirements: 1.3, 5.3_
  - [ ]* 2.9 Write property test for presigned URL generation
    - **Property 3: Presigned URL Generation**
    - **Validates: Requirements 1.3, 4.3, 5.2, 5.3**

- [x] 3. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.


- [x] 4. Update driver routes for document management


  - [x] 4.1 Update POST /api/driver/documents to use S3 upload


    - Modify multer to use memory storage instead of disk
    - Pass file buffer to document service
    - Return document with presigned URL
    - _Requirements: 4.1_

  - [x] 4.2 Add DELETE /api/driver/documents/:documentId endpoint

    - Authenticate driver
    - Validate ownership
    - Call deleteDocument service method
    - Return success/error response
    - _Requirements: 3.1, 3.2_

  - [x] 4.3 Add GET /api/driver/documents/:documentId/url endpoint
    - Generate fresh presigned URL for document
    - Return URL with expiry timestamp
    - _Requirements: 1.3, 5.3_

  - [x] 4.4 Add GET /api/driver/profile/complete endpoint

    - Return driver profile with all documents
    - Include presigned URLs for all documents
    - _Requirements: 5.1_
  - [ ]* 4.5 Write property test for complete profile retrieval
    - **Property 6: Complete Profile Retrieval**
    - **Validates: Requirements 5.1**

- [x] 5. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update frontend DocumentUpload component


  - [x] 6.1 Add file preview functionality before upload


    - Create preview state for selected file
    - Display image preview for image files
    - Display PDF icon with filename for PDF files
    - Add confirm/cancel buttons for preview
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 6.2 Add document thumbnail display in document list
    - Fetch documents with presigned URLs
    - Display thumbnail images for each document
    - Show document type, status, and upload date
    - Display rejection reason for rejected documents
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 6.3 Add full-size document preview modal
    - Create modal component for document viewing
    - Load full-size image via presigned URL
    - Handle URL refresh if expired

    - _Requirements: 1.3_
  - [x] 6.4 Add delete functionality for pending documents

    - Add delete button for pending documents only
    - Show confirmation dialog before deletion
    - Call delete API and update UI on success
    - Display error message on failure
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 7. Update admin DocumentVerification component





  - [x] 7.1 Enhance document display with presigned URLs


    - Update to use presigned URLs for document images
    - Handle URL refresh for expired URLs
    - _Requirements: 5.2, 5.3_
  - [x] 7.2 Add driver profile information display


    - Show driver name, phone, email alongside documents
    - Display verification status
    - _Requirements: 5.1_

- [ ] 8. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
