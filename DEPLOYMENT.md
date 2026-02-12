# Deploying to VPS (Express Serving React)

## Quick Deploy

Run the automated deployment script:

```bash
./deploy.sh
```

This will:
1. Build the React client (`npm run build`)
2. Install server dependencies
3. Restart the server with PM2

---

## Manual Deployment Steps

### 1. Build React Client

```bash
cd client
npm install
npm run build
```

This creates `client/dist/` with optimized production files.

### 2. Update Environment Variables

Make sure `server/.env` has:

```bash
# Remove VITE_API_URL - not needed (same origin)
# Keep these:
MONGODB_URI=your_mongodb_uri
RAZORPAY_KEY_ID=your_key
RAZORPAY_KEY_SECRET=your_secret
JWT_SECRET=your_jwt_secret
PORT=5000
```

### 3. Start/Restart Server

**With PM2 (recommended):**
```bash
cd server
pm2 restart all
# or if first time:
pm2 start npm --name "ai-voice-agent" -- start
```

**Without PM2:**
```bash
cd server
npm start
```

---

## Access Your App

- **Frontend + Backend:** `http://your-vps-ip:5000`
- **API Endpoints:** `http://your-vps-ip:5000/api/*`

---

## How It Works

1. Express serves static files from `client/dist/`
2. API routes (`/api/*`) are handled by Express controllers
3. All other routes (`/*`) serve `index.html` (React Router handles routing)

---

## Troubleshooting

### "Cannot GET /"
- React build not found. Run `npm run build` in client folder
- Check server logs: `pm2 logs`

### API calls failing
- Check CORS configuration in `server/app.js`
- Verify `.env` variables are set

### 404 on page refresh
- This is normal if React build is missing
- The catch-all route should handle this automatically

---

## Production Checklist

- [ ] Build React app (`npm run build`)
- [ ] Set environment variables in `server/.env`
- [ ] Update CORS origins if needed
- [ ] Use PM2 for process management
- [ ] Set up SSL with Nginx (recommended for production)
- [ ] Configure firewall (allow port 5000 or 80/443)

---

## Next Steps (Optional)

For better production setup:
1. Add Nginx reverse proxy
2. Set up SSL with Let's Encrypt
3. Use port 80/443 instead of 5000
4. Add monitoring (PM2 Plus, New Relic, etc.)
