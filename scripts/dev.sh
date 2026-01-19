#!/bin/bash
# Dev stack management script using tmux
# Usage: ./scripts/dev.sh [start|stop|status|logs|watch] [--reset]

GATEWAY_PORT=3000
ORG_PORT=4321
DEMO_PORT=5174
GATEWAY_URL="http://localhost:$GATEWAY_PORT"
BOOTSTRAP_API_KEY="testbootstrapkey123"

# Get repo root (works from any directory)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Wait for gateway to be ready
wait_for_gateway() {
    local max_attempts=30
    local attempt=1
    echo "Waiting for gateway to be ready..."
    while [ $attempt -le $max_attempts ]; do
        # Check /ping endpoint - any HTTP response means server is up (even 401)
        local status=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/ping" 2>/dev/null)
        if [ "$status" != "000" ] && [ -n "$status" ]; then
            echo "  Gateway is ready! (status: $status)"
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    echo "  Warning: Gateway did not respond after ${max_attempts}s"
    return 1
}

# Provision an identity for local development
provision_identity() {
    echo ""
    echo "Provisioning local development identity..."

    # Retry a few times - gateway may return 503 while DOs initialize
    local response=""
    local attempt=1
    local max_attempts=5
    while [ $attempt -le $max_attempts ]; do
        response=$(curl -s -X POST "$GATEWAY_URL/identity/create" \
            -H "Content-Type: application/json" \
            -H "Authorization: ApiKey $BOOTSTRAP_API_KEY" \
            -d '{"displayName": "local-dev"}')

        # Check if we got a valid response (contains "secret" or "Unauthorized")
        if echo "$response" | grep -q '"secret"'; then
            break
        elif echo "$response" | grep -q 'Unauthorized'; then
            break
        fi

        sleep 1
        attempt=$((attempt + 1))
    done

    local api_key=$(echo "$response" | grep -o '"secret":"[^"]*"' | cut -d'"' -f4)

    if [ -n "$api_key" ]; then
        # URL-encode the gateway URL for use in hash params
        local encoded_gateway_url=$(printf '%s' "$GATEWAY_URL" | sed 's/:/%3A/g; s/\//%2F/g')
        local org_setup_url="http://localhost:$ORG_PORT/#gatewayUrl=$encoded_gateway_url&apiKey=$api_key"

        echo ""
        echo "=========================================="
        echo "  LOCAL DEV CREDENTIALS (NEW)"
        echo "=========================================="
        echo "  Gateway URL: $GATEWAY_URL"
        echo "  API Key:     $api_key"
        echo "=========================================="
        echo ""
        echo "Open this link to configure the Org app:"
        echo "  $org_setup_url"
        echo ""
        echo "Then configure the Demo app in browser console at http://localhost:$DEMO_PORT:"
        echo "  localStorage.setItem('federise-demo:frameUrl', 'http://localhost:$ORG_PORT/frame')"
        echo ""
    else
        echo ""
        echo "=========================================="
        echo "  IDENTITY ALREADY EXISTS"
        echo "=========================================="
        echo "  An identity was already created previously."
        echo "  Use your existing API key, or run with --reset to clear local data:"
        echo "    ./scripts/dev.sh start --reset"
        echo ""
        echo "  Gateway URL: $GATEWAY_URL"
        echo "  Frame URL:   http://localhost:$ORG_PORT/frame"
        echo "=========================================="
        echo ""
    fi
}

reset_local_state() {
    echo "Resetting local wrangler state..."
    local wrangler_state="$REPO_ROOT/apps/gateway/.wrangler"
    if [ -d "$wrangler_state" ]; then
        rm -rf "$wrangler_state"
        echo "  Cleared $wrangler_state"
    else
        echo "  No local state to clear"
    fi
}

start() {
    local do_reset=false
    if [ "$1" = "--reset" ]; then
        do_reset=true
    fi

    if [ "$do_reset" = true ]; then
        reset_local_state
    fi

    echo "Starting Federise dev stack in tmux sessions..."

    # Start package watchers first (apps depend on these)
    if ! tmux has-session -t federise-pkg-gateway-core 2>/dev/null; then
        tmux new-session -d -s federise-pkg-gateway-core -c "$REPO_ROOT/packages/gateway-core" "pnpm dev"
        echo "  gateway-core watcher started (federise-pkg-gateway-core)"
    else
        echo "  gateway-core watcher already running"
    fi

    if ! tmux has-session -t federise-pkg-sdk 2>/dev/null; then
        tmux new-session -d -s federise-pkg-sdk -c "$REPO_ROOT/packages/sdk" "pnpm dev"
        echo "  sdk watcher started (federise-pkg-sdk)"
    else
        echo "  sdk watcher already running"
    fi

    # Brief pause to let packages compile
    sleep 1

    # Start gateway
    if ! tmux has-session -t federise-gateway 2>/dev/null; then
        tmux new-session -d -s federise-gateway -c "$REPO_ROOT/apps/gateway" "pnpm dev --port $GATEWAY_PORT"
        echo "  Gateway started in tmux session 'federise-gateway' on port $GATEWAY_PORT"
    else
        echo "  Gateway already running (federise-gateway session exists)"
    fi

    # Start org
    if ! tmux has-session -t federise-org 2>/dev/null; then
        tmux new-session -d -s federise-org -c "$REPO_ROOT/apps/org" "pnpm dev"
        echo "  Org started in tmux session 'federise-org' on port $ORG_PORT"
    else
        echo "  Org already running (federise-org session exists)"
    fi

    # Start demo
    if ! tmux has-session -t federise-demo 2>/dev/null; then
        tmux new-session -d -s federise-demo -c "$REPO_ROOT/apps/demo" "pnpm dev --port $DEMO_PORT"
        echo "  Demo started in tmux session 'federise-demo' on port $DEMO_PORT"
    else
        echo "  Demo already running (federise-demo session exists)"
    fi

    echo ""
    echo "Dev stack started. URLs:"
    echo "  Gateway: http://localhost:$GATEWAY_PORT"
    echo "  Org:     http://localhost:$ORG_PORT"
    echo "  Demo:    http://localhost:$DEMO_PORT"
    echo "  Frame:   http://localhost:$ORG_PORT/frame"
    echo ""
    echo "View logs: ./scripts/dev.sh logs [gateway|org|demo|gateway-core|sdk]"
    echo "Stop with: ./scripts/dev.sh stop"

    # Auto-provision identity
    if wait_for_gateway; then
        provision_identity
    fi
}

stop() {
    echo "Stopping Federise dev stack..."

    for session in federise-gateway federise-org federise-demo federise-pkg-gateway-core federise-pkg-sdk; do
        if tmux has-session -t "$session" 2>/dev/null; then
            tmux kill-session -t "$session"
            echo "  Killed $session"
        fi
    done

    # Also kill anything on our ports (cleanup)
    for PORT in $GATEWAY_PORT $ORG_PORT $DEMO_PORT; do
        PID=$(lsof -ti :$PORT 2>/dev/null)
        if [ -n "$PID" ]; then
            kill $PID 2>/dev/null
            echo "  Killed process on port $PORT (PID: $PID)"
        fi
    done

    echo "Dev stack stopped."
}

status() {
    echo "Federise dev stack status:"
    echo ""
    echo "Packages:"
    for session in federise-pkg-gateway-core federise-pkg-sdk; do
        case $session in
            federise-pkg-gateway-core) NAME="gateway-core" ;;
            federise-pkg-sdk) NAME="sdk" ;;
        esac
        if tmux has-session -t "$session" 2>/dev/null; then
            echo "  $NAME: Watching (tmux: $session)"
        else
            echo "  $NAME: Not running"
        fi
    done

    echo ""
    echo "Apps:"
    for session in federise-gateway federise-org federise-demo; do
        case $session in
            federise-gateway) NAME="Gateway"; PORT=$GATEWAY_PORT ;;
            federise-org) NAME="Org"; PORT=$ORG_PORT ;;
            federise-demo) NAME="Demo"; PORT=$DEMO_PORT ;;
        esac

        if tmux has-session -t "$session" 2>/dev/null; then
            PID=$(lsof -ti :$PORT 2>/dev/null | head -1)
            if [ -n "$PID" ]; then
                echo "  $NAME (port $PORT): Running (tmux: $session, PID: $PID)"
            else
                echo "  $NAME (port $PORT): Session exists but port not listening (starting?)"
            fi
        else
            echo "  $NAME (port $PORT): Not running"
        fi
    done
}

logs() {
    local service=$1
    local lines=${2:-50}

    case $service in
        gateway) session="federise-gateway" ;;
        org) session="federise-org" ;;
        demo) session="federise-demo" ;;
        gateway-core) session="federise-pkg-gateway-core" ;;
        sdk) session="federise-pkg-sdk" ;;
        *)
            echo "Usage: $0 logs [gateway|org|demo|gateway-core|sdk] [lines]"
            echo "Example: $0 logs gateway 100"
            exit 1
            ;;
    esac

    if tmux has-session -t "$session" 2>/dev/null; then
        echo "=== Last $lines lines from $session ==="
        tmux capture-pane -t "$session" -p | tail -$lines
    else
        echo "Session $session not found"
        exit 1
    fi
}

watch_logs() {
    local lines=${1:-8}
    watch -n 2 "
        echo '=== Packages ===';
        echo '-- gateway-core --'; tmux capture-pane -t federise-pkg-gateway-core -p 2>/dev/null | tail -3 || echo 'Not running';
        echo '-- sdk --'; tmux capture-pane -t federise-pkg-sdk -p 2>/dev/null | tail -3 || echo 'Not running';
        echo '';
        echo '=== Apps ===';
        echo '-- Gateway --'; tmux capture-pane -t federise-gateway -p 2>/dev/null | tail -$lines || echo 'Not running';
        echo '-- Org --'; tmux capture-pane -t federise-org -p 2>/dev/null | tail -$lines || echo 'Not running';
        echo '-- Demo --'; tmux capture-pane -t federise-demo -p 2>/dev/null | tail -$lines || echo 'Not running'
    "
}

case "$1" in
    start)
        start "$2"
        ;;
    stop)
        stop
        ;;
    status)
        status
        ;;
    restart)
        stop
        sleep 2
        start
        ;;
    logs)
        logs "$2" "$3"
        ;;
    watch)
        watch_logs "$2"
        ;;
    *)
        echo "Usage: $0 {start|stop|status|restart|logs|watch}"
        echo ""
        echo "Commands:"
        echo "  start [--reset] - Start all services (--reset clears local state first)"
        echo "  stop    - Stop all services"
        echo "  status  - Check service status"
        echo "  restart - Stop and start all services"
        echo "  logs    - View logs: $0 logs [gateway|org|demo|gateway-core|sdk] [lines]"
        echo "  watch   - Live view of all logs: $0 watch [lines]"
        exit 1
        ;;
esac
