# CLAUDE.md — Fotolio Project Rules

## ⛔ CRITICAL RULES — NEVER BREAK THESE

### Files you must NEVER modify without explicit user approval:
- `src/components/ClientGallery.jsx` — WORKING, TESTED, DO NOT TOUCH
- `src/hooks/useUserSubscription.js` — WORKING, TESTED, DO NOT TOUCH  
- `src/firebase.js` — WORKING, TESTED, DO NOT TOUCH
- `src/r2.js` — WORKING, TESTED, DO NOT TOUCH
- `src/components/LandingPage.jsx` — WORKING, TESTED, DO NOT TOUCH
- `src/components/LandingPage.css` — WORKING, TESTED, DO NOT TOUCH
- `src/components/PhotographerSite.jsx` — WORKING, TESTED, DO NOT TOUCH
- `src/components/PhotographerSite.css` — WORKING, TESTED, DO NOT TOUCH
- `src/components/Register.jsx` — WORKING, TESTED, DO NOT TOUCH
- `src/components/SiteEditor.jsx` — WORKING, TESTED, DO NOT TOUCH
- `src/App.jsx` — DO NOT TOUCH routing or existing routes
- `src/main.jsx` — DO NOT TOUCH

### Workflow rules:
1. **Always create a new branch** before making changes: `git checkout -b feature/folder-support`
2. **Create NEW files** whenever possible instead of editing existing ones
3. **Never delete or rename** existing functions, components, props, or state variables
4. **Never change** existing import paths in files you didn't create
5. **Run `npm run build`** after every change to verify nothing is broken
6. **If build fails**, fix the error before making any more changes
7. **Ask the user** before modifying any file not listed in the task spec below

## 📁 Project Structure
```
src/
├── components/
│   ├── AdminGalleryForm.jsx    — Gallery creation/edit form (will need SMALL edit)
│   ├── AdminGalleryTable.jsx   — Gallery list table (will need SMALL edit)
│   ├── AdminSelections.jsx     — Client selections management
│   ├── ClientGallery.jsx       — ⛔ DO NOT TOUCH — Client-facing gallery view
│   ├── Dashboard.jsx           — Main dashboard (will need SMALL edit)
│   ├── Dashboard.css           — Dashboard styles
│   ├── GalleryDetailView.jsx   — Gallery detail management (will need edit)
│   ├── SubscriptionSection.jsx — Subscription plans
│   └── ...
├── hooks/
│   └── useUserSubscription.js  — ⛔ DO NOT TOUCH
├── utils/
│   └── galleryUtils.js         — Gallery utility functions
├── pages/
│   └── Settings.jsx            — User settings
├── firebase.js                 — ⛔ DO NOT TOUCH
├── r2.js                       — ⛔ DO NOT TOUCH
└── App.jsx                     — ⛔ DO NOT TOUCH routing
```

## 🛠 Tech Stack
- React (Vite)
- Firebase Auth + Firestore
- Cloudflare R2 (via `r2.js` helper)
- react-router-dom v6
- lucide-react for icons
- react-masonry-css for grid layout
- yet-another-react-lightbox for lightbox

## 🎨 Design Language
- Apple-inspired, clean, minimal
- Font: 'DM Sans' for body, 'DM Serif Display' for headings
- Colors: #1d1d1f (dark), #86868b (muted), #bf9b30 (accent gold)
- Border radius: 10-16px for cards
- Use existing CSS class patterns from Dashboard.css