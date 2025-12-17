# Requirements Document

## Introduction

This feature integrates Google Maps APIs to enhance the ride posting and search experience, and defines the complete driver onboarding and ride posting flow. Drivers login with phone number, upload vehicle documents, wait for operations team verification, then post rides with unique IDs that are visible to passengers. Google Places Autocomplete is used for location selection, and route preview maps display journey paths. Government ID verification is removed from ride posting requirements.

## Glossary

- **Google_Places_API**: Google's Places Autocomplete service that provides location suggestions as users type
- **Google_Maps_API**: Google's Maps JavaScript API for displaying interactive maps and routes
- **Route_Preview**: A visual map display showing the path between pickup and drop-off locations
- **Location_Autocomplete**: An input field that suggests locations as the user types using Google Places API
- **Required_Documents**: Vehicle-related documents needed for driver verification (license, registration, insurance) - excludes government ID/KYC
- **Post_ID**: A unique identifier for each ride post in the format HR-YYYY-NNNNNN
- **Operations_Team**: Admin staff responsible for reviewing and approving driver documents

## Requirements

### Requirement 1

**User Story:** As a driver, I want to login with my phone number and receive OTP, so that I can access the platform securely.

#### Acceptance Criteria

1. WHEN a driver enters a valid phone number THEN the System SHALL send an OTP to that number
2. WHEN a driver enters the correct OTP THEN the System SHALL authenticate the driver and create a session
3. WHEN a new driver logs in for the first time THEN the System SHALL redirect to the document upload page
4. WHEN an existing driver with approved documents logs in THEN the System SHALL redirect to the driver dashboard

### Requirement 2

**User Story:** As a driver, I want to upload my vehicle documents after login, so that I can get verified to post rides.

#### Acceptance Criteria

1. WHEN a driver accesses the document upload page THEN the System SHALL display upload fields for license, registration, and insurance
2. WHEN a driver uploads a document THEN the System SHALL store the document with status 'pending'
3. WHEN a driver has uploaded all required documents THEN the System SHALL notify the operations team for review
4. WHEN a driver views their profile THEN the System SHALL display the status of each uploaded document

### Requirement 3

**User Story:** As an operations team member, I want to review and verify driver documents, so that only legitimate drivers can post rides.

#### Acceptance Criteria

1. WHEN an operations team member views pending documents THEN the System SHALL display the document image and driver details
2. WHEN an operations team member approves a document THEN the System SHALL update the document status to 'approved'
3. WHEN an operations team member rejects a document THEN the System SHALL update the status to 'rejected' with a reason
4. WHEN all required documents are approved THEN the System SHALL update the driver's verification status to 'verified'

### Requirement 4

**User Story:** As a verified driver, I want to post rides with unique IDs, so that each trip can be tracked and referenced.

#### Acceptance Criteria

1. WHEN a verified driver creates a ride post THEN the System SHALL generate a unique Post_ID in format HR-YYYY-NNNNNN
2. WHEN a driver posts a ride THEN the System SHALL store source, destination, scheduled time, available seats, and fare per seat
3. WHEN a driver sets the fare THEN the System SHALL calculate and display estimated earnings
4. WHEN a driver with pending or rejected documents attempts to post THEN the System SHALL block posting with a message showing which documents need attention

### Requirement 5

**User Story:** As a driver, I want to select pickup and drop-off locations using Google Places autocomplete, so that I can accurately specify my route.

#### Acceptance Criteria

1. WHEN a driver types in the pickup location field THEN the System SHALL display Google Places autocomplete suggestions
2. WHEN a driver selects a location from autocomplete suggestions THEN the System SHALL store the place name, formatted address, and coordinates
3. WHEN a driver types in the drop-off location field THEN the System SHALL display Google Places autocomplete suggestions
4. WHEN a location is selected THEN the System SHALL validate that coordinates are within serviceable areas

### Requirement 6

**User Story:** As a driver, I want to see a route preview map when creating a ride, so that I can verify the journey path before posting.

#### Acceptance Criteria

1. WHEN both pickup and drop-off locations are selected THEN the System SHALL display a route preview map
2. WHEN displaying the route preview THEN the System SHALL show the driving path between locations
3. WHEN displaying the route preview THEN the System SHALL show estimated distance and duration
4. WHEN the route cannot be calculated THEN the System SHALL display an error message

### Requirement 7

**User Story:** As a passenger, I want to search for rides using Google Places autocomplete, so that I can easily find rides from and to specific locations.

#### Acceptance Criteria

1. WHEN a passenger types in the source search field THEN the System SHALL display Google Places autocomplete suggestions
2. WHEN a passenger types in the destination search field THEN the System SHALL display Google Places autocomplete suggestions
3. WHEN a passenger searches THEN the System SHALL find rides within the configured radius of selected coordinates
4. WHEN displaying search results THEN the System SHALL show a map with available ride routes

### Requirement 8

**User Story:** As a passenger, I want to see driver ride posts with all details, so that I can choose the best ride for my journey.

#### Acceptance Criteria

1. WHEN a passenger views search results THEN the System SHALL display Post_ID, source, destination, time, seats, fare, and driver rating
2. WHEN a passenger views ride details THEN the System SHALL display a map showing the route with pickup and drop-off markers
3. WHEN displaying ride details THEN the System SHALL show driver name, rating, and vehicle details
4. WHEN displaying ride details THEN the System SHALL exclude sensitive driver information like phone number and personal documents

### Requirement 9

**User Story:** As a driver, I want to post rides without government ID verification, so that I can start operating once my vehicle documents are approved.

#### Acceptance Criteria

1. WHEN a driver has license, registration, and insurance approved THEN the System SHALL allow ride posting
2. WHEN checking ride posting eligibility THEN the System SHALL NOT require government ID/KYC approval
3. WHEN displaying document requirements THEN the System SHALL list only vehicle documents as mandatory for ride posting
4. WHEN a driver uploads KYC documents THEN the System SHALL treat them as optional for ride posting eligibility

