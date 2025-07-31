#!/bin/bash

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "PM2 is not installed. Install it with: npm install -g pm2"
    exit 1
fi

# Start all services with PM2
echo "Starting all services with PM2..."
pm2 start ecosystem.config.js

# Show status
pm2 status

echo ""
echo "Useful PM2 commands:"
echo "  pm2 logs          - View all logs"
echo "  pm2 logs resolver-0  - View specific resolver logs"
echo "  pm2 stop all     - Stop all services"
echo "  pm2 restart all  - Restart all services"
echo "  pm2 delete all   - Remove all services from PM2"
echo "  pm2 monit        - Monitor all services"