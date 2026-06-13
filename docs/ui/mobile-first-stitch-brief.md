# LendMap Mobile-First UI Structure Brief

**Audience:** UI design generator / Stitch / product designer  
**Product:** LendMap PWA  
**Primary device:** Mobile phone, 360-430px width  
**Secondary device:** Tablet and desktop dashboard  
**Tone:** Field-operations tool: fast, legible, trustworthy, practical.

---

## 1. Product Summary

LendMap is an internal PWA for a small lending/cooperative operation. Surveyors use it in the field to inspect areas, manage borrowers, and record payments with evidence. Owners use it to monitor performance, risk, collection activity, audit events, and field coverage.

The app must feel like a working mobile tool, not a marketing page. The first screen after login should be the operational workspace.

---

## 2. Roles

### Owner

Owner needs cross-surveyor visibility.

Primary screens:
- Dashboard
- Map
- Nasabah
- Audit

Main jobs:
- See business health quickly.
- Monitor payment collection.
- Compare borrower risk.
- Review field coverage in Sukabumi.
- Check audit and offline sync status.
- Export borrower data.

### Surveyor

Surveyor needs fast field input.

Primary screens:
- Map
- Nasabah
- Setoran

Main jobs:
- See assigned Sukabumi markers.
- Add or inspect survey area markers.
- Review assigned borrowers.
- Record payment amount.
- Store payment offline if signal is poor.

---

## 3. Mobile Navigation Model

Use bottom navigation on mobile.

Owner bottom nav:
- Dashboard
- Peta
- Nasabah
- Audit

Surveyor bottom nav:
- Peta
- Nasabah
- Setoran

Mobile nav requirements:
- Fixed at bottom.
- Large touch targets, minimum 48px height.
- Icon + short label.
- Active state must be obvious.
- Content must have bottom padding so nav never covers controls.

Desktop navigation:
- Left sidebar.
- Sticky under header.
- Same menu items as mobile.

---

## 4. Global Mobile App Shell

### Header

Mobile header should be compact:
- Brand label: `LendMap PWA`
- Page/product title: `Operasi lapangan`
- Current user and queue count
- Role switch: Owner / Surveyor
- Online/offline toggle

Avoid long explanatory text on mobile. It can appear on tablet/desktop.

### Content Surface

Use one main content surface below header.

Mobile behavior:
- Full-width.
- Small padding.
- No nested cards inside large decorative cards.
- Prefer stacked sections.
- Avoid horizontal tables unless a mobile card alternative exists.

---

## 5. Screen Structure

### Owner Dashboard

Purpose: one-minute business overview.

Mobile hierarchy:
1. Page title: Dashboard owner
2. Metric grid, 2 columns:
   - Nasabah aktif
   - Outstanding
   - Setoran bulan ini
   - Nasabah macet
3. Tren setoran compact chart
4. Distribusi score
5. Setoran terbaru as stacked mobile rows

Desktop hierarchy:
- Metric grid 4 columns.
- Chart and score distribution side-by-side.
- Full table for recent payments.

### Map

Purpose: see field coverage in Sukabumi.

Mobile hierarchy:
1. Page title: Peta survei Sukabumi
2. OpenStreetMap map, 58-62vh preferred height
3. Live location tracking card
4. Marker summary
5. Marker list
6. Add marker action

Map markers:
- Potensial: yellow
- Bagus: green
- Kurang prospektif: clay/red

Map requirements:
- Center Sukabumi.
- Show visible markers.
- Popup contains status, notes, and coordinate.
- Must work inside mobile viewport without forcing page sideways.
- Support foreground live location while the app is open.
- Show location permission states: idle, requesting, tracking, denied, unavailable, error.
- Show last seen and GPS accuracy when tracking is active.
- Do not imply background tracking; PWA foreground tracking is the supported mode.

### Nasabah

Purpose: borrower list and risk status.

Mobile hierarchy:
1. Page title: Nasabah
2. Export action for owner
3. Borrower cards

Borrower card content:
- Name
- Address
- Score badge
- Loan amount
- Installment amount
- Due date
- Status

Card requirements:
- Score badge wraps below name if needed.
- Currency must not overflow.
- Cards should be easy to scan with one hand.

### Setoran

Purpose: fast payment input.

Mobile hierarchy:
1. Page title: Input setoran
2. Customer select
3. Amount input
4. Status preview
5. Primary action:
   - Online: `Catat setoran`
   - Offline: `Simpan ke queue offline`
6. Recent payment list

Requirements:
- Input controls at least 48px high.
- Primary action full width.
- Offline mode must be visually clear.

### Audit & Sync

Purpose: owner visibility into data changes and offline queue.

Mobile hierarchy:
1. Page title: Audit & sync
2. Queue metrics, 2 columns
3. Sync action
4. Audit rows

Audit row content:
- Actor
- Action
- Table

---

## 6. Component Inventory

Global components:
- App header
- Role segmented control
- Online/offline toggle
- Bottom navigation
- Desktop sidebar
- Page section title
- Metric tile
- Status badge
- Score badge
- Payment badge
- Data card
- Mobile row list
- Primary button
- Select input
- Currency input
- Map panel

---

## 7. Visual Direction

Use a practical Indonesian field-operations palette:
- Ink: near-black green
- Field: warm light background
- Moss: primary green
- Clay: risk/error
- Maize: warning/potential
- River: information/secondary

The UI should be calm and readable outdoors. Avoid decorative gradients, oversized hero sections, or landing-page composition.

---

## 8. Responsive Rules

Mobile first:
- 360px width must be fully usable.
- Bottom nav fixed.
- Main content has safe bottom padding.
- Use 2-column metric grids only when values fit.
- Avoid desktop tables on mobile; use row cards.
- Map height should fit a phone screen without hiding all actions below it.

Tablet:
- Wider card grids.
- Header controls can align horizontally.

Desktop:
- Sidebar navigation.
- More dense dashboard layout.
- Tables allowed.

---

## 9. Current MVP Constraints

Current MVP uses:
- Local seed data
- OpenStreetMap/Leaflet for Sukabumi map
- Foreground geolocation tracking while app is open
- Simulated offline queue
- Simulated audit feed
- CSV export in browser

Production integration still needed:
- Supabase Auth
- Supabase Postgres
- RLS policies
- Storage photo upload
- Realtime updates
- Edge Functions for push/export

Design should not assume these integrations are complete, but should leave clear states for loading, empty, offline, sync failed, and permission denied.
