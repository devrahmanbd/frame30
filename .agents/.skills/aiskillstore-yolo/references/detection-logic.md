# Yolo Mode: Auto-Detection Logic

Reference for when to trigger browser automation.

## Overview

When yolo mode is enabled (`yolo_mode: on` in CLAUDE.md), automatically detect when Lovable prompts are needed and trigger browser automation.

## Detection Criteria

### 1. Edge Function Deployment Detection

**When to trigger:**

- User runs `/deploy-edge` command
- Files in `supabase/functions/` have been modified
- Changes are committed and pushed to `main` branch

**Detection steps:**

1. **Check yolo mode status:**

   ```
   - Read CLAUDE.md
   - Look for: yolo_mode: on
   - If off or not found → skip automation
   ```

2. **Verify changes are ready:**

   ```
   - Run: git status
   - Check: No uncommitted changes in supabase/functions/
   - Run: git log origin/main..HEAD
   - Check: All commits are pushed to main
   ```

3. **Identify which functions changed:**

   ```
   - Run: git diff origin/main HEAD -- supabase/functions/
   - Parse: Which function directories have changes
   - List: Function names (folder names)
   ```

4. **Trigger automation:**
   ```
   - If single function changed:
     Prompt: "Deploy the [function-name] edge function"

   - If multiple functions changed:
     Prompt: "Deploy all edge functions"

   - Load automation-workflows.md
   - Execute browser automation
   ```

**Example:**

```
Files changed:
  supabase/functions/send-email/index.ts
  supabase/functions/send-email/utils.ts

Detection:
✅ yolo_mode: on
✅ Changes in supabase/functions/
✅ All committed and pushed to main
✅ Function identified: send-email

Action: Trigger automation
Prompt: "Deploy the send-email edge function"
```

---

### 2. Migration Application Detection

**When to trigger:**

- User runs `/apply-migration` command
- New files in `supabase/migrations/` exist
- Changes are committed and pushed to `main` branch

**Detection steps:**

1. **Check yolo mode status:**

   ```
   - Read CLAUDE.md
   - Look for: yolo_mode: on
   - If off → skip automation
   ```

2. **Verify migrations are ready:**

   ```
   - Run: git status
   - Check: No uncommitted migrations
   - Run: git log origin/main..HEAD -- supabase/migrations/
   - Check: Migration files are pushed to main
   ```

3. **List pending migrations:**

   ```
   - List all files in supabase/migrations/
   - Sort by timestamp (filename prefix)
   - Identify: New or modified migrations
   ```

4. **Trigger automation:**
   ```
   - If one migration:
     Prompt: "Apply the [migration-name] migration"

   - If multiple migrations:
     Prompt: "Apply pending Supabase migrations"

   - Load automation-workflows.md
   - Execute browser automation
   ```

**Example:**

```
Files in supabase/migrations/:
  20240115103000_add_user_preferences.sql (new)

Detection:
✅ yolo_mode: on
✅ New migration file exists
✅ Committed and pushed to main

Action: Trigger automation
Prompt: "Apply pending Supabase migrations"
```

---

## Integration with Commands

### /deploy-edge Integration

Add this logic at the end of `/deploy-edge` command:

```markdown
## Check for Yolo Mode

1. Read CLAUDE.md
2. Check if `yolo_mode: on`

3. If yolo mode is ON:
   - Activate yolo skill
   - Execute browser automation (see automation-workflows.md)
   - Run testing based on yolo_testing setting
   - Show deployment summary
   - Exit (don't show manual prompt)

4. If yolo mode is OFF:
   - Show manual prompt (current behavior):
     📋 **LOVABLE PROMPT:**

     > "Deploy the [name] edge function"

   - Suggest enabling yolo mode:
     💡 Tip: Enable yolo mode to automate this!
     Run: /yolo on
```

### /apply-migration Integration

Add this logic at the end of `/apply-migration` command:

```markdown
## Check for Yolo Mode

1. Read CLAUDE.md
2. Check if `yolo_mode: on`

3. If yolo mode is ON:
   - Activate yolo skill
   - Execute browser automation
   - Run testing if enabled
   - Show summary
   - Exit

4. If yolo mode is OFF:
   - Show manual prompt:
     📋 **LOVABLE PROMPT:**

     > "Apply pending Supabase migrations"

   - Suggest yolo mode:
     💡 Automate this with: /yolo on
```

---

## Proactive Detection: Auto-Deploy After Git Push

When `auto_deploy: on` is enabled, Claude automatically detects and deploys backend changes after a successful git push to main.

### Activation Criteria

Auto-deploy triggers when ALL conditions are met:

1. `yolo_mode: on` in CLAUDE.md
2. `auto_deploy: on` in CLAUDE.md
3. `git push origin main` completed successfully
4. Push included changes to `supabase/functions/` or `supabase/migrations/`

### Detection After Git Push

**Step 1: Analyze pushed files**

```
After: git push origin main [succeeds]

1. Get files changed in push:
   Run: git diff --name-only HEAD~[n]..HEAD
   (where n = number of commits pushed)

2. Filter for backend files:
   - Edge functions: supabase/functions/**/*
   - Migrations: supabase/migrations/*.sql
```

**Step 2: Check configuration**

```
1. Read CLAUDE.md
2. Check yolo_mode and auto_deploy settings
3. Branch based on settings:
   - Both ON → Proceed with automation
   - yolo_mode ON, auto_deploy OFF → Notify only
   - yolo_mode OFF → Show manual prompts
```

**Step 3: Verify GitHub Sync (DOM-based)**

```
IMPORTANT: Before submitting deployment prompts, verify Lovable has synced.

Use DOM-based detection (faster & more reliable than visual scanning):
1. Navigate to Lovable project page
2. Use read_page to get page content
3. Search for commit message text in sidebar
4. Poll every 2 seconds until found (max 60 seconds)

See automation-workflows.md Step 1.5 for detailed implementation.

WHY THIS MATTERS:
- Lovable syncs from GitHub asynchronously (1-2 min)
- Deploying before sync = deploying stale code
- DOM-based detection is faster than visual scanning for icons
```

**Step 4: Execute or notify**

```
If auto_deploy: on AND sync verified:
  - Show: "🤖 Auto-deploy: Backend changes detected..."
  - Execute browser automation
  - Run tests if enabled
  - Show summary

If auto_deploy: off:
  - Show: "📦 Backend changes detected. Run /deploy-edge to deploy."
  - Don't auto-execute
```

### Example Auto-Deploy Flow

```
User pushes changes including supabase/functions/send-email/index.ts

Claude detects:
  ✅ Push to main successful
  ✅ Backend files changed: supabase/functions/send-email/
  ✅ yolo_mode: on
  ✅ auto_deploy: on

🤖 Auto-Deploy Triggered

Backend changes detected in your push:
- Edge functions: send-email

⏳ Step 1/7: Navigating to Lovable project...
✅ Step 2/7: Located chat interface
✅ Step 3/7: Submitted prompt: "Deploy the send-email edge function"
⏳ Step 4/7: Waiting for Lovable response...
✅ Step 5/7: Deployment confirmed
⏳ Step 6/7: Running verification tests...
✅ Step 7/7: All tests passed

## Auto-Deploy Summary
**Trigger:** git push to main
**Function:** send-email
**Status:** ✅ Success
**Duration:** 38 seconds
```

### Graceful Fallback

If auto-deploy fails for ANY reason, fall back gracefully:

```
❌ Auto-deploy failed: [reason]

Fallback - complete manually in Lovable:

📋 **LOVABLE PROMPT:**
> "Deploy the send-email edge function"

[Troubleshooting suggestions based on error]
```

**Never block the user** - always provide manual options.

See `references/post-push-automation.md` for complete implementation details.

---

## Reading CLAUDE.md for Yolo Configuration

**Check if yolo mode is enabled:**

```
1. Read file: CLAUDE.md (in project root)
2. Parse markdown sections
3. Find: "## Yolo Mode Configuration (Beta)"
4. Extract fields:
   - Status: on/off
   - Auto-Deploy: on/off (NEW)
   - Deployment Testing: on/off
   - Auto-run Tests: on/off
   - Debug Mode: on/off
5. Return configuration object
```

**Example CLAUDE.md section:**

```markdown
## Yolo Mode Configuration (Beta)

- **Status**: on
- **Auto-Deploy**: on
- **Deployment Testing**: on
- **Auto-run Tests**: off
- **Debug Mode**: off
- **Last Updated**: 2025-01-03 10:30:00
```

**Parsed result:**

```javascript
{
  yolo_mode: "on",
  auto_deploy: "on",
  yolo_testing: "on",
  auto_tests: "off",
  yolo_debug: "off",
  last_updated: "2025-01-03 10:30:00"
}
```

**Auto-deploy decision logic:**

```
if (yolo_mode === "on" && auto_deploy === "on") {
  // Automatically deploy after git push
  triggerAutoDeployment();
} else if (yolo_mode === "on") {
  // Notify but don't auto-deploy
  showDeploymentNotification();
} else {
  // Show manual prompts
  showManualPrompts();
}
```

---

## Error Handling in Detection

**CLAUDE.md not found:**

```
- Assume yolo mode is off
- Proceed with manual prompts
- Don't show error (project may not be initialized)
```

**Yolo mode section not in CLAUDE.md:**

```
- Assume yolo mode is off
- Proceed with manual prompts
```

**Invalid yolo mode value:**

```
- Treat as "off"
- Proceed with manual prompts
```

**Git operations fail:**

```
- Show error to user
- Can't determine if changes are pushed
- Proceed with manual prompts
- Suggest: git status, git push
```

---

## Decision Flow

```
User runs /deploy-edge or /apply-migration
    ↓
Read CLAUDE.md
    ↓
Check: yolo_mode field
    ↓
    ├─ yolo_mode: on
    │     ↓
    │  Verify changes committed & pushed
    │     ↓
    │  Identify what changed
    │     ↓
    │  Generate Lovable prompt
    │     ↓
    │  Load automation-workflows.md
    │     ↓
    │  Execute browser automation
    │     ↓
    │  Run tests if yolo_testing: on
    │     ↓
    │  Show deployment summary
    │
    └─ yolo_mode: off
          ↓
       Show manual prompt
          ↓
       Suggest /yolo on
```

---

## Testing Detection Logic

**Test case 1: Yolo mode on, single edge function changed**

```
Setup:
- CLAUDE.md has yolo_mode: on
- Modified: supabase/functions/send-email/index.ts
- Committed and pushed to main

Expected:
✅ Yolo mode detected
✅ Function identified: send-email
✅ Automation triggered
✅ Prompt: "Deploy the send-email edge function"
```

**Test case 2: Yolo mode off**

```
Setup:
- CLAUDE.md has yolo_mode: off
- Modified: supabase/functions/send-email/index.ts

Expected:
✅ Yolo mode not active
✅ Show manual prompt
✅ Suggest /yolo on
```

**Test case 3: Multiple functions changed**

```
Setup:
- CLAUDE.md has yolo_mode: on
- Modified: send-email/, process-payment/

Expected:
✅ Multiple functions detected
✅ Automation triggered
✅ Prompt: "Deploy all edge functions"
```

**Test case 4: Migration detection**

```
Setup:
- CLAUDE.md has yolo_mode: on
- New file: supabase/migrations/20240115_add_field.sql
- Committed and pushed

Expected:
✅ Migration detected
✅ Automation triggered
✅ Prompt: "Apply pending Supabase migrations"
```

---

_This detection logic ensures yolo mode only activates when explicitly enabled and changes are ready to deploy._
