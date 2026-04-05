# Integration Tests Plan - Ralph Loop Framework

## Task Specification Template

### Objective
Create integration tests for sfc-fetch that cover functionality not already covered by unit tests, using Claude Code with Ralph Loop for autonomous iterative development.

**Success Criteria:**
- All integration tests created and passing
- Unit tests still passing (regression check)
- Coverage increased to >85% line coverage
- Integration tests cover workflow, backup, queue, and API endpoints
- Documentation updated (INTEGRATION_TESTS.md)
- Git commits for each milestone

### Repositories

| Repo | Path | Role |
|------|------|------|
| sfc-fetch | `/home/claude/workspace/sfc-fetch` | Implementation + integration tests |
| sfc-research | `/home/claude/workspace/sfc-research` | Research documentation (DESIGN.md, TECH_STACK.md) |

### Execution Pattern

**Task Type:** TDD Cycle (Test-Driven Development for Integration Tests)

**Autonomy:** Ralph Loop (autonomous iteration)

**Iteration Limit:** 15 (safety net)

**Completion Promise:** `<promise>INTEGRATION_TESTS_COMPLETE</promise>`

### Monitoring

**Check Frequency:** Every 5 minutes

**Report Level:** Balanced (milestones + errors + git commits)

**Interruption Handling:** Pause/Resume with PROGRESS.md checkpointing

### Completion Criteria

**Exact String:** `<promise>INTEGRATION_TESTS_COMPLETE</promise>`

**What "Done" Looks Like:**
- All integration test files created:
  - `tests/integration/api/circulars.controller.integration.test.ts`
  - `tests/integration/api/guidelines.controller.integration.test.ts`
  - `tests/integration/api/consultations.controller.integration.test.ts`
  - `tests/integration/api/news.controller.integration.test.ts`
  - `tests/integration/workflows/workflow.integration.test.ts`
  - `tests/integration/workflows/queue.integration.test.ts`
  - `tests/integration/backup/git.backup.integration.test.ts`
  - `tests/integration/e2e/document.lifecycle.integration.test.ts`
  - `tests/integration/helpers/test-helpers.ts`
- All integration tests passing: `bun test tests/integration/**/*.test.ts`
- Unit tests still passing: `bun test`
- Coverage >85%: `bun test --coverage`
- INTEGRATION_TESTS.md documented with results
- Git commits for each milestone

---

## Ralph Loop Prompt

```markdown
Create integration tests for sfc-fetch using TDD approach.

Instructions:

## Phase 0: Analysis (Iteration 1-2)

1. Read sfc-research/DESIGN.md and sfc-research/TECH_STACK.md to understand system architecture
2. Read sfc-fetch/README.md to understand current implementation
3. Read sfc-fetch/PROGRESS.md to see unit test coverage gaps
4. List sfc-fetch/tests/ to see existing unit tests
5. Identify what integration tests are needed
6. Write analysis to sfc-fetch/INTEGRATION_TESTS.md

## Phase 1: Setup (Iteration 3-4)

1. Create directory structure: `tests/integration/{api,workflows,backup,e2e,helpers}`
2. Install test dependencies: `bun add -d @nestjs/testing supertest`
3. Create test-helpers.ts with:
   - Test database fixtures
   - NestJS testing module setup
   - Mock SFC API responses
   - Git repository fixture for backup tests
4. Create test database fixture in `data/test-db.json`
5. Run `bun test` to verify unit tests still pass

## Phase 2: API Endpoint Tests (Iteration 5-8)

1. Write failing integration test for circulars controller:
   - GET /circulars/:refNo
   - GET /circulars/:refNo/content
   - GET /circulars/:refNo/workflow/status
   - POST /circulars/:refNo/workflow/retry
   - POST /circulars/:refNo/workflow/re-run
2. Implement test (use Fastify inject or supertest)
3. Run `bun test tests/integration/api/circulars.controller.integration.test.ts`
4. If fail, debug and fix
5. Repeat for guidelines, consultations, news controllers
6. Write progress to sfc-fetch/INTEGRATION_TESTS.md

## Phase 3: Workflow Tests (Iteration 9-11)

1. Write failing integration test for workflow state transitions:
   - PENDING → DISCOVERED → DOWNLOADING → PROCESSING → COMPLETED
   - Sub-workflow steps: discover, download, convert, store
2. Implement test with real workflow service
3. Run tests and verify
4. Write failing integration test for queue job processing:
   - Job scheduling and execution
   - Retry and backoff behavior
   - Concurrent job handling
5. Implement and verify
6. Write progress to sfc-fetch/INTEGRATION_TESTS.md

## Phase 4: Backup Tests (Iteration 12-13)

1. Write failing integration test for git backup:
   - Dehydrate workflow (backup creation and commit)
   - Hydrate workflow (restore from git backup)
   - Archive management for re-runs
2. Implement test with real git operations (use test fixture repo)
3. Run tests and verify
4. Write progress to sfc-fetch/INTEGRATION_TESTS.md

## Phase 5: E2E Tests (Iteration 14-15)

1. Write failing end-to-end test for document lifecycle:
   - Complete document processing from discovery to backup
   - Cross-service interactions (workflow + queue + backup + content)
2. Implement and verify
3. Run all tests: `bun test`
4. Check coverage: `bun test --coverage`
5. If coverage <85%, add more tests to cover gaps
6. Final verification: all tests passing, coverage >85%
7. Write final progress to sfc-fetch/INTEGRATION_TESTS.md

## Git Commits

After each major milestone (phases 2-5):
1. `cd /home/claude/workspace/sfc-fetch`
2. `git add tests/integration/ INTEGRATION_TESTS.md`
3. `git commit -m "test: add [phase name] integration tests"`

## Progress Tracking

After each iteration, update sfc-fetch/INTEGRATION_TESTS.md with:
- Current phase and iteration
- Tests created/modified
- Test results (passing/failing)
- Coverage metrics
- Next steps

## Completion

When complete:
- All integration tests passing
- Unit tests still passing
- Coverage >85%
- INTEGRATION_TESTS.md documented
- Git commits created for each milestone
- Output: <promise>INTEGRATION_TESTS_COMPLETE</promise>
```

---

## Execution Plan

### Step 1: Setup Environment

```bash
# 1. Ensure workspace is ready
sudo -u claude ls -la /home/claude/workspace/

# 2. Verify test dependencies exist in sfc-fetch
cd /home/claude/workspace/sfc-fetch && cat package.json

# 3. If @nestjs/testing not present, add it
bun add -d @nestjs/testing supertest
```

### Step 2: Create Tmux Session

```bash
# Create tmux session as "claude" user
sudo -u claude tmux kill-session -t integration-tests 2>/dev/null || true
sudo -u claude tmux new-session -d -s integration-tests -c /home/claude/workspace/sfc-fetch

# Verify session exists
tmux ls
```

### Step 3: Launch Claude Code with Permission Bypass

```bash
# Set up PATH and start Claude Code
sudo -u claude tmux send-keys -t integration-tests 'export PATH="$HOME/.nvm/versions/node/v24.13.0/bin:$PATH"' Enter
sudo -u claude tmux send-keys -t integration-tests 'export BUN_INSTALL="$HOME/.bun"' Enter
sudo -u claude tmux send-keys -t integration-tests 'export PATH="$BUN_INSTALL/bin:$PATH"' Enter
sudo -u claude tmux send-keys -t integration-tests 'cd /home/claude/workspace/sfc-fetch' Enter
sudo -u claude tmux send-keys -t integration-tests 'claude --add-dir . --add-dir /home/claude/workspace/sfc-research --allow-dangerously-skip-permissions' Enter
```

### Step 4: Handle Initial Prompts

```bash
# Wait for Claude Code to start
sleep 5

# Check for prompts
sudo -u claude tmux capture-pane -t integration-tests -p

# If workspace trust prompt appears, send "a" or "1"
# If theme prompt appears, send "1"
sudo -u claude tmux send-keys -t integration-tests "1" Enter
```

### Step 5: Start Ralph Loop

```bash
# Paste the Ralph Loop prompt (from above)
sudo -u claude tmux send-keys -t integration-tests '/ralph-loop:ralph-loop "Create integration tests for sfc-fetch using TDD approach.

Instructions:

## Phase 0: Analysis (Iteration 1-2)
1. Read sfc-research/DESIGN.md and sfc-research/TECH_STACK.md
2. Read sfc-fetch/README.md
3. Read sfc-fetch/PROGRESS.md
4. List sfc-fetch/tests/
5. Identify integration test needs
6. Write analysis to sfc-fetch/INTEGRATION_TESTS.md

## Phase 1: Setup (Iteration 3-4)
1. Create tests/integration/{api,workflows,backup,e2e,helpers}
2. Install: bun add -d @nestjs/testing supertest
3. Create test-helpers.ts with fixtures and setup
4. Create data/test-db.json
5. Run bun test to verify

## Phase 2: API Tests (Iteration 5-8)
1. Write failing test for circulars controller
2. Implement with Fastify inject/supertest
3. Run and verify
4. Repeat for guidelines, consultations, news
5. Update INTEGRATION_TESTS.md

## Phase 3: Workflow Tests (Iteration 9-11)
1. Write failing workflow state test
2. Implement and verify
3. Write failing queue job test
4. Implement and verify
5. Update INTEGRATION_TESTS.md

## Phase 4: Backup Tests (Iteration 12-13)
1. Write failing git backup test
2. Implement with test fixture repo
3. Run and verify
4. Update INTEGRATION_TESTS.md

## Phase 5: E2E Tests (Iteration 14-15)
1. Write failing E2E lifecycle test
2. Implement and verify
3. Run all tests: bun test
4. Check coverage: bun test --coverage
5. If <85%, add more tests
6. Final verification
7. Update INTEGRATION_TESTS.md

## Git Commits
After phases 2-5: git add tests/integration/ INTEGRATION_TESTS.md && git commit -m \"test: add [phase] tests\"

## Completion
All tests passing, unit tests passing, coverage >85%, documented
Output: <promise>INTEGRATION_TESTS_COMPLETE</promise>" --completion-promise INTEGRATION_TESTS_COMPLETE --max-iterations 15' Enter
```

### Step 6: Monitor Progress

```bash
# Monitor every 5 minutes
watch -n 300 'sudo -u claude tmux capture-pane -t integration-tests -p | grep -i "iteration" | tail -3'

# Monitor for completion
watch -n 60 'sudo -u claude tmux capture-pane -t integration-tests -p | grep -i "promise"'

# Monitor for errors
watch -n 120 'sudo -u claude tmux capture-pane -t integration-tests -p | grep -i "error\|fail"'

# View full output
sudo -u claude tmux capture-pane -t integration-tests -p -S -100
```

### Step 7: Check Progress File

```bash
# Monitor INTEGRATION_TESTS.md
watch -n 60 'cat /home/claude/workspace/sfc-fetch/INTEGRATION_TESTS.md'

# View current status
cat /home/claude/workspace/sfc-fetch/INTEGRATION_TESTS.md
```

### Step 8: Verify Completion

```bash
# Check for completion promise
sudo -u claude tmux capture-pane -t integration-tests -p | grep "INTEGRATION_TESTS_COMPLETE"

# View final progress
cat /home/claude/workspace/sfc-fetch/INTEGRATION_TESTS.md

# Run all tests
cd /home/claude/workspace/sfc-fetch && bun test

# Check coverage
bun test --coverage

# Check git commits
cd /home/claude/workspace/sfc-fetch && git log --oneline -10
```

---

## Monitoring Guidelines

### What to Monitor

**Indicators of Progress:**
- Iteration count increasing (Iteration X of 15)
- Phase completion messages ("Phase 1: Setup complete")
- Test files being created
- Git commits appearing

**Red Flags:**
- Same iteration repeating for >30 minutes (stuck)
- Error messages without recovery attempts
- No progress for >60 minutes
- Session crashed (tmux capture returns error)

**Completion Indicators:**
- `<promise>INTEGRATION_TESTS_COMPLETE</promise>` appears
- INTEGRATION_TESTS.md shows all phases complete
- All tests passing in final output

### Monitoring Commands

```bash
# Quick status check
sudo -u claude tmux capture-pane -t integration-tests -p | tail -20

# Check current iteration
sudo -u claude tmux capture-pane -t integration-tests -p | grep "Iteration" | tail -1

# Check for errors
sudo -u claude tmux capture-pane -t integration-tests -p | grep -i "error" | tail -5

# Check progress file
cat /home/claude/workspace/sfc-fetch/INTEGRATION_TESTS.md | tail -30

# Check git activity
cd /home/claude/workspace/sfc-fetch && git log --oneline --since="1 hour ago"
```

---

## Interruption Handling

### If Session Crashes

```bash
# 1. Check if session is dead
tmux ls | grep integration-tests

# 2. Check progress file
cat /home/claude/workspace/sfc-fetch/INTEGRATION_TESTS.md

# 3. Kill stuck session
tmux kill-session -t integration-tests

# 4. Resume from last checkpoint
sudo -u claude tmux new-session -d -s integration-tests -c /home/claude/workspace/sfc-fetch
sudo -u claude tmux send-keys -t integration-tests 'export PATH="$HOME/.nvm/versions/node/v24.13.0/bin:$PATH"' Enter
sudo -u claude tmux send-keys -t integration-tests 'cd /home/claude/workspace/sfc-fetch' Enter
sudo -u claude tmux send-keys -t integration-tests 'claude --add-dir . --add-dir /home/claude/workspace/sfc-research --allow-dangerously-skip-permissions' Enter

# 5. Wait for prompts, then send "1"

# 6. Resume with context
sudo -u claude tmux send-keys -t integration-tests '/ralph-loop:ralph-loop "Continue from where you left off.

PROGRESS.md shows current state. Continue from that phase.

Completion criteria: All integration tests passing, unit tests passing, coverage >85%
Output: <promise>INTEGRATION_TESTS_COMPLETE</promise>" --completion-promise INTEGRATION_TESTS_COMPLETE --max-iterations 8' Enter
```

---

## Expected Outcomes

### File Structure After Completion

```
sfc-fetch/tests/integration/
├── api/
│   ├── circulars.controller.integration.test.ts  ✅
│   ├── guidelines.controller.integration.test.ts  ✅
│   ├── consultations.controller.integration.test.ts  ✅
│   └── news.controller.integration.test.ts  ✅
├── workflows/
│   ├── workflow.integration.test.ts  ✅
│   └── queue.integration.test.ts  ✅
├── backup/
│   └── git.backup.integration.test.ts  ✅
├── e2e/
│   └── document.lifecycle.integration.test.ts  ✅
└── helpers/
    └── test-helpers.ts  ✅
```

### Test Results

```bash
$ bun test
✅ All integration tests passing (50+ tests)
✅ All unit tests still passing (145 tests)
✅ Total: 195+ tests passing

$ bun test --coverage
Line coverage: >85% ✅
Function coverage: >85% ✅
```

### Git History

```bash
$ git log --oneline -6
[HASH] test: add E2E integration tests
[HASH] test: add backup integration tests
[HASH] test: add workflow integration tests
[HASH] test: add API endpoint integration tests
[HASH] test: add integration test setup and helpers
[HASH] test: add integration test dependencies
```

---

## Cleanup After Completion

```bash
# Kill tmux session
tmux kill-session -t integration-tests

# Archive session logs
sudo -u claude tmux capture-pane -t integration-tests -p -S -0 > /tmp/integration-tests.log

# Verify no orphaned processes
ps aux | grep claude

# View final summary
cat /home/claude/workspace/sfc-fetch/INTEGRATION_TESTS.md
```
