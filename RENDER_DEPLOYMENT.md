# Deploying CareSure Backend to Render

This guide will help you deploy the CareSure backend API to Render.

## Prerequisites

1. A Render account (sign up at https://render.com)
2. A PostgreSQL database (Render provides free PostgreSQL databases)
3. Your backend code pushed to a Git repository (GitHub, GitLab, or Bitbucket)

## Step 1: Create PostgreSQL Database on Render

1. Go to your Render Dashboard
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   - **Name**: `caresure-database` (or your preferred name)
   - **Database**: `caresure_db`
   - **User**: Auto-generated
   - **Region**: Choose closest to your users
   - **Plan**: Free (or paid for production)
4. Click **"Create Database"**
5. **Important**: Copy the **Internal Database URL** (you'll need this later)

## Step 2: Deploy Backend Service

### Option A: Using render.yaml (Recommended)

1. Push your code to GitHub/GitLab/Bitbucket
2. In Render Dashboard, click **"New +"** → **"Blueprint"**
3. Connect your repository
4. Render will automatically detect `render.yaml` and create the service
5. Configure environment variables (see Step 3)

### Option B: Manual Setup

1. In Render Dashboard, click **"New +"** → **"Web Service"**
2. Connect your repository
3. Configure:
   - **Name**: `caresure-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or paid for production)
4. Click **"Create Web Service"**

## Step 3: Configure Environment Variables

In your Render service settings, go to **"Environment"** and add these variables:

### Required Variables:

```env
NODE_ENV=production
PORT=10000
JWT_SECRET=your_very_secure_random_string_here_min_32_chars
DATABASE_URL=postgresql://user:password@host:port/database
FRONTEND_URL=https://your-frontend-domain.com
ADMIN_EMAILS=admin@jklu.edu.in,admin@caresure.com
```

### How to Get Values:

1. **DATABASE_URL**: 
   - Go to your PostgreSQL database in Render
   - Copy the **Internal Database URL** (for same service) or **External Database URL** (for different service)
   - Format: `postgresql://user:password@host:port/database`

2. **JWT_SECRET**: 
   - Generate a secure random string (minimum 32 characters)
   - You can use: `openssl rand -base64 32` or any online generator

3. **FRONTEND_URL**: 
   - Your frontend domain (e.g., `https://caresure-frontend.onrender.com` or your custom domain)

4. **ADMIN_EMAILS**: 
   - Comma-separated list of admin email addresses
   - Example: `admin@jklu.edu.in,admin@caresure.com,your-email@example.com`

## Step 4: Initialize Database

After deployment, you need to initialize the database:

### Option A: Using Render Shell

1. Go to your backend service in Render
2. Click **"Shell"** tab
3. Run:
   ```bash
   npm run init-db
   ```

### Option B: Using Local Connection

1. Get the External Database URL from Render
2. Update your local `.env` file with the external URL
3. Run locally:
   ```bash
   npm run init-db
   ```

### Option C: Manual SQL (if needed)

Connect to your database and run the initialization scripts manually.

## Step 5: Create Admin User (Optional)

If you need to create an admin user:

1. Use Render Shell or local connection
2. Run:
   ```bash
   npm run create-admin
   ```
3. Follow the prompts

## Step 6: Verify Deployment

1. Check the **"Logs"** tab in Render to ensure the service started successfully
2. Visit: `https://your-backend-url.onrender.com/api/health`
3. You should see: `{"status":"ok","message":"CareSure API is running"}`

## Step 7: Update Frontend Configuration

Update your frontend `.env.local` or environment variables:

```env
NEXT_PUBLIC_API_URL=https://your-backend-url.onrender.com/api
```

## Troubleshooting

### Service Won't Start

1. Check **Logs** tab for errors
2. Verify all environment variables are set
3. Ensure `DATABASE_URL` is correct
4. Check that `PORT` is set to `10000` (Render's default)

### Database Connection Errors

1. Verify `DATABASE_URL` is correct
2. Check if database is running
3. Ensure database allows connections from your service
4. For external connections, use External Database URL

### CORS Errors

1. Update `FRONTEND_URL` environment variable
2. Ensure it matches your frontend domain exactly
3. Restart the service after changing

### Health Check Failing

1. Verify `/api/health` endpoint is accessible
2. Check service logs
3. Ensure service is running

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NODE_ENV` | Yes | Environment mode | `production` |
| `PORT` | Yes | Server port | `10000` |
| `JWT_SECRET` | Yes | JWT signing secret | `your_secret_key` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://...` |
| `FRONTEND_URL` | Yes | Frontend domain for CORS | `https://example.com` |
| `ADMIN_EMAILS` | No | Comma-separated admin emails | `admin@example.com` |
| `UPLOAD_DIR` | No | Upload directory | `./uploads` |
| `MAX_FILE_SIZE` | No | Max file size in bytes | `10485760` |

## Free Tier Limitations

- Services may spin down after 15 minutes of inactivity
- First request after spin-down may be slow (cold start)
- Limited to 750 hours/month
- Database has 90-day data retention on free tier

## Production Recommendations

1. **Upgrade to Paid Plan**: For production, use a paid plan for:
   - Always-on service (no spin-down)
   - Better performance
   - More resources

2. **Custom Domain**: 
   - Add a custom domain in Render settings
   - Update DNS records
   - Update `FRONTEND_URL` accordingly

3. **Environment Variables**:
   - Use Render's environment variable management
   - Never commit secrets to Git
   - Use different values for staging/production

4. **Database Backups**:
   - Enable automatic backups
   - Test restore procedures

5. **Monitoring**:
   - Set up health checks
   - Monitor logs
   - Set up alerts

## Support

For issues:
1. Check Render documentation: https://render.com/docs
2. Review service logs
3. Check database connection
4. Verify environment variables

