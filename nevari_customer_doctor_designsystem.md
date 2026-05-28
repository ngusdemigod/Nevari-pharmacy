## Flow Mobile Design System

### Brand

**Product:** Flow
**Platform:** iOS mobile
**Style:** clean healthcare dashboard, rounded cards, soft gray surfaces, navy primary actions.

---

## Colors

| Token              |       Hex | Usage                            |
| ------------------ | --------: | -------------------------------- |
| Primary Navy       | `#0B326D` | headings, primary buttons, icons |
| Primary Blue Light | `#9CB4DA` | inactive side-menu icons/text    |
| Accent Purple      | `#9B4DFF` | Flow logo, upload link           |
| Text Primary       | `#101828` | main body text                   |
| Text Secondary     | `#6B7280` | labels, helper text              |
| Text Muted         | `#A0A6B2` | placeholders                     |
| Border             | `#DDE2EA` | cards, inputs, dividers          |
| Surface            | `#F4F6F8` | inputs, inactive tabs, cards     |
| White              | `#FFFFFF` | app background                   |
| Warning/Price      | `#FF9900` | product prices                   |
| Danger             | `#FF2D2D` | logout                           |

---

## Typography

| Style         |    Size |  Weight | Usage                          |
| ------------- | ------: | ------: | ------------------------------ |
| Page Title    |    24px | 500–600 | Overview, Orders, Profile      |
| Section Title |    20px |     600 | Appointments, Recent Purchases |
| Step Title    |    18px |     600 | Step 1 of 5                    |
| Body          | 14–16px |     400 | labels, menu items             |
| Caption       |    12px |     400 | dates, helper text             |
| Metric        |    24px |     600 | dashboard numbers              |

Recommended font: **Inter / SF Pro / Poppins-style sans-serif**

---

## Layout

### Screen

* Width: `402px`
* Background: `#FFFFFF`
* Horizontal padding: `20px`
* Top safe area: `44px`
* Main vertical spacing: `16–24px`
* Corner radius system: `12px`, `16px`, `24px`, `999px`

### Header Pattern

Components:

1. Status bar
2. Search bar
3. Menu icon + greeting
4. Page title

Search bar:

* Height: `44px`
* Radius: `24px`
* Border: `1px #DDE2EA`
* Icon left
* Placeholder: “Search here for orders, appointments etc”

---

## Core Components

### 1. Primary Button

Used for: Continue, Book Appointment

```css
height: 48px;
border-radius: 999px;
background: #0B326D;
color: #FFFFFF;
font-size: 16px;
font-weight: 500;
```

### 2. Secondary Button

Used for: Go Back

```css
height: 48px;
border-radius: 999px;
border: 1px solid #0B326D;
background: #FFFFFF;
color: #0B326D;
```

### 3. Segmented Tabs

Used for: Request / Upcoming Visits / Previous Visits, Profile tabs, Appointments tabs

Active:

```css
background: #F4F6F8;
border: 1px solid #DDE2EA;
border-radius: 999px;
color: #4B5563;
```

Inactive:

```css
background: transparent;
color: #7A8494;
```

### 4. Input Field

```css
height: 38–44px;
background: #F4F6F8;
border: 1px solid #DDE2EA;
border-radius: 8px;
padding: 0 12px;
placeholder: #A0A6B2;
```

Textarea:

```css
height: 96–104px;
border-radius: 12px;
```

### 5. Selectable Option Row

Used for care type and clinical requirements.

```css
height: 48px;
background: #F4F6F8;
border: 1px solid #DDE2EA;
border-radius: 8px;
padding: 0 12px;
display: flex;
justify-content: space-between;
```

Right control: radio circle
Stroke: `#0B326D`

### 6. Radio Group

```css
radio-size: 16px;
stroke: #0B326D;
label-color: #6B7280;
gap: 20–28px;
```

### 7. Dashboard Metric Card

```css
width: 48%;
height: 108px;
background: #F4F6F8;
border: 1px solid #DDE2EA;
border-radius: 12px;
padding: 12px;
```

Contains:

* circular icon
* label
* large number

### 8. Appointment List Item

```css
padding: 14px 0;
border-bottom: 1px solid #DDE2EA;
display: flex;
gap: 12px;
```

Content:

* clock icon
* title
* time/date
* Google Meet or nurse name

### 9. Empty State

Used for no appointments/orders.

Components:

* centered pale illustration
* muted message
* optional pill CTA

CTA example:

```css
height: 56px;
border-radius: 999px;
border: 1px solid #0B326D;
```

### 10. Side Navigation Drawer

```css
width: 75%;
background: #FFFFFF;
overlay: rgba(0,0,0,0.15);
padding: 28px 24px;
```

Menu item:

```css
height: 48px;
icon-size: 20px;
color-active: #0B326D;
color-inactive: #9CB4DA;
```

Logout:

```css
color: #FF2D2D;
```

---

## Feature Components

### Request a Nurse Flow

Steps needed:

1. Care Type
2. Patient Details
3. Care Details
4. Clinical Requirements
5. Upload Medical Information

Note: screenshots show two “Step 4” screens; rename upload screen to **Step 5 of 5**.

### Upload Row

```css
height: 48px;
background: #F4F6F8;
border: 1px solid #DDE2EA;
border-radius: 8px;
```

Right icon: upload document icon.

### Appointment Calendar

Components:

* month selector
* previous/next arrows
* calendar grid
* selected date circle
* time input
* appointment reason textarea
* Book Appointment CTA

### Product Row

Components:

* thumbnail `64x64`
* product name
* price in orange
* quantity pill

### Profile Upload

Components:

* avatar preview
* upload dropzone
* upload icon
* purple upload link

### Toggle Switch

Off state:

```css
width: 52px;
height: 32px;
background: #E5E7EB;
thumb: #FFFFFF;
shadow: subtle;
```

---

## Icon Style

* Stroke-based
* Rounded corners
* Navy for active icons
* Pale blue for inactive menu icons
* Light gray circular icon backgrounds in lists

Icon set needed:

* Search
* Menu
* Home
* Orders
* Pharmacy
* Appointments
* Nurse/Stethoscope
* Medical cross
* Profile
* Logout
* Clock
* Upload file
* Basket/order
* Doctor
* Phone
* Arrow left/right
* Calendar

---

## Main Screens Needed

1. Overview dashboard
2. Orders list
3. Empty orders
4. Appointments list
5. Empty appointments
6. Book appointment calendar
7. Request a Nurse — Care Type
8. Request a Nurse — Patient Details
9. Request a Nurse — Care Details
10. Request a Nurse — Clinical Requirements
11. Request a Nurse — Upload Medical Info
12. Upcoming Visits
13. Previous Visits
14. Profile — User
15. Profile — Notification Settings
16. Side navigation drawer
