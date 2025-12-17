# Implementation Plan

- [x] 1. Add optional document types to driver frontend






  - [x] 1.1 Update DocumentUpload.jsx to include optional documents section

    - Add OPTIONAL_DOCUMENTS array with selfie_with_car and vehicle_photo types
    - Render optional documents section below required documents
    - Use same upload flow as required documents
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [ ]* 1.2 Write property test for file validation
    - **Property 1: File validation rejects invalid inputs**
    - **Validates: Requirements 1.2**

- [x] 2. Fix document ID format error in admin operations






  - [x] 2.1 Update operations page to properly extract document IDs

    - Ensure document IDs are converted to strings before API calls
    - Add validation to check ID format before sending request
    - Fix handleApproveDocument and handleRejectDocument functions
    - _Requirements: 2.1, 2.2, 2.4_
  - [ ]* 2.2 Write property test for document ID validation
    - **Property 2: Document ID validation**
    - **Validates: Requirements 2.3**

- [x] 3. Ensure rejection comments display on driver side






  - [x] 3.1 Verify Dashboard.jsx displays rejection reasons correctly

    - Check that rejected documents section shows rejectionReason field
    - Ensure driver status API returns document rejection reasons
    - _Requirements: 3.2_
  - [x] 3.2 Verify DocumentUpload.jsx displays rejection reasons


    - Check that rejection reasons appear for rejected documents
    - Ensure re-upload option is available for rejected documents
    - _Requirements: 3.3_
  - [ ]* 3.3 Write property test for rejection reason round-trip
    - **Property 3: Rejection reason round-trip**
    - **Validates: Requirements 3.1, 3.4**

- [x] 4. Implement document re-upload flow

  - [x] 4.1 Update documentService.submitDocument to handle re-uploads


    - Check if a rejected document of the same type exists
    - Delete old S3 file when replacing rejected document
    - Update existing document instead of creating new one
    - Reset status to 'pending' and clear rejection metadata
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 4.2 Update driver frontend to show re-upload success message

    - Display confirmation that document is now under review
    - Refresh document list after successful re-upload
    - _Requirements: 4.5_
  - [ ]* 4.3 Write property test for re-upload replaces rejected document
    - **Property 4: Re-upload replaces rejected document**
    - **Validates: Requirements 4.1, 4.2, 4.3**
  - [ ]* 4.4 Write property test for re-upload clears rejection metadata
    - **Property 5: Re-upload clears rejection metadata**
    - **Validates: Requirements 4.2, 4.3**

- [x] 5. Verify operations panel shows re-uploaded documents


  - [x] 5.1 Test operations panel displays re-uploaded documents correctly

    - Verify pending status is shown for re-uploaded documents
    - Verify pending documents count updates correctly
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 6. Checkpoint - Ensure all tests pass


  - Ensure all tests pass, ask the user if questions arise.
