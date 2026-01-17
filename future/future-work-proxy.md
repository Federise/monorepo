# Future Work: Proxy Package Extensions

This document tracks ideas for future extensions to the `@federise/proxy` package that were identified during implementation but deemed out of scope for the initial release.

## Additional Backends

### LocalBackend (IndexedDB)
- Store data in IndexedDB for offline-first applications
- Would enable fully local operation without network connectivity
- Interface would be identical to RemoteBackend

### HybridBackend
- Combine LocalBackend with RemoteBackend
- Sync strategy: local-first with eventual consistency
- Conflict resolution policies
- Background sync via Service Worker

### MockBackend (Testing)
- In-memory implementation for unit testing
- Configurable delays to simulate network latency
- Error injection for testing error handling

## Additional Transports

### ExtensionTransport
- Chrome/Firefox extension message passing
- Would enable browser extension contexts
- Could use `chrome.runtime.sendMessage` / `browser.runtime.sendMessage`

### ServiceWorkerTransport
- Communication between main thread and service worker
- Would enable SW-based proxy architecture

### WebSocketTransport
- Real-time bidirectional communication
- Could enable push notifications for channel events
- Would require gateway WebSocket support

## Additional Capability Stores

### ExtensionCapabilityStore
- Use `chrome.storage.local` for extension contexts
- Would persist across browser sessions

### IndexedDBCapabilityStore
- Store capabilities in IndexedDB
- For local-only contexts without gateway KV

## Router Enhancements

### Message Batching
- Batch multiple messages into single requests
- Reduce HTTP overhead for high-frequency operations

### Request Caching
- Cache GET requests with configurable TTL
- Invalidate cache on mutations

### Retry Logic
- Automatic retry for transient failures
- Exponential backoff with jitter
- Circuit breaker pattern

### Rate Limiting
- Client-side rate limiting
- Prevent excessive API calls
- Queue overflow handling

## Protocol Extensions

### Streaming Messages
- Support for large blob streaming
- Progress callbacks for uploads/downloads

### Subscription Messages
- Real-time event subscriptions
- Channel event push notifications

### Compression
- Message payload compression
- Configurable compression threshold

## Security Enhancements

### Origin Validation
- Configurable origin allowlist
- Origin pattern matching (wildcards)

### Capability Expiration
- Time-based capability expiration
- Automatic renewal flows

### Audit Logging
- Log all operations for security auditing
- Configurable log destinations

## Developer Experience

### Debug Mode
- Verbose logging for development
- Message tracing through router
- Performance timing

### Metrics Collection
- Operation counters
- Latency histograms
- Error rates

### TypeScript Strict Mode
- Full strict TypeScript compliance
- Generic type inference improvements

## Testing Utilities

### Test Harness Improvements
- More comprehensive test message types
- Snapshot testing support
- Performance benchmarking

### Mock Server
- Standalone mock gateway for integration testing
- Configurable responses and errors

## Documentation

### API Reference
- JSDoc for all public APIs
- Generated API documentation

### Migration Guide
- Guide for migrating from direct frame usage
- Breaking change documentation

### Architecture Diagrams
- Message flow diagrams
- Component relationship diagrams

---

*Last updated: Implementation of initial proxy package*
