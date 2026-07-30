# NAAV Accounts Enterprise ERP

Enterprise Resource Planning system converted from REST APIs to a robust Node.js REST API backend with SQLite storage.

## Features
- Complete REST API architecture (`/api/orders`, `/api/restaurants`, `/api/expenses`, `/api/reports`, etc.)
- SQLite database storage for reliable data persistence
- Role-based access control (Super Admin, Administrator, Manager, Operator, Viewer)
- Comprehensive financial accounts, rider and restaurant settlements, and day-close snapshots
- Render-ready deployment configuration

## Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open `http://localhost:5000` in your browser.
