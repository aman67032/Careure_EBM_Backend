# Quick Start: Deploy to Render

## 🚀 Fast Deployment Steps

### 1. Create PostgreSQL Database
- Render Dashboard → **New +** → **PostgreSQL**
- Copy the **Internal Database URL**

### 2. Create Web Service
- Render Dashboard → **New +** → **Web Service**
- Connect your GitHub repository
- Select `caresure_backend` folder

### 3. Set Environment Variables

In Render service → **Environment** tab, add:

```env
NODE_ENV=production
PORT=10000
JWT_SECRET=<generate_random_32_char_string>
DATABASE_URL=<paste_from_step_1>
FRONTEND_URL=https://your-frontend-url.com
ADMIN_EMAILS=admin@jklu.edu.in,admin@caresure.com
```

### 4. Deploy
- Click **"Create Web Service"**
- Wait for build to complete
- Check logs for success

### 5. Initialize Database
- Go to **Shell** tab in Render
- Run: `npm run init-db`

### 6. Test
- Visit: `https://your-service.onrender.com/api/health`
- Should return: `{"status":"ok","message":"CareSure API is running"}`

## 📝 Generate JWT Secret

```bash
# Linux/Mac
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

## ✅ Checklist

- [ ] PostgreSQL database created
- [ ] Web service created
- [ ] Environment variables set
- [ ] Database initialized
- [ ] Health check passes
- [ ] Frontend URL updated

## 🔗 Files Created

- `render.yaml` - Render configuration
- `Procfile` - Process file for Render
- `ENV_EXAMPLE.txt` - Environment variables template
- `RENDER_DEPLOYMENT.md` - Full deployment guide

