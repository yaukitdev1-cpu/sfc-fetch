# Integration Tests Plan - Ralph Loop (Manual Execution)

## Executive Summary

**Goal**: Create comprehensive integration tests for sfc-fetch using Claude Code with Ralph Loop pattern.

**Status**: Ready to execute
- ✅ Unit tests complete (145 tests, 80.08% coverage)
- ✅ Integration test plan documented
- ✅ Ralph Loop pattern understood from previous unit test success
- ✅ Environment ready (claude user, tmux, workspace)
- ⚠️ Ralph plugin from marketplace not loading - will use manual Ralph Loop pattern

**Estimated Duration**: 8-13 hours
**Approach**: Manual Ralph Loop execution in tmux (simulating the plugin behavior)

---

## Current State Analysis

### Unit Test Status
```
Total Tests: 145
Passing: 145 (100%)
Line Coverage: 80.08% ✓
Function Coverage: 79.61%
```

### Low Coverage Areas (Integration Test Targets)
| Module | Line Coverage | Why Low? |
|--------|---------------|----------|
| git.service.ts | 33% | Requires real git operations |
| queue.service.ts | 22% | Requires real queue execution |
| docling.service.ts | 51% | Requires actual PDF processing |
| workflow.service.ts | N/A | Not unit testable (NestJS DI) |
| backup.service.ts | N/A | Not unit testable (NestJS DI) |
| content.controller.ts | N/A | Not unit testable (NestJS DI) |

### What Integration Tests Will Cover
1. **API Controllers** - Real HTTP requests via Fastify inject
2. **Workflow Engine** - Complete document lifecycle
3. **Queue System** - Real job execution and retry logic
4. **Git Backup** - Dehydrate/hydrate workflows with real git operations
5. **E2E Scenarios** - End-to-end document processing

---

## Ralph Loop Configuration

### Local Configuration File
Location: `/root/.openclaw/workspace/.claude/ralph-loop.local.md`

```yaml
---
active: true
iteration: 1
max_iterations: 15
completion_promise: "INTEGRATION_TESTS_COMPLETE"
started_at: "2026-02-26T00:00:00Z"
---

Create comprehensive integration tests for sfc-fetch using TDD methodology.

## Phase 0: Analysis (Iteration 1-2)
1. Read sfc-research/DESIGN.md and TECH_STACK.md to understand architecture
2. Read sfc-fetch/README.md to understand current implementation
3. Read sfc-fetch/PROGRESS.md to see unit test coverage gaps
4. List sfc-fetch/tests/ to see existing unit tests
5. Read sfc-fetch/src/ to understand NestJS structure
6. Identify services that need integration testing (workflow, backup, controllers)
7. Write analysis to sfc-fetch/INTEGRATION_TESTS.md

## Phase 1: Setup (Iteration 3-4)
1. Create directory structure: `tests/integration/{api,workflows,backup,e2e,helpers}`
2. Install test dependencies:
   - `bun add -d @nestjs/testing supertest`
3. Create test-helpers.ts with:
   - NestJS testing module setup factory
   - Test database fixtures (lowdb)
   - Mock SFC API response fixtures
   - Git repository fixture initialization
   - Fastify adapter setup for HTTP testing
4. Create test database fixture: `data/test-db.json`
5. Create initial INTEGRATION_TESTS.md progress tracking
6. Run `bun test` to verify unit tests still pass

## Phase 2: API Controller Tests (Iteration 5-8)
For each controller (circulars, guidelines, consultations, news):
1. Write failing integration test for:
   - GET /<category>/:refNo - get document metadata
   - GET /<category>/:refNo/content - get markdown content
   - GET /<category>/:refNo/workflow/status - get workflow state
   - POST /<category>/:refNo/workflow/retry - retry failed workflow
   - POST /<category>/:refNo/workflow/re-run - re-run completed workflow
2. Implement test using supertest with real NestJS module
3. Test error responses (404, 400, 500)
4. Run test: `bun test tests/integration/api/<category>.controller.integration.test.ts`
5. If fail, debug and fix
6. Write progress to INTEGRATION_TESTS.md

## Phase 3: Workflow Tests (Iteration 9-11)
1. Write failing integration test for workflow state transitions:
   - PENDING → DISCOVERED → DOWNLOADING → PROCESSING → COMPLETED
   - Test sub-workflow steps: discover, download, convert, store
   - Test FAILED state and retry logic
2. Implement test with real workflow service and queue
3. Run tests and verify state persistence
4. Write failing integration test for queue job processing:
   - Job scheduling with priority
   - Job execution and status updates
   - Retry and exponential backoff behavior
   - Concurrent job handling
5. Implement and verify
6. Write progress to INTEGRATION_TESTS.md

## Phase 4: Git Backup Tests (Iteration 12-13)
1. Write failing integration test for git backup:
   - Dehydrate workflow: backup creation + commit + push
   - Hydrate workflow: restore from git backup
   - Archive management: re-run with output archiving
   - Git conflict handling (if applicable)
2. Implement test with real git operations (use test fixture repo)
3. Test error scenarios: network failure, merge conflicts
4. Write progress to INTEGRATION_TESTS.md

## Phase 5: E2E Tests (Iteration 14-15)
1. Write failing end-to-end test for complete document lifecycle:
   - Discovery → Download → Conversion → Storage → Backup
   - Cross-service interactions (workflow + queue + backup + content)
   - State persistence across the entire pipeline
2. Mock SFC API responses for realistic data
3. Implement and verify
4. Run all tests: `bun test`
5. Check coverage: `bun test --coverage`
6. If coverage <85%, identify gaps and add more tests
7. Final verification:
   - All integration tests passing
   - All unit tests still passing (no regression)
   - Coverage >85%
   - INTEGRATION_TESTS.md complete
8. Write final progress to INTEGRATION_TESTS.md

## Git Commits (After Each Major Milestone)
After completing phases 2, 3, 4, and 5:
1. `cd /home/claude/workspace/sfc-fetch`
2. `git add tests/integration/ INTEGRATION_TESTS.md`
3. `git commit -m "test: add [phase name] integration tests"`

## Progress Tracking
After each iteration, update INTEGRATION_TESTS.md with:
- Current phase and iteration number
- Tests created/modified
- Test results (passing/failing count)
- Coverage metrics
- Current blockers or issues
- Next steps

## Completion Criteria
When complete:
- All integration tests passing (expect 40-60 new tests)
- All unit tests still passing (145 tests)
- Total coverage >85%
- INTEGRATION_TESTS.md documents all work
- Git commits for each milestone (4+ commits)
- Output: <promise>INTEGRATION_TESTS_COMPLETE</promise>
```

---

## Execution Plan (Manual Ralph Loop)

Since the Ralph plugin cannot be loaded from the marketplace, we'll use the manual Ralph Loop pattern that successfully completed the unit tests.

### Step 1: Prepare Environment

```bash
# 1. Update local Ralph Loop configuration
cat > /root/.openclaw/workspace/.claude/ralph-loop.local.md << 'EOF'
---
active: true
iteration: 1
max_iterations: 15
completion_promise: "INTEGRATION_TESTS_COMPLETE"
started_at: "2026-02-26T00:00:00Z"
---

Create comprehensive integration tests for sfc-fetch using TDD methodology.

## Phase 0: Analysis (Iteration 1-2)
1. Read sfc-research/DESIGN.md and TECH_STACK.md
2. Read sfc-fetch/README.md and PROGRESS.md
3. List sfc-fetch/tests/ and src/
4. Identify services needing integration testing
5. Write analysis to INTEGRATION_TESTS.md

## Phase 1: Setup (Iteration 3-4)
1. Create tests/integration/{api,workflows,backup,e2e,helpers}
2. Install: bun add -d @nestjs/testing supertest
3. Create test-helpers.ts with NestJS module setup
4. Create data/test-db.json
5. Run bun test to verify unit tests pass
6. Update INTEGRATION_TESTS.md

## Phase 2: API Tests (Iteration 5-8)
1. Write failing test for circulars controller
2. Implement with supertest
3. Run and verify
4. Repeat for guidelines, consultations, news
5. Update INTEGRATION_TESTS.md

## Phase 3: Workflow Tests (Iteration 9-11)
1. Write failing workflow state test
2. Implement with real workflow service
3. Write failing queue job test
4. Implement and verify
5. Update INTEGRATION_TESTS.md

## Phase 4: Backup Tests (Iteration 12-13)
1. Write failing git backup test
2. Implement with real git ops
3. Test dehydrate/hydrate workflows
4. Update INTEGRATION_TESTS.md

## Phase 5: E2E Tests (Iteration 14-15)
1. Write failing E2E lifecycle test
2. Implement end-to-end test
3. Run all tests: bun test
4. Check coverage: bun test --coverage
5. If <85%, add more tests
6. Final verification
7. Update INTEGRATION_TESTS.md

## Git Commits
After phases 2-5: git add tests/integration/ INTEGRATION_TESTS.md && git commit -m "test: add [phase] integration tests"

## Completion
All tests passing, unit tests passing, coverage >85%, documented
Output: <promise>INTEGRATION_TESTS_COMPLETE</promise>
EOF

# 2. Verify claude user has workspace access
sudo -u claude ls -la /home/claude/workspace/sfc-fetch

# 3. Test dependencies check
cd /home/claude/workspace/sfc-fetch
cat package.json | grep -E "@nestjs/testing|supertest"
```

### Step 2: Create Tmux Session and Launch

```bash
# 1. Kill any existing session
sudo -u claude tmux kill-session -t integration-tests 2>/dev/null || true

# 2. Create new tmux session
sudo -u claude tmux new-session -d -s integration-tests -c /home/claude/workspace/sfc-fetch

# 3. Set up environment variables
sudo -u claude tmux send-keys -t integration-tests 'export PATH="/root/.nvm/versions/node/v24.13.0/bin:$PATH"' Enter
sudo -u claude tmux send-keys -t integration-tests 'export BUN_INSTALL="$HOME/.bun"' Enter
sudo -u claude tmux send-keys -t integration-tests 'export PATH="$BUN_INSTALL/bin:$PATH"' Enter

# 4. Navigate to project
sudo -u claude tmux send-keys -t integration-tests 'cd /home/claude/workspace/sfc-fetch' Enter

# 5. Start Claude Code with both repos (allowing permission bypass)
sudo -u claude tmux send-keys -t integration-tests 'claude --add-dir . --add-dir /home/claude/workspace/sfc-research --allow-dangerously-skip-permissions' Enter

# 6. Wait for Claude Code to initialize
sleep 5

# 7. Handle initial prompts (if any)
# Check for prompts
sudo -u claude tmux capture-pane -t integration-tests -p | tail -20
# If workspace trust prompt appears, send "1"
# If theme prompt appears, send "1"
```

### Step 3: Start the Ralph Loop (Manual)

```bash
# Since the /ralph-loop command won't work, we'll manually instruct Claude Code

# Send the Ralph Loop prompt directly
sudo -u claude tmux send-keys -t integration-tests 'You are running a Ralph Loop for integration test development.

READ /root/.openclaw/workspace/.claude/ralph-loop.local.md for your task instructions.

Follow the phases and iterations as specified:
- Phase 0: Analysis (Iteration 1-2)
- Phase 1: Setup (Iteration 3-4)
- Phase 2: API Tests (Iteration 5-8)
- Phase 3: Workflow Tests (Iteration 9-11)
- Phase 4: Backup Tests (Iteration 12-13)
- Phase 5: E2E Tests (Iteration 14-15)

AFTER EACH ITERATION:
1. Update INTEGRATION_TESTS.md with progress
2. Git commit after each major phase
3. Update iteration count in ralph-loop.local.md

When complete, output: <promise>INTEGRATION_TESTS_COMPLETE</promise>' Enter

# Give Claude Code time to read and start
sleep 10
```

### Step 4: Monitor Progress

```bash
# Monitor iteration progress (every 5 minutes)
watch -n 300 'sudo -u claude tmux capture-pane -t integration-tests -p | grep -i "phase\|iteration" | tail -5'

# Monitor for completion
watch -n 60 'sudo -u claude tmux capture-pane -t integration-tests -p | grep -i "promise"'

# Monitor for errors
watch -n 120 'sudo -u claude tmux capture-pane -t integration-tests -p | grep -i "error\|fail\|❌"'

# View full output
sudo -u claude tmux capture-pane -t integration-tests -p -S -100

# Check progress file
watch -n 60 'cat /home/claude/workspace/sfc-fetch/INTEGRATION_TESTS.md'
```

### Step 5: Verify Completion

```bash
# 1. Check for completion promise
sudo -u claude tmux capture-pane -t integration-tests -p | grep "INTEGRATION_TESTS_COMPLETE"

# 2. View final progress
cat /home/claude/workspace/sfc-fetch/INTEGRATION_TESTS.md

# 3. Run all tests
cd /home/claude/workspace/sfc-fetch && bun test

# 4. Check coverage
bun test --coverage

# 5. Check git commits
cd /home/claude/workspace/sfc-fetch && git log --oneline -10

# 6. Kill tmux session
tmux kill-session -t integration-tests
```

---

## Expected Outcomes

### Test Structure After Completion
```
sfc-fetch/tests/integration/
├── api/
│   ├── circulars.controller.integration.test.ts    ✅
│   ├── guidelines.controller.integration.test.ts   ✅
│   ├── consultations.controller.integration.test.ts ✅
│   └── news.controller.integration.test.ts       ✅
├── workflows/
│   ├── workflow.integration.test.ts                ✅
│   └── queue.integration.test.ts                   ✅
├── backup/
│   └── git.backup.integration.test.ts              ✅
├── e2e/
│   └── document.lifecycle.integration.test.ts     ✅
└── helpers/
    └── test-helpers.ts                             ✅
```

### Test Results Expected
```bash
$ bun test
Test Suites: 1 failed, 22 passed, 23 total
Tests:       190 passed, 190 total  # 145 unit + 45 integration

$ bun test --coverage
File                    | % Stmts | % Branch | % Funcs | % Lines |
------------------------|---------|----------|---------|--------|
All files               |   86.50 |    82.10 |   84.50 |   87.00 |
```

### Git History Expected
```bash
$ git log --oneline -6
[HASH] test: add E2E integration tests
[HASH] test: add backup integration tests
[HASH] test: add workflow integration tests
[HASH] test: add API controller integration tests
[HASH] test: add integration test setup and helpers
[HASH] test: add integration test dependencies
```

---

## Monitoring Guidelines

### Progress Indicators (What to Look For)
✅ **Good Signs:**
- Phase completion messages ("Phase 1: Setup complete")
- Test files being created
- Test suites passing
- Git commits appearing
- Iteration numbers increasing

❌ **Bad Signs:**
- Same iteration repeating for >30 minutes (stuck in loop)
- Error messages without recovery attempts
- No progress for >60 minutes
- Session crashed (tmux capture returns nothing)
- Tests failing without fix attempts

### Monitoring Commands

```bash
# Quick status check
sudo -u claude tmux capture-pane -t integration-tests -p | tail -30

# Check current iteration
sudo -u claude tmux capture-pane -t integration-tests -p | grep -E "Phase|Iteration" | tail -3

# Check for errors
sudo -u claude tmux capture-pane -t integration-tests -p | grep -iE "error|fail|❌" | tail -5

# Check progress file
cat /home/claude/workspace/sfc-fetch/INTEGRATION_TESTS.md | tail -40

# Check git activity
cd /home/claude/workspace/sfc-fetch && git log --oneline --since="1 hour ago"

# Check if Claude Code is still running
ps aux | grep claude
```

---

## Interruption Handling

### If Session Gets Stuck

**Symptoms:**
- Same iteration repeating
- No output for >60 minutes
- Claude Code appears frozen

**Recovery Steps:**

```bash
# 1. Check current progress
cat /home/claude/workspace/sfc-fetch/INTEGRATION_TESTS.md

# 2. Check Ralph loop state
cat /root/.openclaw/workspace/.claude/ralph-loop.local.md

# 3. Kill stuck session
tmux kill-session -t integration-tests

# 4. Resume with context
sudo -u claude tmux new-session -d -s integration-tests -c /home/claude/workspace/sfc-fetch
sudo -u claude tmux send-keys -t integration-tests 'export PATH="/root/.nvm/versions/node/v24.13.0/bin:$PATH"' Enter
sudo -u claude tmux send-keys -t integration-tests 'cd /home/claude/workspace/sfc-fetch' Enter
sudo -u claude tmux send-keys -t integration-tests 'claude --add-dir . --add-dir /home/claude/workspace/sfc-research --allow-dangerously-skip-permissions' Enter
sleep 5

# 5. Resume instruction
sudo -u claude tmux send-keys -t integration-tests "Continue from where you left off.

READ /home/claude/workspace/sfc-fetch/INTEGRATION_TESTS.md to see current progress.
READ /root/.openclaw/workspace/.claude/ralph-loop.local.md for task instructions.

Continue from the last completed phase/iteration.

When complete: <promise>INTEGRATION_TESTS_COMPLETE</promise>" Enter
```

### If Claude Code Crashes

**Symptoms:**
- Process list shows no claude process
- tmux capture shows exit message

**Recovery Steps:**

```bash
# 1. Verify crash
ps aux | grep claude
tmux capture-pane -t integration-tests -p | tail -10

# 2. Restart session
sudo -u claude tmux kill-session -t integration-tests
sudo -u claude tmux new-session -d -s integration-tests -c /home/claude/workspace/sfc-fetch
sudo -u claude tmux send-keys -t integration-tests 'export PATH="/root/.nvm/versions/node/v24.13.0/bin:$PATH"' Enter
sudo -u claude tmux send-keys -t integration-tests 'cd /home/claude/workspace/sfc-fetch' Enter
sudo -u claude tmux send-keys -t integration-tests 'claude --add-dir . --add-dir /home/claude/workspace/sfc-research --allow-dangerously-skip-permissions' Enter
sleep 5

# 3. Resume
sudo -u claude tmux send-keys -t integration-tests "Claude Code crashed and restarted. Continue your integration test work.

READ /home/claude/workspace/sfc-fetch/INTEGRATION_TESTS.md for progress.
Follow the Ralph Loop instructions from /root/.openclaw/workspace/.claude/ralph-loop.local.md.

When complete: <promise>INTEGRATION_TESTS_COMPLETE</promise>" Enter
```

---

## Cleanup After Completion

```bash
# 1. Kill tmux session
tmux kill-session -t integration-tests

# 2. Archive session logs (optional)
sudo -u claude tmux capture-pane -t integration-tests -p -S -0 > /tmp/integration-tests-session.log 2>/dev/null || true

# 3. Verify no orphaned processes
ps aux | grep claude

# 4. View final summary
cat /home/claude/workspace/sfc-fetch/INTEGRATION_TESTS.md

# 5. Create final summary document
cat > /home/claude/workspace/sfc-fetch/INTEGRATION_TESTS_COMPLETION.md << 'EOF'
# Integration Tests - Completion Summary

## Task
Create comprehensive integration tests for sfc-fetch using Ralph Loop pattern.

## Results

### Tests Created
- API Controller Tests: 4 files
- Workflow Tests: 2 files
- Backup Tests: 1 file
- E2E Tests: 1 file
- Test Helpers: 1 file

### Test Results
- Total Tests: 190 (145 unit + 45 integration)
- All Tests: PASSING ✅
- Line Coverage: >85% ✅

### Git Commits
- Phase 2: API integration tests
- Phase 3: Workflow integration tests
- Phase 4: Backup integration tests
- Phase 5: E2E integration tests

### Documentation
- INTEGRATION_TESTS.md: Complete progress log
- All test files: Documented with comments

## Files Modified
- tests/integration/api/* - 4 controller test files
- tests/integration/workflows/* - 2 workflow test files
- tests/integration/backup/* - 1 backup test file
- tests/integration/e2e/* - 1 E2E test file
- tests/integration/helpers/* - 1 helper file
- INTEGRATION_TESTS.md - Progress tracking
- package.json - Added @nestjs/testing and supertest

## Completion Status
✅ All integration tests created and passing
✅ Unit tests still passing (no regression)
✅ Coverage >85% achieved
✅ Documentation complete
✅ Git commits created for each milestone

Task completed successfully on [DATE].
EOF
```

---

## Alternative Approaches (If Manual Loop Fails)

### Option 1: Direct Test Development
```bash
cd /home/claude/workspace/sfc-fetch

# Install dependencies
bun add -d @nestjs/testing supertest

# Create structure
mkdir -p tests/integration/{api,workflows,backup,e2e,helpers}

# Manually create each test file following the plan
# Use Claude Code interactively to write tests
```

### Option 2: Sub-Agent Session
```bash
# Use sessions_spawn to create an isolated sub-agent
# Provide the comprehensive task description
# Monitor and steer as needed
```

### Option 3: Cursor Agent
```bash
# Use tmux skill to launch Cursor Agent
# Provide the task from RALPH_LOOP_PLAN.md
# Monitor progress manually
```

---

## Next Steps

**To proceed with this plan:**

1. **Update the Ralph Loop configuration** (Step 1)
2. **Create and launch tmux session** (Step 2-3)
3. **Monitor progress periodically** (Step 4)
4. **Verify completion** (Step 5)

**Estimated time**: 8-13 hours
**Recommended monitoring check interval**: Every 30 minutes
**Escalation point**: If stuck for >2 hours without progress

---

*Plan created: 2026-02-26*
*Based on: RALPH_LOOP_PLAN.md, INTEGRATION_TESTS_PLAN.md*
*Previous success: Unit tests completed using same Ralph Loop pattern*
