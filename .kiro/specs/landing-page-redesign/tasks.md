# Implementation Plan

- [ ] 1. Set up design system and utility classes





  - [x] 1.1 Create gradient utility classes in globals.css





    - Add gradient classes for purple-pink, blue-cyan, green-emerald, orange-red
    - Add glassmorphism utility classes with backdrop blur
    - Add animation keyframes for floating elements
    - _Requirements: 1.1, 2.1_
  - [ ]* 1.2 Write property test for hover animation timing
    - **Property 11: Hover Animation Timing**
    - **Validates: Requirements 1.5, 9.3**



- [x] 2. Redesign Hero Section with extraordinary visuals


  - [x] 2.1 Create AnimatedBackground component


    - Implement floating gradient shapes with CSS animations
    - Add parallax-ready positioning
    - _Requirements: 1.1_

  - [x] 2.2 Update Hero headline with gradient text effect

    - Change headline to "Share Rides, Save Money" with gradient styling
    - Add animated badge "India's #1 Carpooling Platform"
    - _Requirements: 1.2, 1.3_

  - [x] 2.3 Implement glassmorphism search card

    - Add backdrop blur and semi-transparent background
    - Implement smooth hover effects with scale and shadow
    - _Requirements: 1.4, 1.5_
  - [ ]* 2.4 Write property test for search form validation
    - **Property 3: Search Form Validation**
    - **Validates: Requirements 3.3**
  - [ ]* 2.5 Write property test for search URL parameter generation
    - **Property 4: Search URL Parameter Generation**
    - **Validates: Requirements 3.5**

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Redesign Promo Offers section
  - [ ] 4.1 Create enhanced PromoCard component
    - Implement gradient backgrounds based on offer type
    - Add emoji icons, title, subtitle, and promo code display
    - Implement hover lift effect with enhanced shadow
    - _Requirements: 2.1, 2.2, 2.3_
  - [ ] 4.2 Implement promo code copy functionality
    - Add click handler to copy code to clipboard
    - Show toast notification on successful copy
    - _Requirements: 2.5_
  - [ ] 4.3 Update PromoOffers grid layout
    - Implement responsive grid (4 cols desktop, 2 tablet, 1 mobile)
    - Add proper spacing and alignment
    - _Requirements: 2.4_
  - [ ]* 4.4 Write property test for promo card content completeness
    - **Property 1: Promo Card Content Completeness**
    - **Validates: Requirements 2.2**
  - [ ]* 4.5 Write property test for promo card gradient assignment
    - **Property 2: Promo Card Gradient Assignment**
    - **Validates: Requirements 2.1**
  - [ ]* 4.6 Write property test for responsive grid layout
    - **Property 9: Responsive Grid Layout**
    - **Validates: Requirements 2.4, 10.1, 10.2, 10.3**

- [ ] 5. Redesign Referral Section
  - [ ] 5.1 Create ReferralRewardCard component
    - Implement gradient-bordered cards for ₹150 and ₹250 rewards
    - Add money bag and gift emoji icons
    - Use pink/purple gradient backgrounds
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ] 5.2 Implement referral code display for authenticated users
    - Show unique referral code with copy button when logged in
    - Implement share functionality with native share API fallback
    - _Requirements: 4.4, 4.5_
  - [ ]* 5.3 Write property test for referral code display
    - **Property 12: Referral Code Display for Authenticated Users**
    - **Validates: Requirements 4.4**

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Redesign Safety Section
  - [ ] 7.1 Create TrustBadge component
    - Implement icon, title, and description display
    - Add calming color scheme (blues, greens)
    - Implement hover expansion with micro-animation
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ] 7.2 Add women-only rides highlight
    - Use distinct pink/purple accent for women-only feature
    - Add special badge or indicator
    - _Requirements: 6.5_
  - [ ]* 7.3 Write property test for safety feature content completeness
    - **Property 7: Safety Feature Content Completeness**
    - **Validates: Requirements 6.1, 6.2**

- [ ] 8. Redesign How It Works section
  - [ ] 8.1 Create animated Step component
    - Implement numbered icons with animation
    - Add clear, concise text for each step
    - _Requirements: 5.1, 5.2_
  - [ ] 8.2 Add step connector lines for desktop
    - Implement visual connector between steps
    - Hide connectors on mobile, stack vertically
    - _Requirements: 5.3, 5.5_
  - [ ]* 8.3 Write property test for step rendering
    - **Property 8: How It Works Step Rendering**
    - **Validates: Requirements 5.1**

- [ ] 9. Redesign Testimonials section
  - [ ] 9.1 Create TestimonialCard component
    - Display user photo, name, rating, and review text
    - Implement star rating with gold/yellow filled stars
    - _Requirements: 7.1, 7.3, 7.4_
  - [ ] 9.2 Implement auto-scrolling carousel
    - Add auto-scroll with configurable interval
    - Pause on hover, resume on mouse leave
    - _Requirements: 7.2, 7.5_
  - [ ]* 9.3 Write property test for testimonial card content
    - **Property 5: Testimonial Card Content Completeness**
    - **Validates: Requirements 7.1, 7.3**
  - [ ]* 9.4 Write property test for star rating rendering
    - **Property 6: Star Rating Rendering**
    - **Validates: Requirements 7.4**

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Redesign App Download section
  - [ ] 11.1 Create AppDownload component
    - Add App Store and Google Play buttons with store icons
    - Use dark backgrounds with white text
    - _Requirements: 8.1, 8.3_
  - [ ] 11.2 Add phone mockup display
    - Display app interface mockup image
    - Handle image loading gracefully
    - _Requirements: 8.2_
  - [ ] 11.3 Implement platform detection
    - Detect iOS/Android on mobile devices
    - Highlight relevant store button
    - _Requirements: 8.5_
  - [ ]* 11.4 Write property test for platform detection
    - **Property 13: Platform Detection for App Download**
    - **Validates: Requirements 8.5**

- [ ] 12. Add global animations and polish
  - [ ] 12.1 Implement scroll-triggered animations
    - Add fade-in and slide-up effects for sections
    - Implement staggered animations for child elements
    - _Requirements: 9.1, 9.4_
  - [ ] 12.2 Add skeleton loaders for loading states
    - Implement shimmer animation for loading placeholders
    - _Requirements: 9.5_
  - [ ] 12.3 Ensure all CTA buttons meet touch target requirements
    - Verify minimum 44x44 pixel touch targets on mobile
    - _Requirements: 10.4_
  - [ ]* 12.4 Write property test for CTA button touch target size
    - **Property 10: CTA Button Touch Target Size**
    - **Validates: Requirements 10.4**

- [ ] 13. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
