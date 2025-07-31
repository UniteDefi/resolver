#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if logs directory exists
if [ ! -d "logs" ]; then
    echo -e "${YELLOW}No logs directory found. Run ./start-all.sh first.${NC}"
    exit 1
fi

# Find the most recent log file
LATEST_LOG=$(ls -t logs/unite_defi_*.log 2>/dev/null | head -n1)

if [ -z "$LATEST_LOG" ]; then
    echo -e "${YELLOW}No log files found in logs directory.${NC}"
    exit 1
fi

echo -e "${GREEN}Viewing latest log file: ${LATEST_LOG}${NC}\n"

# Check for command line arguments
if [ "$1" = "-f" ] || [ "$1" = "--follow" ]; then
    echo -e "${BLUE}Following log file (Ctrl+C to exit)...${NC}\n"
    tail -f "$LATEST_LOG"
elif [ "$1" = "-r" ] || [ "$1" = "--resolver" ] && [ -n "$2" ]; then
    echo -e "${BLUE}Filtering logs for Resolver $2...${NC}\n"
    grep "\[Resolver $2\]" "$LATEST_LOG"
elif [ "$1" = "-e" ] || [ "$1" = "--errors" ]; then
    echo -e "${BLUE}Showing errors only...${NC}\n"
    grep -i "error\|fail\|exception" "$LATEST_LOG"
elif [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: ./view-logs.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -f, --follow          Follow log file in real-time"
    echo "  -r, --resolver <num>  Show logs for specific resolver (0-3)"
    echo "  -e, --errors          Show only error messages"
    echo "  -h, --help            Show this help message"
    echo ""
    echo "No options: Display entire log file"
else
    # Display the entire log file
    cat "$LATEST_LOG"
fi