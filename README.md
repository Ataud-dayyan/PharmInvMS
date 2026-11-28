# 🏥 Pharmacy Inventory & Prescription Management System (PharmInvMS)

[![.NET](https://img.shields.io/badge/.NET-8.0-512BD4)](https://dotnet.microsoft.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED)](https://www.docker.com/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 🌐 Live Deployment

- **Frontend Portal (Render Static Site):** [https://pharminvmsys.onrender.com](https://pharminvmsys.onrender.com)
- **Backend Web API (Render Docker Service):** [https://pharminvms.onrender.com](https://pharminvms.onrender.com)
- **API Health Check:** [https://pharminvms.onrender.com/health](https://pharminvms.onrender.com/health)
- **Database:** Neon Serverless PostgreSQL

> **Note:** The backend runs on Render's free tier and spins down after 15 minutes of inactivity. The first request after an idle period may take 30–50 seconds while the container wakes up.

---

## 📋 Overview

**PharmInvMS** is a full-stack, role-based Pharmacy Inventory and Prescription Management System built with **ASP.NET Core 8**, **Entity Framework Core**, **PostgreSQL**, and a vanilla **HTML/CSS/JavaScript** frontend. It enforces JWT authentication with refresh tokens, Role-Based Access Control (RBAC), atomic prescription dispensing with automatic stock deduction, and real-time low-stock and expiration alerts.

### 🎯 Key Features

- **🔐 JWT Authentication & RBAC:** Stateless bearer authentication with token refresh, revocation, and role-restricted endpoints.
- **💊 Real-Time Inventory Tracking:** Manage medication batches, unit pricing, stock quantities (`PATCH`), and expiration dates with automatic low-stock and 30-day expiry alerts.
- **📋 Atomic Prescription Fulfillment:** Pharmacists review incoming pending prescriptions and authorize dispensing, deducting stock balances in a single consistent workflow.
- **👨‍⚕️ Multi-Role Workflows:** Dedicated portals and permissions for Admins, Pharmacists, Doctors, and Patients.
- **🐳 Containerized Cloud Deployment:** Multi-stage `Dockerfile` deployed on Render alongside a managed Neon PostgreSQL database.

### 👥 User Roles

| Role           | Permissions                                                                 |
|----------------|-----------------------------------------------------------------------------|
| **Admin**      | Full user management, role administration, and inventory oversight          |
| **Pharmacist** | Register/update/delete drugs, monitor stock & expiry alerts, fill orders    |
| **Doctor**     | Create digital prescriptions and view patient prescription records          |
| **Patient**    | View personal prescription history and fulfillment status                   |

---

## 🏗️ Project Structure

```text
PharmInvMS/
├── Dockerfile                                 # Multi-stage .NET 8 build & runtime image for Render
├── frontend/                                  # Static web client (deployed via Render Static Site)
│   ├── index.html                             # Login portal
│   ├── inventory.html                         # Pharmacist stock & alerts dashboard
│   ├── patient.html                           # Patient prescription view
│   ├── prescriptions.html                     # Prescription management view
│   ├── js/                                    # API client, auth guards, and UI logic
│   └── images/                                # Favicons and brand assets
├── scripts/                                   # Database & migration maintenance scripts
│   └── fix-migration-history.ps1
├── src/
│   ├── SolveStation.Common/                   # Shared models, exceptions, interfaces, extensions
│   ├── SolveStation.Authentication/           # JWT generation, refresh tokens, auth services
│   ├── SolveStation.UserManagement/           # User CRUD and role management
│   ├── SolveStation.PrescriptionManagement/   # Prescription creation and dispensing controllers
│   ├── SolveStation.InventoryManagement/      # Drug stock management and alert logic
│   ├── SolveStation.Data/                     # PharmacyDbContext, EF Core migrations, seeding
│   └── SolveStation.PharmacyApi/              # Web API entry point, middleware, CORS, health check
└── README.md
```

---

## 🚀 Local Development Setup

### Prerequisites

- [.NET 8.0 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [PostgreSQL 13+](https://www.postgresql.org/download/) (PostgreSQL 16/17 recommended)
- [EF Core CLI Tools](https://learn.microsoft.com/en-us/ef/core/cli/dotnet) (`dotnet tool install --global dotnet-ef --version 8.0.11`)
- [Git](https://git-scm.com/downloads)

### 1. Clone the Repository

```bash
git clone [https://github.com/Ataud-dayyan/PharmInvMS.git](https://github.com/Ataud-dayyan/PharmInvMS.git)
cd PharmInvMS
```

### 2. Configure Secrets Safely (.NET User Secrets)

Avoid hardcoding database passwords or JWT keys in `appsettings.json`. Store local credentials in **.NET User Secrets**:

```bash
cd src/SolveStation.PharmacyApi
dotnet user-secrets init
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=localhost;Port=5432;Database=SolveStationPharmacyDb;Username=postgres;Password=YOUR_LOCAL_PASSWORD"
dotnet user-secrets set "JwtSettings:SecretKey" "YOUR_LOCAL_JWT_SECRET_KEY_AT_LEAST_32_CHARS"
cd ../..
```

### 3. Restore, Build, and Apply Database Migrations

```bash
dotnet restore
dotnet ef database update --project src/SolveStation.Data/SolveStation.Data.csproj --startup-project src/SolveStation.PharmacyApi/SolveStation.PharmacyApi.csproj
```

### 4. Run the Backend API

```bash
dotnet run --project src/SolveStation.PharmacyApi/SolveStation.PharmacyApi.csproj
```

- **Swagger UI (Development):** `https://localhost:5001` (or `http://localhost:5000`)
- **Health Check:** `/health`

### 5. Run the Frontend Locally

Serve the `frontend/` directory over a local HTTP server (such as VS Code Live Server on `http://127.0.0.1:5500` or Visual Studio **View in Browser**) and ensure `frontend/js/auth.js` points to your local API URL during local testing.

---

## 📖 Key API Endpoints

### System & Authentication

```text
GET    /health                     # Service health probe (anonymous)
POST   /api/auth/login             # Authenticate user and issue JWT + refresh token
POST   /api/auth/refresh           # Rotate access token using refresh token
POST   /api/auth/logout            # Revoke active refresh token
```

### Users

```text
GET    /api/users                  # List all users (Admin)
POST   /api/users                  # Create user account (Admin)
GET    /api/users/{id}             # Get user profile
PUT    /api/users/{id}             # Update user profile
DELETE /api/users/{id}             # Delete user (Admin)
```

### Drugs & Inventory

```text
GET    /api/drugs                  # List all medications and stock balances
POST   /api/drugs                  # Register a new medication batch
PUT    /api/drugs/{id}             # Update medication details, price, and expiry date
PATCH  /api/drugs/{id}/stock       # Adjust medication stock quantity with audit reason
DELETE /api/drugs/{id}             # Remove medication record
GET    /api/drugs/low-stock        # Retrieve medications below minimum alert threshold
```

### Prescriptions

```text
GET    /api/prescriptions          # List prescriptions (filtered by user role)
GET    /api/prescriptions/pending  # List incoming prescriptions awaiting dispense
POST   /api/prescriptions          # Create a new prescription (Doctor)
GET    /api/prescriptions/{id}     # Get prescription line items and patient details
POST   /api/prescriptions/{id}/fill # Authorize dispense and automatically deduct stock
```

---

## 🚢 Production Deployment (Render + Neon)

### 1. Database (Neon PostgreSQL)

1. Create a PostgreSQL database on [Neon](https://neon.tech/).
2. Copy the **Direct** connection details (avoid pooled connections when running EF Core migrations) and apply migrations:
   ```bash
   dotnet ef database update --project src/SolveStation.Data/SolveStation.Data.csproj --startup-project src/SolveStation.PharmacyApi/SolveStation.PharmacyApi.csproj --connection "Host=YOUR_NEON_HOST.aws.neon.tech;Port=5432;Database=neondb;Username=YOUR_USER;Password=YOUR_PASSWORD;SSL Mode=Require;Trust Server Certificate=true"
   ```

### 2. Backend Web Service (Render Docker)

1. Create a **Web Service** on [Render](https://render.com/) connected to this repository using the **Docker** runtime (`./Dockerfile`) and set **Health Check Path** to `/health`.
2. Configure the following environment variables in Render:

```text
ASPNETCORE_ENVIRONMENT=Production
ConnectionStrings__DefaultConnection=Host=YOUR_NEON_HOST.aws.neon.tech;Port=5432;Database=neondb;Username=YOUR_USER;Password=YOUR_PASSWORD;SSL Mode=Require;Trust Server Certificate=true
JwtSettings__SecretKey=YOUR_PRODUCTION_SECRET_KEY_AT_LEAST_32_CHARS
JwtSettings__Issuer=PharmacySystem
JwtSettings__Audience=PharmacySystemUsers
JwtSettings__ExpirationInMinutes=60
```

### 3. Frontend Static Site (Render)

1. Set the API base URL in `frontend/js/auth.js` to your Render Web Service URL (`https://pharminvms.onrender.com/api`).
2. Ensure your Render Static Site origin (`https://pharminvmsys.onrender.com`) is listed in `WithOrigins(...)` inside `src/SolveStation.PharmacyApi/Program.cs`.
3. Create a **Static Site** on Render with **Root Directory** set to `frontend`, **Build Command** left empty, and **Publish Directory** set to `.`.

---

## 🔒 Security Practices

- **Zero Hardcoded Secrets:** Database credentials and JWT signing keys are excluded from source control via `.NET User Secrets` locally and injected via environment variables in production.
- **JWT & Refresh Token Lifecycle:** Short-lived bearer tokens paired with database-backed refresh token rotation and revocation.
- **Role-Based Authorization & CORS:** Strict origin allowlisting and role enforcement across API controllers and client views.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
