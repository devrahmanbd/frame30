---
name: Lovable-CDP-Automation
description: Use when interacting with Lovable.dev through Chrome DevTools Protocol to send prompts and read responses on a project page. Handles multiple open projects safely.
---

# Lovable CDP Automation

---

## Critical: Tab Targeting

**Multiple Lovable tabs may be open. Always identify the correct tab before sending any CDP commands.**

### Step 1: List all open Lovable tabs

```bash
curl -s http://127.0.0.1:9222/json | python3 -c "
import json, sys
pages = json.load(sys.stdin)
for p in pages:
    if p.get('type') == 'page' and 'lovable.dev/projects/' in p.get('url', ''):
        pid = p['url'].split('/projects/')[1].split('/')[0].split('?')[0]
        print(f'  {pid}  {p[\"title\"][:60]}')
"
```

### Step 2: Match the target project

The user specifies which project to work on. Match by **project name in title** or **project ID in URL**.

```bash
# Node.js — target by project ID (extract from URL)
pages.find(p => p.url?.includes("<PROJECT_ID>") && p.type === "page")
```

```python
# Python — target by project ID
target = next(p for p in pages if "<PROJECT_ID>" in p.get("url","") and p.get("type") == "page")
```

### Step 3: Verify before sending

Before sending any prompt, verify the tab title matches the expected project:

```bash
curl -s http://127.0.0.1:9222/json | python3 -c "
import json, sys
pages = json.load(sys.stdin)
target = next((p for p in pages if '<PROJECT_ID>' in p['url'] and p['type'] == 'page'), None)
print(f'Target: {target[\"title\"]}' if target else 'NOT FOUND')
"
```

**If the wrong tab is targeted, prompts go to the wrong project. Always verify.**

---

## 1. Launch Chrome

Check if Chrome is running on the debug port:

```bash
curl -s http://127.0.0.1:9222/json/version 2>/dev/null
```

If the response starts with `{`, Chrome is running. If not, launch it.

### Use the User's Chrome Profile (Recommended)

**Do NOT use the Selenium profile.** Lovable detects it as a bot and you won't be able to login. Instead, use the user's existing Chrome profile with the debug port.

**Important:** Chrome requires `--user-data-dir` to be a non-default path when using `--remote-debugging-port`. So you must copy the Chrome data to a temp location, then launch with `--profile-directory` pointing to the correct profile.

```bash
pkill -9 -f "Google Chrome" 2>/dev/null
sleep 3

# Find which profile the user is actively using
python3 -c "
import json, os
path = os.path.expanduser('~/Library/Application Support/Google/Chrome/Local State')
with open(path) as f:
    data = json.load(f)
for pid, pinfo in data.get('profile',{}).get('info_cache',{}).items():
    print(f'{pid}: {pinfo[\"name\"]}')
"

# Copy Chrome data to temp location
rm -rf /tmp/lovable-profile
mkdir -p /tmp/lovable-profile
cp -R "$HOME/Library/Application Support/Google/Chrome" /tmp/lovable-profile/Chrome

# Launch with the correct profile (e.g., Profile 4 for "Flame")
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/lovable-profile/Chrome \
  --profile-directory="Profile 4" \
  "https://lovable.dev/projects/<PROJECT_ID>" \
  --no-first-run \
  &>/dev/null &
```

**Important**: 
1. Chrome must be fully closed before launching with `--remote-debugging-port`
2. Wait for the debug port to become available (10-15 seconds)
3. The user's existing login sessions and cookies will be preserved
4. You MUST identify the correct profile number from the Local State file

---

## 2. Connect via CDP

Find the correct project page's WebSocket URL:

```bash
curl -s http://127.0.0.1:9222/json | python3 -c "
import json, sys
pages = json.load(sys.stdin)
target = next((p for p in pages if '<PROJECT_ID>' in p['url'] and p['type'] == 'page'), None)
if target:
    print(target['webSocketDebuggerUrl'])
else:
    print('ERROR: Project tab not found'); sys.exit(1)
"
```

Use the `send-prompt.js` script (see section 8) to send prompts and poll for results.

---

## 3. Detect Page State

States to detect from `document.body.innerText`:

| Signal | Meaning | Action |
|--------|---------|--------|
| `Previewing last saved version` | Page in preview mode | Click "Build" button first |
| `Working` / `Thought for` / `thinking` | AI is processing | Poll every 15s |
| `Queue follow-up...` + queue count | Prompt queued, waiting | Poll every 15s |
| `Ask Lovable...` + editor empty | Ready for new prompt | Send next prompt |
| `shipped` / `Typecheck clean` / `typecheck passes` / `Typecheck is clean` | Build succeeded | Read result, send next |
| `This message was cancelled` | Prompt was cancelled | Resend |
| `\d+ message[s]? in queue` | Queue count | Parse number, wait |

To click "Build" to switch from preview to build mode:

```javascript
const b = Array.from(document.querySelectorAll("button"))
  .find(x => x.innerText.trim() === "Build");
if (b) { b.click(); }
```

---

## 4. Send a Prompt

### Editor Structure

The Lovable chat editor is a Tiptap/ProseMirror `contenteditable` div inside a form:

```
FORM#chat-input
  └─ DIV.w-full.min-w-0
       └─ DIV.cursor-text
            └─ DIV#chatinput
                 ├─ SPAN.placeholder (e.g. "Queue follow-up...")
                 └─ DIV[contenteditable=true][aria-label="Chat input"]
```

### Editor Selectors (in priority order)

- `[contenteditable=true][aria-label="Chat input"]` — **most reliable**, also has role="textbox"
- `[contenteditable=true]` — fallback
- `.ProseMirror` — class-based

### Send Button Exists (but is disabled when empty)

The send button has `id="chatinput-send-message-button"` but is `aria-disabled="true"` when no text is in the editor. You cannot click it while disabled. After inserting text, wait ~500ms for the UI to enable it, then click it. If the button remains disabled, use form submit as fallback.

**Preferred approach — click the send button after text is inserted (wait 500ms for enable):**
```javascript
document.getElementById("chatinput-send-message-button").click();
```

**Fallback — submit the form directly (works even if button stays disabled):**
```javascript
document.getElementById("chat-input").dispatchEvent(new Event("submit", {cancelable: true}))
```

The editor must have non-empty text before either approach works.

**DO NOT** click these buttons (they are mode selectors, not send actions):
- **"Build"** button — switches to Build agent mode
- **"Plan"** button — switches to Plan agent mode
- **"Start voice recording"** — starts voice input
- These do NOT send the typed message

### Send Flow

1. Focus editor and clear it
2. Insert text via `execCommand("insertText", false, text)`
3. Wait ~1000ms for the UI to enable the send button
4. Click `#chatinput-send-message-button` (or submit form as fallback)

```javascript
// 1. Focus editor, clear it, insert text
ed.focus();
ed.innerHTML = "";
document.execCommand("insertText", false, "your prompt here");

// 2. Wait a moment for UI to enable the button, then click it
setTimeout(() => {
  document.getElementById("chatinput-send-message-button")?.click();
}, 1000);

// OR as fallback (if button stays disabled):
document.getElementById("chat-input").dispatchEvent(new Event("submit", {cancelable: true}));
```

---

## 5. Prompt Strategy

**Keep prompts small and focused.** Lovable's AI context window fills up quickly:

| Rule | Why |
|------|-----|
| **Single module per prompt** | Multi-module prompts cause the AI to list instead of build |
| **Under 400 chars** | Long prompts trigger "plan mode" instead of building |
| **End with "Run typecheck"** | Forces build + verify instead of task listing |
| **Never ask "Build X and Y and Z"** | The AI will list follow-ups instead of building |
| **Use concrete file paths** | "Create src/routes/hosting.tsx" not "Add the hosting page" |

**Bad** (AI will plan, not build):
> "Add loading skeletons, empty states, confirm dialogs, and form validation"

**Good** (AI will build):
> "Create src/routes/hosting.tsx with three pricing tiers. Run typecheck."

### Pattern: Single-Module Loop

For multi-module work, send one prompt at a time:

```
1. Send: "Create src/routes/hosting.tsx — public hosting page. Run typecheck."
   → Wait, check output, verify shipped via polling
2. Send: "Create src/routes/vps.tsx — public VPS page. Run typecheck."
   → Wait, check output, verify shipped via polling
```

Each module takes 1-5 minutes. Poll every 15 seconds between.

---

## 6. Wait and Verify

Poll every 15 seconds (up to 40 attempts = 10 minutes). Use this poller:

```javascript
function checkState(projectId) {
  // GET http://localhost:9222/json → find matching page → connect WebSocket
  // Evaluate: document.body.innerText.slice(-4000)
  // Return the text
}

async function poll(projectId) {
  while (attempts < 40) {
    const text = await checkState(projectId);
    const isWorking = /Working|Thought for|thinking/i.test(text);
    const hasQueue = /Queue follow-up/i.test(text);
    const isReady = /Ask Lovable/i.test(text);
    const hasShipped = /shipped|Typecheck clean|typecheck passes/i.test(text);
    const queueCount = parseInt((text.match(/(\d+)\s*message[s]?\s*in\s*queue/) || [])[1] || "0");

    console.log(`[${attempts}/40] ${isWorking ? "WORKING" : hasQueue ? `QUEUED (${queueCount})` : isReady ? "READY" : hasShipped ? "SHIPPED" : "UNKNOWN"}`);

    if (hasShipped || (isReady && !hasQueue)) {
      console.log(text.slice(-2000)); // Show last 2000 chars for context
      break;
    }
    await new Promise(r => setTimeout(r, 15000));
  }
}
```

### Reading Lovable's Response

The response text from `document.body.innerText` contains the chat history. To find what Lovable shipped:
1. Look for lines after "Details" and before "Preview" — these show what was built
2. Look for "Typecheck clean" / "typecheck passes" confirmation
3. The response includes user prompts and Lovable's responses interleaved
4. Recent responses are at the end of the text (use `.slice(-4000)`)

---

## 7. Detect Stuck State

The AI falls into an unproductive "plan mode" when it lists tasks instead of building them. Signs:

1. Follow-up suggestions like "Convert Servers Admin Page", "Update Invoices Table" without any "Typecheck clean. Shipped:" message
2. Repeating the same pattern across 3+ attempts
3. "Previewing last saved version" unchanged despite multiple prompts

### Recovery

**Short-term**: Send a very short (1-line), ultra-specific prompt:
> "Create src/routes/hosting.tsx with three plan cards: Launch ৳699 Scale ৳1499 Grow ৳2999. Run typecheck."

**Permanent fix**: Switch to local workflow — push code directly to GitHub (Lovable auto-syncs):
```bash
git add -A && git commit -m "message" && git push origin main
```

---

## 8. Complete Workflow Script

Save this as `/tmp/opencode/send-prompt.js` (CommonJS, not ESM):

```javascript
const http = require("http");
const WebSocket = require("ws");

const PROJECT_ID = process.env.PROJECT_ID || "<PROJECT_ID>";
const prompt = process.argv[2];

http.get("http://localhost:9222/json", (res) => {
  let data = "";
  res.on("data", (c) => (data += c));
  res.on("end", () => {
    const pages = JSON.parse(data);
    const target = pages.find(
      (p) => p.url?.includes(PROJECT_ID) && p.type === "page"
    );
    if (!target) {
      console.log("Project tab not found");
      process.exit(1);
    }

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let msgId = 1;
    function send(method, params) {
      ws.send(JSON.stringify({ id: msgId++, method, params }));
    }

    function onMessage(msg) {
      const resp = JSON.parse(msg.toString());
      if (resp.id && resp.result?.result?.value) {
        console.log(resp.result.result.value);
      }
      // After insert confirmation, submit the form
      if (resp.id === 1) {
        setTimeout(() => {
          send("Runtime.evaluate", {
            expression: `
              (() => {
                const form = document.getElementById("chat-input");
                if (!form) return "no form";
                form.dispatchEvent(new Event("submit", { cancelable: true }));
                return "submitted";
              })()
            `,
            returnByValue: true,
          });
        }, 1000);
      }
      // After submit, close
      if (resp.id === 2) {
        console.log("Prompt sent, now polling...");
        ws.close();
      }
    }

    ws.on("open", () => {
      send("Runtime.evaluate", {
        expression: `
          (() => {
            const ed = document.querySelector("[contenteditable=true][aria-label='Chat input']");
            if (!ed) return "no editor";
            ed.focus();
            ed.innerHTML = "";
            document.execCommand("insertText", false, ${JSON.stringify(prompt)});
            return "inserted: " + ed.innerText.substring(0, 80);
          })()
        `,
        returnByValue: true,
      });
    });

    ws.on("message", (msg) => {
      const resp = JSON.parse(msg.toString());
      if (resp.id && resp.result?.result?.value) {
        console.log(resp.result.result.value);
      }
      if (resp.id === 1) {
        setTimeout(() => {
          send("Runtime.evaluate", {
            expression: `
              (() => {
                const form = document.getElementById("chat-input");
                if (!form) return "no form";
                form.dispatchEvent(new Event("submit", { cancelable: true }));
                return "submitted";
              })()
            `,
            returnByValue: true,
          });
        }, 1000);
      }
    });

    setTimeout(() => process.exit(0), 5000);
  });
});
```

Run it:
```bash
NODE_PATH=/opt/homebrew/lib/node_modules PROJECT_ID=<PROJECT_ID> node /path/to/send-prompt.js "Your prompt here. Run typecheck."
```

### Poll Script

Save as `/tmp/opencode/poll.js`:

```javascript
const http = require("http"), WebSocket = require("ws");

const PROJECT_ID = process.env.PROJECT_ID || "<PROJECT_ID>";

function checkState(projectId) {
  return new Promise((resolve) => {
    http.get("http://localhost:9222/json", (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => {
        const pages = JSON.parse(d);
        const target = pages.find((p) => p.url?.includes(projectId) && p.type === "page");
        if (!target) { resolve("tab not found"); return; }
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        ws.on("open", () => {
          ws.send(JSON.stringify({id:1, method:"Runtime.evaluate",
            params:{expression:"document.body.innerText.slice(-4000)", returnByValue:true}}));
        });
        ws.on("message", (m) => {
          const r = JSON.parse(m.toString());
          if (r.id === 1) { resolve(r.result?.result?.value); ws.close(); }
        });
        setTimeout(() => { ws.close(); resolve("timeout"); }, 5000);
      });
    });
  });
}

async function poll(projectId) {
  let attempts = 0;
  while (attempts < 40) {
    attempts++;
    const text = await checkState(projectId);
    const isWorking = /Working|Thought for|thinking/i.test(text);
    const hasQueue = /Queue follow-up/i.test(text);
    const isReady = /Ask Lovable/i.test(text);
    const hasShipped = /shipped|Typecheck clean|typecheck passes/i.test(text);

    console.log(`[${attempts}/40] ${isWorking ? "WORKING" : hasQueue ? "QUEUED" : isReady ? "READY" : hasShipped ? "SHIPPED" : "UNKNOWN"} ${new Date().toLocaleTimeString()}`);

    if (hasShipped || (isReady && !hasQueue)) {
      if (hasShipped) console.log("=== SHIPPED ===", text.slice(-2000));
      break;
    }
    if (attempts < 40) await new Promise((r) => setTimeout(r, 15000));
  }
  console.log("Done polling");
}

poll(PROJECT_ID);
```

---

## 9. Full Decision Tree

```
User wants changes made via Lovable
  ├─ Which project? (get project ID from user or context)
  │
  ├─ Is Chrome running on :9222?
  │   ├─ No → Kill Chrome, relaunch with --remote-debugging-port=9222 using original profile
  │   └─ Yes → Connect
  │
  ├─ Find the correct tab (filter by project ID)
  │   ├─ Found → Verify title matches project name
  │   └─ Not found → Tab not open, launch with project URL
  │
  ├─ Is page in Preview mode? ("Previewing last saved version")
  │   ├─ Yes → Click "Build" button, wait 2s
  │   └─ No → Continue
  │
  ├─ Check page state:
  │   ├─ "Working"/"Thought for"/"thinking" → Wait 15s, re-check
  │   ├─ "Queue follow-up..." + queue count → Wait 15s, re-check
  │   ├─ "Ask Lovable..." + empty editor → Ready for prompt
  │   ├─ "shipped"/"Typecheck clean" → Build complete, read result
  │   └─ Queue count > 0 → Wait for queue to drain
  │
  ├─ Prepare prompt:
  │   ├─ Under 400 chars
  │   ├─ Single module only
  │   ├─ Concrete file paths
  │   └─ End with "Run typecheck"
  │
  ├─ Send via CDP:
  │   1. Focus editor, insertText via execCommand
  │   2. Wait 1s
  │   3. Submit form: dispatchEvent("submit") on #chat-input
  │
  ├─ Poll for result (every 15s, up to 40 attempts):
  │   ├─ "shipped"/"Typecheck clean" → Done, read response
  │   ├─ "Ask Lovable..." → Ready for next prompt
  │   └─ Still "Working" after 10 min → Check if stuck
  │
  ├─ Read response: last ~2000 chars of body text
  │   ├─ Shows what was built between "Details" and "Preview"
  │   └─ Confirms "Typecheck clean"
  │
  └─ Next step: same cycle for next feature
```

**Important**: Always use the user's original Chrome profile, not the Selenium profile. Lovable detects Selenium as a bot and blocks login.

---

## 10. Files

- `/tmp/lovable-profile/`: Chrome profile directory (only if using Selenium fallback — not recommended)
- `/tmp/opencode/send-prompt.js`: Prompt sender script
- `/tmp/opencode/poll.js`: Polling script
