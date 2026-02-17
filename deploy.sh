#!/bin/bash

echo "Pulling latest code..."
git pull origin main

echo "Building frontend..."
cd client
npm install
npm run build

echo "Installing backend dependencies..."
cd ../server
npm install

echo "Restarting backend..."
pm2 restart voice-server

echo "Deployment complete."
