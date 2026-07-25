# Creating Test Users in Supabase

## Step 1 — Run the Schema

1. Go to **Supabase Dashboard** → your project → **SQL Editor**
2. Click **New Query**
3. Paste the entire contents of `supabase/schema.sql`
4. Click **Run**

You should see: *Success. No rows returned.*

---

## Step 2 — Create Test Users

Go to **Authentication → Users → Add user → Create new user**.

Create one user per role below. After creating each user, **edit their metadata**.

### Bishop / Diocese Admin
| Field | Value |
|-------|-------|
| Email | `bishop@diocese-sanpablo.ph` |
| Password | `Diocese@2025!` |
| **user_metadata** | `{"role":"bishop","entityType":"diocese","entityName":"Diocese of San Pablo","displayName":"Most Rev. Bishop"}` |

---

### Diocese Administrator
| Field | Value |
|-------|-------|
| Email | `admin@diocese-sanpablo.ph` |
| Password | `Diocese@2025!` |
| **user_metadata** | `{"role":"diocese_admin","entityType":"diocese","entityName":"Diocese of San Pablo","displayName":"Diocese Administrator"}` |

---

### Parish Priest
| Field | Value |
|-------|-------|
| Email | `priest@sanisidro.ph` |
| Password | `Parish@2025!` |
| **user_metadata** | `{"role":"parish_priest","entityType":"parish","entityId":"San Isidro Labrador Parish","entityName":"San Isidro Labrador Parish","displayName":"Fr. Parish Priest"}` |

---

### Parish Secretary
| Field | Value |
|-------|-------|
| Email | `secretary@sanisidro.ph` |
| Password | `Parish@2025!` |
| **user_metadata** | `{"role":"parish_secretary","entityType":"parish","entityId":"San Isidro Labrador Parish","entityName":"San Isidro Labrador Parish","displayName":"Parish Secretary"}` |

---

### Seminary Rector
| Field | Value |
|-------|-------|
| Email | `rector@seminary.ph` |
| Password | `Seminary@2025!` |
| **user_metadata** | `{"role":"seminary_rector","entityType":"seminary","entityId":"St. Peter's College Seminary","entityName":"St. Peter's College Seminary","displayName":"Seminary Rector"}` |

---

### School Administrator
| Field | Value |
|-------|-------|
| Email | `admin@liceo.ph` |
| Password | `School@2025!` |
| **user_metadata** | `{"role":"school_registrar","entityType":"school","entityId":"Liceo de San Pablo","entityName":"Liceo de San Pablo","displayName":"School Administrator"}` |

---

## Step 3 — Set User Metadata

For each user you created:
1. Click the user in Authentication → Users
2. Click **Edit**
3. In the **User Metadata** JSON field, paste the JSON from the table above
4. Click **Save**

---

## Step 4 — Verify

Start the app (`npm run dev`) and log in with one of the accounts above.  
The app tries Supabase Auth first; if that succeeds the user is set.

---

## Demo / Offline Fallback Credentials

These still work without a Supabase account (localStorage-only):

| Email | Password | Role |
|-------|----------|------|
| `bishop@gmail.com` | `password123` | Bishop |
| `bishop@diocese.com` | *(any)* | Bishop |
| `priest@gmail.com` | `password123` | Parish Priest |
| `seminary@church.com` | *(any)* | Seminary |
| `school@church.com` | *(any)* | School |

---

## Seeding Financial Data

Financial records are **seeded automatically** the first time an API route is called for a given institution. No manual seeding required — just log in and navigate to a dashboard.
