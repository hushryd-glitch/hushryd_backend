# Implementation Plan

- [x] 1. Enhance the admin documents page with document grid view






  - [x] 1.1 Update documents page to fetch and display all documents with photos

    - Replace current stats-only view with full document grid
    - Implement responsive grid layout (1-4 columns)
    - Add document card component with photo thumbnail, driver name, type, status
    - Handle image loading errors with placeholder
    - _Requirements: 1.1, 1.2, 1.3_
  - [ ]* 1.2 Write property test for document card rendering
    - **Property 1: Document card displays required information**
    - **Validates: Requirements 1.2**

- [x] 2. Implement status filtering functionality






  - [x] 2.1 Add filter tabs and filtering logic

    - Create filter tabs for pending, approved, rejected, all
    - Implement filter state management
    - Filter documents based on selected status
    - Sort pending documents by upload date (oldest first)
    - _Requirements: 2.1, 2.2, 2.3_
  - [ ]* 2.2 Write property test for filter functionality
    - **Property 2: Filter returns only matching documents**
    - **Validates: Requirements 2.2**
  - [ ]* 2.3 Write property test for pending documents sorting
    - **Property 3: Pending documents sorted by upload date**
    - **Validates: Requirements 2.3**

- [x] 3. Implement document preview modal with actions






  - [x] 3.1 Create document preview modal component

    - Full-size document image display
    - Driver information panel
    - Document metadata display
    - Show approve/reject buttons for pending documents
    - Display rejection reason for rejected documents
    - _Requirements: 1.4, 3.1, 4.1, 5.1, 5.2_
  - [ ]* 3.2 Write property test for action buttons visibility
    - **Property 4: Pending documents show action buttons**
    - **Validates: Requirements 3.1, 4.1**
  - [ ]* 3.3 Write property test for rejection reason display
    - **Property 6: Rejected documents display rejection reason**
    - **Validates: Requirements 5.2**

- [x] 4. Implement approve and reject actions





  - [x] 4.1 Implement document approval functionality

    - Add approve button click handler
    - Call verify API with approved status
    - Refresh document list after approval
    - Update stats after status change
    - _Requirements: 3.2, 3.3, 6.2_

  - [x] 4.2 Implement document rejection with reason modal





    - Create reject modal with reason textarea
    - Add validation for non-empty reason
    - Call verify API with rejected status and reason
    - Refresh document list after rejection
    - _Requirements: 4.2, 4.3, 4.4_
  - [ ]* 4.3 Write property test for rejection validation
    - **Property 5: Rejection requires non-empty reason**
    - **Validates: Requirements 4.4**

- [x] 5. Add statistics display






  - [x] 5.1 Implement stats cards at top of page

    - Display pending, approved, rejected counts
    - Update stats after document status changes
    - _Requirements: 6.1, 6.2_

- [x] 6. Final Checkpoint - Make sure all tests pass





  - Ensure all tests pass, ask the user if questions arise.
