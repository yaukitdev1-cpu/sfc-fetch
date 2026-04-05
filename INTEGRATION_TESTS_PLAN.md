# Integration Tests Plan - sfc-fetch

## Objective
Create integration tests for sfc-fetch that cover functionality not already covered by unit tests, using Claude Code with Ralph Loop.

## Current State
- **Unit tests**: 145 tests passing, 80.08% line coverage
- **Test files**: 11 test files covering date utils, configuration, content service, turndown service, queue service, API clients (circular, consultation, news, guideline scraper), docling service, git service
- **Low coverage areas**:
  - git.service.ts: 33% line coverage
  - queue.service.ts: 22% line coverage
  - docling.service.ts: 51% line coverage
- **NestJS DI-dependent services**: Require integration test setup (lowdb, workflow, backup)

## Integration Test Focus

### 1. API Endpoint Tests
- Test controllers with real HTTP requests
- Use Fastify inject or supertest
- Cover all endpoints across categories (circulars, guidelines, consultations, news)
- Test error responses and edge cases

### 2. Workflow State Machine Tests
- Complete document lifecycle: PENDING → DISCOVERED → DOWNLOADING → PROCESSING → COMPLETED
- Sub-workflow steps: discover, download, convert, store
- Retry workflow from FAILED state
- Re-run workflow from COMPLETED state
- Error handling and recovery

### 3. Git Backup/Restore Tests
- Real git operations (commit, push, pull)
- Dehydrate workflow (backup creation and commit)
- Hydrate workflow (restore from git backup)
- Archive management for re-runs

### 4. Queue Job Processing Tests
- Real better-queue execution
- Job scheduling and prioritization
- Retry and backoff behavior
- Concurrent job handling
- Job failure and recovery

### 5. Multi-Service Integration Tests
- End-to-end document processing workflow
- Cross-service interactions (workflow + queue + backup + content)
- State persistence across services

## Test Structure

```
sfc-fetch/tests/integration/
├── api/
│   ├── circulars.controller.integration.test.ts
│   ├── guidelines.controller.integration.test.ts
│   ├── consultations.controller.integration.test.ts
│   └── news.controller.integration.test.ts
├── workflows/
│   ├── workflow.integration.test.ts
│   └── queue.integration.test.ts
├── backup/
│   └── git.backup.integration.test.ts
├── e2e/
│   └── document.lifecycle.integration.test.ts
└── helpers/
    └── test-helpers.ts
```

## Prerequisites

### Install Test Dependencies
```bash
cd /root/.openclaw/workspace/sfc-fetch
bun add -d @nestjs/testing
bun add -d supertest  # Alternative to Fastify inject
```

### Test Setup
- Create test database fixture (data/test-db.json)
- Mock SFC API responses (or use test fixtures)
- Setup/teardown for each test (NestJS testing module)
- Git repository fixture for backup tests

## Ralph Loop Execution

### Session Setup
```bash
# Create tmux session as "claude" user
sudo -u claude tmux new-session -d -s integration-tests -c /root/.openclaw/workspace

# Start Claude Code with both repos
sudo -u claude tmux send-keys -t integration-tests 'export PATH="$HOME/.bun/bin:$PATH" && claude --add-dir sfc-fetch --add-dir sfc-research --allow-dangerously-skip-permissions' Enter

# Start Ralph Loop
sudo -u claude tmux send-keys -t integration-tests '/ralph-loop:ralph-loop "...prompt..." --completion-promise INTEGRATION_TESTS_COMPLETE --max-iterations 15' Enter
```

### Monitoring
```bash
# Monitor progress every 5 minutes
watch -n 300 'tmux capture-pane -t integration-tests -p | grep -i "iteration" | tail -3'

# Check for completion
watch -n 60 'tmux capture-pane -t integration-tests -p | grep -i "promise"'

# Monitor for errors
watch -n 120 'tmux capture-pane -t integration-tests -p | grep -i "error\|fail"'
```

## Completion Criteria

- ✅ All integration tests created and passing
- ✅ Unit tests still passing (regression check)
- ✅ Coverage increased to >85% line coverage
- ✅ Integration tests cover:
  - API endpoints (all controllers)
  - Workflow state machine
  - Git backup/restore
  - Queue job processing
  - End-to-end document lifecycle
- ✅ Documentation updated (INTEGRATION_TESTS.md)
- ✅ Git commits for each milestone

## Progress Tracking

Track progress in `sfc-fetch/INTEGRATION_TESTS.md`:
```markdown
# Integration Tests Progress

## Completed
- [x] Phase 1: Setup and dependencies
- [x] Phase 2: API endpoint integration tests
- [ ] Phase 3: Workflow integration tests
- [ ] Phase 4: Git backup/restore integration tests
- [ ] Phase 5: Queue integration tests
- [ ] Phase 6: End-to-end integration tests

## Current
- [ ] Phase 3: Workflow integration tests (in progress)
```
