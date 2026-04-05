#!/bin/bash
# Health check script for sfc-fetch
# Monitors the application and reports status

PORT=${PORT:-3000}
HEALTH_URL="http://localhost:$PORT/health"
LOG_FILE="/home/openclaw/.openclaw/workspace/sfc-fetch/logs/health.log"

mkdir -p "$(dirname "$LOG_FILE")"

echo "🏥 sfc-fetch Health Monitor Started"
echo "   URL: $HEALTH_URL"
echo "   Log: $LOG_FILE"
echo ""

# Function to get timestamp
timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

# Health check loop
while true; do
    # Try health endpoint
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" -m 5 $HEALTH_URL 2>/dev/null || echo "000|0")
    
    HTTP_CODE=$(echo $RESPONSE | cut -d'|' -f1)
    RESPONSE_TIME=$(echo $RESPONSE | cut -d'|' -f2)
    
    # Format status
    if [ "$HTTP_CODE" = "200" ]; then
        STATUS="✅ HEALTHY"
        # Only log healthy occasionally to reduce noise
        if [ $(( $(date +%s) % 60 )) -lt 5 ]; then
            echo "$(timestamp) $STATUS | HTTP $HTTP_CODE | ${RESPONSE_TIME}s" | tee -a "$LOG_FILE"
        fi
    elif [ "$HTTP_CODE" = "000" ]; then
        STATUS="❌ DOWN"
        echo "$(timestamp) $STATUS | Cannot reach server | Connection refused" | tee -a "$LOG_FILE"
    else
        STATUS="⚠️  ERROR"
        echo "$(timestamp) $STATUS | HTTP $HTTP_CODE | ${RESPONSE_TIME}s" | tee -a "$LOG_FILE"
    fi
    
    sleep 5
done
