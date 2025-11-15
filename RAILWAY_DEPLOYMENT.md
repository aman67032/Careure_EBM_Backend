# Railway Deployment Guide for CareSure Backend

This guide will help you deploy the CareSure backend to Railway.

## Prerequisites

1. A Railway account (sign up at https://railway.app)
2. A PostgreSQL database (Railway provides this)
3. Your backend code ready to deploy

## Step 1: Create a New Project on Railway

1. Go to https://railway.app and sign in
2. Click "New Project"
3. Select "Deploy from GitHub repo" (recommended) or "Empty Project"

## Step 2: Add PostgreSQL Database

1. In your Railway project, click "New"
2. Select "Database" → "Add PostgreSQL"
3. Railway will automatically create a PostgreSQL database
4. Note the connection details (you'll need these for environment variables)

## Step 3: Configure Environment Variables

In your Railway project, go to "Variables" and add the following:

### Required Environment Variables:

```env
# Database Configuration (from Railway PostgreSQL service)
DATABASE_URL=postgresql://user:password@host:port/database
# OR use individual variables:
DB_HOST=your-db-host.railway.app
DB_PORT=5432
DB_NAME=railway
DB_USER=postgres
DB_PASSWORD=your-password

# JWT Secret (generate a strong random string)
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# Server Configuration
PORT=5000
NODE_ENV=production

# Frontend URL (your frontend deployment URL)
FRONTEND_URL=https://your-frontend-domain.com

# Admin Emails (comma-separated)
ADMIN_EMAILS=admin@jklu.edu.in,admin@caresure.com

# CORS Configuration (optional, defaults to FRONTEND_URL)
CORS_ORIGIN=https://your-frontend-domain.com
```

### How to Get Database Connection String:

1. Click on your PostgreSQL service in Railway
2. Go to "Variables" tab
3. Copy the `DATABASE_URL` or use individual connection variables

## Step 4: Deploy from GitHub (Recommended)

1. Connect your GitHub repository to Railway
2. Railway will automatically detect it's a Node.js project
3. Select the branch you want to deploy (usually `main` or `master`)
4. Railway will automatically:
   - Install dependencies (`npm install`)
   - Run the start command (`npm start`)

## Step 5: Manual Deployment (Alternative)

If not using GitHub:

1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Initialize: `railway init`
4. Link to project: `railway link`
5. Deploy: `railway up`

## Step 6: Initialize Database

After deployment, you need to initialize the database:

### Option 1: Using Railway CLI

1. Open Railway dashboard
2. Go to your backend service
3. Click "Deployments" → "View Logs"
4. The database should auto-initialize on first startup (if `initDatabase` runs automatically)

### Option 2: Manual Initialization

1. Connect to your Railway PostgreSQL database
2. Run the initialization script:
   ```bash
   railway run npm run init-db
   ```

### Option 3: Using Railway Shell

1. In Railway dashboard, open your service
2. Click "Shell" tab
3. Run: `npm run init-db`

## Step 7: Create Admin User (Optional)

Create an admin user after deployment:

```bash
railway run npm run create-admin
```

Or use Railway Shell:
```bash
npm run create-admin
```

## Step 8: Verify Deployment

1. Check the deployment logs in Railway dashboard
2. Test the health endpoint:
   ```
   https://your-backend.railway.app/api/health
   ```
3. You should see: `{"status":"ok","message":"CareSure API is running"}`

## Step 9: Get Your Backend URL

1. In Railway dashboard, go to your service
2. Click "Settings" → "Generate Domain"
3. Copy the generated URL (e.g., `https://caresure-backend-production.up.railway.app`)
4. Update your frontend's `NEXT_PUBLIC_API_URL` environment variable

## Environment Variables Reference

### Database Variables (from Railway PostgreSQL):

Railway automatically provides these when you add PostgreSQL:
- `DATABASE_URL` - Full connection string
- `PGHOST` - Database host
- `PGPORT` - Database port
- `PGDATABASE` - Database name
- `PGUSER` - Database user
- `PGPASSWORD` - Database password

### Application Variables (you need to set):

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT tokens | `your_random_secret_key_here` |
| `PORT` | Server port (Railway sets this automatically) | `5000` |
| `NODE_ENV` | Environment | `production` |
| `FRONTEND_URL` | Your frontend URL | `https://your-app.vercel.app` |
| `ADMIN_EMAILS` | Comma-separated admin emails | `admin@example.com,admin2@example.com` |

## Troubleshooting

### Database Connection Issues

1. Check that `DATABASE_URL` is set correctly
2. Verify PostgreSQL service is running in Railway
3. Check database initialization logs

### Port Issues

- Railway automatically sets the `PORT` environment variable
- Your code should use: `process.env.PORT || 5000`
- Don't hardcode the port

### Build Failures

1. Check Railway build logs
2. Ensure `package.json` has correct `start` script
3. Verify all dependencies are in `dependencies` (not `devDependencies`)

### CORS Issues

1. Set `FRONTEND_URL` to your actual frontend domain
2. Update CORS configuration in `server.js` if needed
3. Don't use `localhost` in production

## Monitoring

Railway provides:
- **Logs**: Real-time application logs
- **Metrics**: CPU, Memory, Network usage
- **Deployments**: Deployment history and rollback

## Custom Domain (Optional)

1. Go to your service → "Settings" → "Domains"
2. Add your custom domain
3. Configure DNS records as instructed
4. Update `FRONTEND_URL` if needed

## Continuous Deployment

Railway automatically deploys when you push to your connected branch:
- Push to `main` → Auto-deploy to production
- You can also set up preview deployments for PRs

## Cost Optimization

- Railway offers a free tier with usage limits
- Monitor your usage in the dashboard
- Consider upgrading if you exceed limits

## Security Best Practices

1. ✅ Never commit `.env` files
2. ✅ Use strong `JWT_SECRET` (random, long string)
3. ✅ Set `NODE_ENV=production`
4. ✅ Use HTTPS (Railway provides this automatically)
5. ✅ Restrict `ADMIN_EMAILS` to trusted emails
6. ✅ Regularly update dependencies

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Railway Status: https://status.railway.app

---

**Happy Deploying! 🚀**

