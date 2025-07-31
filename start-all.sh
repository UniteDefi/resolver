#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create logs directory if it doesn't exist
mkdir -p logs

# Generate timestamp for log file
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="logs/unite_defi_${TIMESTAMP}.log"

# Array to store PIDs
declare -a PIDS

# Function to log with timestamp
log_with_timestamp() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to cleanup background processes on exit
cleanup() {
    log_with_timestamp "Shutting down all services..."
    echo -e "\n${YELLOW}Shutting down all services...${NC}"
    
    # Kill all stored PIDs and their children
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            log_with_timestamp "Stopping process $pid"
            kill -TERM "$pid" 2>/dev/null
            # Also kill the entire process group
            kill -TERM "-$pid" 2>/dev/null
        fi
    done
    
    # Give processes time to shut down gracefully
    sleep 2
    
    # Force kill any remaining processes
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            log_with_timestamp "Force stopping process $pid"
            kill -KILL "$pid" 2>/dev/null
            kill -KILL "-$pid" 2>/dev/null
        fi
    done
    
    log_with_timestamp "All services stopped"
    echo -e "\n${GREEN}Logs saved to: ${LOG_FILE}${NC}"
    exit
}

# Set up trap to catch CTRL+C
trap cleanup INT TERM

log_with_timestamp "Starting all Unite DeFi services..."
echo -e "${GREEN}Starting all Unite DeFi services...${NC}\n"
echo -e "${GREEN}Logs will be saved to: ${LOG_FILE}${NC}\n"

# Start the relayer
log_with_timestamp "Starting Relayer..."
echo -e "${BLUE}Starting Relayer...${NC}"
(
    cd ../relayer && npm run dev 2>&1 | while IFS= read -r line; do
        echo "[Relayer] $line" | tee -a "../resolver/$LOG_FILE"
    done
) &
RELAYER_PID=$!
PIDS+=($RELAYER_PID)
log_with_timestamp "Relayer started with PID: $RELAYER_PID"

# Give relayer time to start
sleep 3

# Start all 4 resolvers
for i in {0..3}; do
    log_with_timestamp "Starting Resolver $i..."
    echo -e "${BLUE}Starting Resolver $i...${NC}"
    (
        cd service && RESOLVER_INDEX=$i npm run start:enhanced-resolver 2>&1 | while IFS= read -r line; do
            echo "[Resolver $i] $line" | tee -a "../$LOG_FILE"
        done
    ) &
    RESOLVER_PID=$!
    PIDS+=($RESOLVER_PID)
    log_with_timestamp "Resolver $i started with PID: $RESOLVER_PID"
    sleep 2
done

log_with_timestamp "All services started!"
echo -e "\n${GREEN}All services started!${NC}"
echo -e "${YELLOW}Press CTRL+C to stop all services${NC}\n"
echo -e "${GREEN}Tail the logs with: tail -f ${LOG_FILE}${NC}\n"

# Show running processes
echo -e "${BLUE}Running processes:${NC}"
echo -e "${BLUE}PIDs: ${PIDS[@]}${NC}"
jobs -l

# Wait for all background processes
wait "${PIDS[@]}"