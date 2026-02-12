#!/bin/bash

# Deployment script for AI Voice Agent
# This script builds the React client and prepares for production deployment

set -e  # Exit on error

echo "🚀 Starting deployment process..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Build React client
echo -e "${YELLOW}📦 Building React client...${NC}"
cd client
npm install
npm run build

if [ ! -d "dist" ]; then
    echo "❌ Build failed! dist folder not found."
    exit 1
fi

echo -e "${GREEN}✅ React build complete${NC}"

# Step 2: Install server dependencies
echo -e "${YELLOW}📦 Installing server dependencies...${NC}"
cd ../server
npm install

echo -e "${GREEN}✅ Server dependencies installed${NC}"

# Step 3: Check environment variables
echo -e "${YELLOW}🔍 Checking environment configuration...${NC}"
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found in server directory"
    echo "Please create .env with required variables"
    exit 1
fi

echo -e "${GREEN}✅ Environment configuration found${NC}"

# Step 4: Restart server (if using PM2)
if command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}🔄 Restarting server with PM2...${NC}"
    pm2 restart all || pm2 start npm --name "ai-voice-agent" -- start
    echo -e "${GREEN}✅ Server restarted${NC}"
else
    echo -e "${YELLOW}⚠️  PM2 not found. Please restart server manually:${NC}"
    echo "   cd server && npm start"
fi

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "Your app should now be accessible at:"
echo "  http://your-vps-ip:5000"
echo ""
echo "To check server status:"
echo "  pm2 status"
echo "  pm2 logs"
