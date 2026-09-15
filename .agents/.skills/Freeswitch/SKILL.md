Based on my thorough exploration of the FreeSWITCH codebase, here is the comprehensive `SKILL.md`:

---

```markdown
# SKILL.md — FreeSWITCH AI Agent Integration Guide

> **Repository:** `signalwire/freeswitch`
> **Purpose:** Authoritative reference for AI agents developing, extending, or integrating with FreeSWITCH.
> **Scope:** Core architecture, module development, ESL integration, dialplan, media, testing, and best practices.

---

## Table of Contents

1. [Repository Overview](#1-repository-overview)
2. [Core Architecture](#2-core-architecture)
3. [Session and Channel Lifecycle](#3-session-and-channel-lifecycle)
4. [Event System](#4-event-system)
5. [Module Development](#5-module-development)
6. [Endpoint Modules](#6-endpoint-modules)
7. [Application Modules](#7-application-modules)
8. [API Commands](#8-api-commands)
9. [Dialplan and XML Routing](#9-dialplan-and-xml-routing)
10. [Event Socket Library (ESL)](#10-event-socket-library-esl)
11. [Language Bindings and Scripting](#11-language-bindings-and-scripting)
12. [Media Handling](#12-media-handling)
13. [SIP Integration (mod_sofia)](#13-sip-integration-mod_sofia)
14. [WebRTC Integration (mod_verto)](#14-webrtc-integration-mod_verto)
15. [Configuration and XML Processing](#15-configuration-and-xml-processing)
16. [Database and Storage](#16-database-and-storage)
17. [Testing Infrastructure](#17-testing-infrastructure)
18. [Build System](#18-build-system)
19. [Security Best Practices](#19-security-best-practices)
20. [Performance Tuning](#20-performance-tuning)
21. [Debugging and Logging](#21-debugging-and-logging)
22. [Common Patterns and Idioms](#22-common-patterns-and-idioms)
23. [Common Pitfalls](#23-common-pitfalls)
24. [AI Agent Integration Patterns](#24-ai-agent-integration-patterns)
25. [Glossary](#25-glossary)

---

## 1. Repository Overview

### 1.1 Directory Structure

```
signalwire/freeswitch/
├── src/                        # Core C source files
│   ├── include/                # Public header files
│   │   ├── switch.h            # Master include (include this in all modules)
│   │   ├── switch_types.h      # All enums, typedefs, constants
│   │   ├── switch_core.h       # Core engine API
│   │   ├── switch_channel.h    # Channel management API
│   │   ├── switch_event.h      # Event system API
│   │   ├── switch_ivr.h        # IVR/originate API
│   │   ├── switch_module_interfaces.h  # Module interface structs
│   │   └── switch_xml.h        # XML processing API
│   ├── mod/                    # Loadable modules
│   │   ├── applications/       # Call control apps (mod_dptools, mod_conference, etc.)
│   │   ├── endpoints/          # Protocol handlers (mod_sofia, mod_verto, etc.)
│   │   ├── event_handlers/     # Event consumers (mod_event_socket, mod_json_cdr, etc.)
│   │   ├── codecs/             # Audio/video codecs (mod_opus, mod_openh264, etc.)
│   │   ├── dialplans/          # Dialplan engines (mod_dialplan_xml, etc.)
│   │   ├── languages/          # Scripting (mod_lua, mod_perl, mod_managed, etc.)
│   │   ├── formats/            # File formats (mod_local_stream, mod_vlc, etc.)
│   │   ├── loggers/            # Log handlers (mod_console, mod_graylog2, etc.)
│   │   ├── asr_tts/            # Speech (mod_flite, mod_pocketsphinx, etc.)
│   │   └── xml_int/            # XML providers (mod_xml_rpc, mod_xml_curl, etc.)
│   ├── switch_core.c           # Main engine init/shutdown
│   ├── switch_core_session.c   # Session management
│   ├── switch_channel.c        # Channel state machine
│   ├── switch_event.c          # Event dispatch
│   ├── switch_ivr_originate.c  # Call origination
│   ├── switch_rtp.c            # RTP engine
│   └── switch_xml.c            # XML parser
├── conf/                       # Configuration templates
│   ├── vanilla/                # Default production config
│   ├── minimal/                # Minimal config for testing
│   └── testing/                # CI/test config
├── libs/
│   └── esl/                    # Event Socket Library (client-side)
│       ├── src/                # C library source
│       ├── fs_cli.c            # Reference CLI client
│       └── php/, perl/, etc.   # Language-specific ESL wrappers
└── tests/
    └── unit/                   # Unit test suite (FCTX-based)
```

### 1.2 Key Source Files Reference

| File | Purpose |
|------|---------|
| `src/include/switch.h` | Master include — always use `#include <switch.h>` |
| `src/include/switch_types.h` | All enums: `switch_channel_state_t`, `switch_event_types_t`, `switch_call_cause_t` |
| `src/include/switch_module_interfaces.h` | Interface structs for all module types |
| `src/switch_core_state_machine.c` | Session state machine loop (`switch_core_session_run`) |
| `src/switch_channel.c` | Channel state transitions, flags, variables |
| `src/switch_event.c` | Event creation, binding, firing |
| `src/switch_ivr_originate.c` | `switch_ivr_originate()` — the primary call origination function |
| `src/mod/applications/mod_skel/mod_skel.c` | **Canonical skeleton module** — start here for new modules |
| `libs/esl/src/esl.c` | ESL client library core |
| `libs/esl/src/include/esl.h` | ESL client API header |

---

## 2. Core Architecture

### 2.1 Architectural Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    External Applications                     │
│         (ESL clients, web apps, AI agents, scripts)         │
├─────────────────────────────────────────────────────────────┤
│              Integration Layer (libs/esl, SWIG)             │
│     mod_event_socket │ mod_xml_rpc │ mod_verto (WS)         │
├─────────────────────────────────────────────────────────────┤
│                   Application Modules                        │
│  mod_dptools │ mod_conference │ mod_voicemail │ mod_fifo     │
├─────────────────────────────────────────────────────────────┤
│                     Core Engine                              │
│  switch_core_session │ switch_channel │ switch_event         │
│  switch_ivr_originate │ switch_rtp │ switch_core_media       │
├─────────────────────────────────────────────────────────────┤
│                   Endpoint Modules                           │
│       mod_sofia (SIP) │ mod_verto (WebRTC) │ mod_loopback    │
├─────────────────────────────────────────────────────────────┤
│                   Network / Hardware                         │
│         SIP/UDP/TCP/TLS │ WebSocket │ RTP/SRTP/DTLS          │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Core Data Structures

#### `switch_core_session_t` (opaque)
- Represents a single call leg / communication session
- Has a dedicated OS thread (`switch_core_session_run`)
- Owns a `switch_memory_pool_t` — all session-scoped allocations use this pool
- Contains a `switch_channel_t` (signaling state) and `switch_media_handle_t` (media)
- Accessed via `switch_core_session_locate(uuid)` — **always call `switch_core_session_rwunlock()` after use**

#### `switch_channel_t` (opaque)
- Manages signaling state, flags, and channel variables
- Accessed via `switch_core_session_get_channel(session)`
- Key operations: `switch_channel_set_state()`, `switch_channel_set_variable()`, `switch_channel_hangup()`

#### `switch_event_t`
- Key-value message structure used for all async communication
- Headers accessed via `switch_event_get_header(event, "header-name")`
- Created with `switch_event_create()`, fired with `switch_event_fire()`

#### `switch_caller_profile_t`
- Caller ID, destination number, context, dialplan
- Attached to a channel: `switch_channel_get_caller_profile(channel)`

### 2.3 Memory Management

FreeSWITCH uses Apache Portable Runtime (APR) memory pools:

```c
// Session-scoped allocation (freed when session ends)
char *buf = switch_core_session_alloc(session, 256);

// Pool-scoped allocation
char *buf = switch_core_alloc(pool, 256);

// Heap allocation (must be freed manually)
char *buf = malloc(256);
switch_safe_free(buf);  // NULL-safe free macro

// String duplication into session pool
char *copy = switch_core_session_strdup(session, original);

// String duplication into pool
char *copy = switch_core_strdup(pool, original);
```

**Rule:** Prefer session/pool allocation over heap allocation. Never `free()` pool-allocated memory.

---

## 3. Session and Channel Lifecycle

### 3.1 Channel State Machine

Channel states are defined in `src/include/switch_types.h`:

```c
typedef enum {
    CS_NEW,           // Just created, waiting for first instructions
    CS_INIT,          // Basic setup tasks; fires CHANNEL_CREATE event
    CS_ROUTING,       // Looking for a dialplan extension
    CS_SOFT_EXECUTE,  // Ready for 3rd-party control (outbound socket)
    CS_EXECUTE,       // Executing dialplan applications
    CS_EXCHANGE_MEDIA,// Looping media back to source
    CS_PARK,          // Waiting in limbo (parked)
    CS_CONSUME_MEDIA, // Consuming and dropping all media
    CS_HIBERNATE,     // Sleep state
    CS_RESET,         // Reset state
    CS_HANGUP,        // Flagged for hangup; fires CHANNEL_HANGUP event
    CS_REPORTING,     // Collecting call detail (CDR)
    CS_DESTROY,       // Ready for destruction
    CS_NONE           // Invalid
} switch_channel_state_t;
```

### 3.2 Valid State Transitions

Not all transitions are valid. The state machine enforces these rules (from `src/switch_channel.c`):

```
CS_NEW      → any state
CS_INIT     → CS_ROUTING, CS_EXECUTE, CS_EXCHANGE_MEDIA, CS_SOFT_EXECUTE,
              CS_PARK, CS_CONSUME_MEDIA, CS_HIBERNATE, CS_RESET
CS_ROUTING  → CS_EXECUTE, CS_SOFT_EXECUTE, CS_EXCHANGE_MEDIA, CS_PARK,
              CS_CONSUME_MEDIA, CS_HIBERNATE, CS_RESET
CS_EXECUTE  → CS_ROUTING, CS_SOFT_EXECUTE, CS_EXCHANGE_MEDIA, CS_PARK,
              CS_CONSUME_MEDIA, CS_HIBERNATE, CS_RESET
CS_HANGUP   → CS_REPORTING → CS_DESTROY (terminal sequence)
```

**Rule:** Never attempt to set a state that is not a valid transition from the current state. Use `switch_channel_get_state()` to check current state before transitioning.

### 3.3 Channel Flags

Important flags from `src/include/switch_types.h`:

```c
CF_ANSWERED          // Channel has been answered
CF_OUTBOUND          // This is an outbound channel
CF_EARLY_MEDIA       // Early media (183 Session Progress) is active
CF_ORIGINATOR        // This channel originated the call
CF_BRIDGED           // Channel is in a bridge
CF_HOLD              // Channel is on hold
CF_PROXY_MODE        // Bypass media (no media through FS)
CF_PROXY_MEDIA       // Proxy media (FS passes media through)
CF_VIDEO             // Channel has video capability
CF_BREAK             // Signal channel to stop current operation
```

Usage:
```c
// Set a flag
switch_channel_set_flag(channel, CF_ANSWERED);

// Test a flag
if (switch_channel_test_flag(channel, CF_BRIDGED)) { ... }

// Clear a flag
switch_channel_clear_flag(channel, CF_HOLD);
```

### 3.4 Channel Variables

Channel variables are string key-value pairs stored on the channel:

```c
// Set a variable
switch_channel_set_variable(channel, "my_var", "my_value");

// Get a variable (returns NULL if not set)
const char *val = switch_channel_get_variable(channel, "my_var");

// Safe get (returns empty string instead of NULL)
const char *val = switch_channel_get_variable_dup(channel, "my_var", SWITCH_TRUE, -1);

// Set with printf-style formatting
switch_channel_set_variable_printf(channel, "call_count", "%d", count);
```

**Important built-in variables:**
- `destination_number` — The dialed number
- `caller_id_name`, `caller_id_number` — Caller identity
- `context` — Current dialplan context
- `hangup_cause` — Reason for hangup
- `bridge_uuid` — UUID of bridged channel
- `transfer_to` — Transfer destination
- `recording_file` — Active recording path
- `bypass_media` — Enable media bypass
- `absolute_codec_string` — Force specific codec

### 3.5 Session Locking

**Critical:** Sessions are reference-counted. Always unlock after locating:

```c
switch_core_session_t *session;

// Locate a session by UUID (increments ref count)
if ((session = switch_core_session_locate(uuid))) {
    // ... do work ...
    switch_core_session_rwunlock(session);  // ALWAYS unlock
}

// For read-only access
if ((session = switch_core_session_locate(uuid))) {
    switch_channel_t *channel = switch_core_session_get_channel(session);
    // ... read channel data ...
    switch_core_session_rwunlock(session);
}
```

**Never** hold a session lock across blocking operations or long-running tasks.

---

## 4. Event System

### 4.1 Event Types

All event types are defined in `src/include/switch_types.h` as `switch_event_types_t`. Key events for AI integration:

| Event Name | Trigger |
|-----------|---------|
| `CHANNEL_CREATE` | New channel created (CS_INIT) |
| `CHANNEL_DESTROY` | Channel destroyed |
| `CHANNEL_STATE` | Channel state changed |
| `CHANNEL_ANSWER` | Channel answered |
| `CHANNEL_HANGUP` | Channel hangup initiated |
| `CHANNEL_HANGUP_COMPLETE` | Hangup fully processed |
| `CHANNEL_BRIDGE` | Two channels bridged |
| `CHANNEL_UNBRIDGE` | Bridge ended |
| `CHANNEL_EXECUTE` | Application started |
| `CHANNEL_EXECUTE_COMPLETE` | Application finished |
| `CHANNEL_PROGRESS` | Ringing started |
| `CHANNEL_PROGRESS_MEDIA` | Early media started |
| `CHANNEL_PARK` | Channel parked |
| `CHANNEL_ORIGINATE` | Outbound channel originated |
| `DTMF` | DTMF digit received |
| `DETECTED_SPEECH` | ASR result available |
| `DETECTED_TONE` | Tone detected |
| `RECORD_START` | Recording started |
| `RECORD_STOP` | Recording stopped |
| `PLAYBACK_START` | Playback started |
| `PLAYBACK_STOP` | Playback stopped |
| `BACKGROUND_JOB` | bgapi job completed |
| `HEARTBEAT` | System heartbeat (every 20s by default) |
| `RELOADXML` | XML config reloaded |
| `CUSTOM` | Module-defined custom event |
| `TALK` | Voice activity detected |
| `NOTALK` | Silence detected |
| `SESSION_HEARTBEAT` | Per-session heartbeat |

### 4.2 Binding to Events (C Module)

```c
// Bind to a specific event type
switch_event_bind(
    "my_module_name",           // Module name (for unbinding)
    SWITCH_EVENT_CHANNEL_HANGUP,// Event type
    SWITCH_EVENT_SUBCLASS_ANY,  // Subclass (NULL or specific)
    my_event_handler,           // Callback function
    NULL                        // User data
);

// Bind with removable handle
switch_event_node_t *node;
switch_event_bind_removable(
    "my_module",
    SWITCH_EVENT_RELOADXML,
    NULL,
    reload_handler,
    NULL,
    &node
);

// Unbind by handle
switch_event_unbind(&node);

// Unbind all callbacks for a function
switch_event_unbind_callback(my_event_handler);
```

### 4.3 Event Handler Signature

```c
static void my_event_handler(switch_event_t *event)
{
    const char *uuid = switch_event_get_header(event, "unique-id");
    const char *event_name = switch_event_get_header(event, "event-name");
    const char *caller_id = switch_event_get_header(event, "caller-caller-id-number");
    const char *dest = switch_event_get_header(event, "caller-destination-number");

    // IMPORTANT: Do NOT block in event handlers.
    // Spawn a thread for long-running work.
    switch_log_printf(SWITCH_CHANNEL_LOG, SWITCH_LOG_INFO,
        "Event: %s UUID: %s\n", event_name, uuid);
}
```

### 4.4 Creating and Firing Events

```c
switch_event_t *event;

// Create a custom event
if (switch_event_create_subclass(&event, SWITCH_EVENT_CUSTOM, "mymodule::myevent")
    == SWITCH_STATUS_SUCCESS) {
    switch_event_add_header_string(event, SWITCH_STACK_BOTTOM, "My-Header", "value");
    switch_event_add_header(event, SWITCH_STACK_BOTTOM, "Count", "%d", 42);
    switch_event_fire(&event);  // event is NULLed after fire
}

// Reserve a custom subclass (do this in module load)
switch_event_reserve_subclass("mymodule::myevent");

// Free subclass on shutdown
switch_event_free_subclass("mymodule::myevent");
```

### 4.5 Key Event Headers

Events carry standard headers. Access them with `switch_event_get_header(event, name)`:

```
unique-id                    — Session UUID
event-name                   — Event type name
event-subclass               — Custom event subclass
channel-state                — Current channel state name
channel-call-state           — Call state (RINGING, ACTIVE, etc.)
caller-caller-id-name        — Caller ID name
caller-caller-id-number      — Caller ID number
caller-destination-number    — Dialed number
caller-context               — Dialplan context
caller-dialplan              — Dialplan type (XML)
caller-network-addr          — Remote IP address
answer-state                 — answered/ringing/early
hangup-cause                 — Hangup cause string
variable_*                   — Channel variables (prefixed with "variable_")
```

---

## 5. Module Development

### 5.1 Module Skeleton

Every FreeSWITCH module follows this pattern (see `src/mod/applications/mod_skel/mod_skel.c`):

```c
#include <switch.h>

/* Module definition macro: name, load_func, shutdown_func, runtime_func */
SWITCH_MODULE_DEFINITION(mod_mymodule, mod_mymodule_load, mod_mymodule_shutdown, NULL);

/* Called when module is loaded */
SWITCH_MODULE_LOAD_FUNCTION(mod_mymodule_load)
{
    switch_api_interface_t *api_interface;
    switch_application_interface_t *app_interface;

    /* Connect module interface to the blank pointer */
    *module_interface = switch_loadable_module_create_module_interface(pool, modname);

    /* Register an API command */
    SWITCH_ADD_API(api_interface, "myapi", "My API description",
                   my_api_function, "syntax");

    /* Register a dialplan application */
    SWITCH_ADD_APP(app_interface, "myapp", "Short desc", "Long desc",
                   my_app_function, "syntax", SAF_NONE);

    /* Bind to events */
    switch_event_bind(modname, SWITCH_EVENT_CHANNEL_HANGUP,
                      SWITCH_EVENT_SUBCLASS_ANY, my_event_handler, NULL);

    return SWITCH_STATUS_SUCCESS;
}

/* Called when module is unloaded */
SWITCH_MODULE_SHUTDOWN_FUNCTION(mod_mymodule_shutdown)
{
    switch_event_unbind_callback(my_event_handler);
    return SWITCH_STATUS_UNLOAD;
}
```

### 5.2 Module Interface Types

| Interface Type | Macro | Structure | Purpose |
|---------------|-------|-----------|---------|
| API | `SWITCH_ADD_API` | `switch_api_interface_t` | CLI/HTTP commands |
| Application | `SWITCH_ADD_APP` | `switch_application_interface_t` | Dialplan apps |
| Endpoint | Manual | `switch_endpoint_interface_t` | Protocol handlers |
| Codec | Manual | `switch_codec_interface_t` | Audio/video codecs |
| File Format | Manual | `switch_file_interface_t` | Media file I/O |
| Dialplan | Manual | `switch_dialplan_interface_t` | Routing engines |
| Logger | Manual | `switch_log_interface_t` | Log consumers |
| ASR/TTS | Manual | `switch_asr_interface_t` / `switch_tts_interface_t` | Speech |
| Chat | `SWITCH_ADD_CHAT` | `switch_chat_interface_t` | Messaging |

### 5.3 Application Function Signature

```c
SWITCH_STANDARD_APP(my_app_function)
{
    // 'session' is the current session (switch_core_session_t *)
    // 'data' is the argument string from the dialplan
    switch_channel_t *channel = switch_core_session_get_channel(session);

    if (zstr(data)) {
        switch_log_printf(SWITCH_CHANNEL_SESSION_LOG(session), SWITCH_LOG_ERROR,
                          "No argument provided\n");
        return;
    }

    // Do work...
    switch_log_printf(SWITCH_CHANNEL_SESSION_LOG(session), SWITCH_LOG_INFO,
                      "Running myapp with arg: %s\n", data);
}
```

### 5.4 API Function Signature

```c
SWITCH_STANDARD_API(my_api_function)
{
    // 'cmd' is the argument string
    // 'session' is the calling session (may be NULL for CLI calls)
    // 'stream' is the output stream

    if (zstr(cmd)) {
        stream->write_function(stream, "-ERR Missing argument\n");
        return SWITCH_STATUS_SUCCESS;
    }

    // Do work...
    stream->write_function(stream, "+OK Result: %s\n", cmd);
    return SWITCH_STATUS_SUCCESS;
}
```

### 5.5 Application Flags (SAF_*)

```c
SAF_NONE              // No special flags
SAF_SUPPORT_NOMEDIA   // App works without media (no RTP needed)
SAF_ROUTING_EXEC      // Can be executed during routing phase
SAF_ZOMBIE_EXEC       // Can run on zombie (hungup) channels
SAF_MEDIA_TAP         // App taps into media stream
SAF_NO_LOOPBACK       // Don't run on loopback channels
```

### 5.6 Module Configuration Loading

```c
// In module load function:
static switch_xml_config_item_t instructions[] = {
    SWITCH_CONFIG_ITEM("my-setting", SWITCH_CONFIG_STRING, CONFIG_RELOADABLE,
                       &globals.my_setting, "default_value",
                       NULL, NULL, "Description"),
    SWITCH_CONFIG_ITEM_END()
};

static void do_config(switch_bool_t reload)
{
    switch_xml_config_parse_module_settings("mymodule.conf", reload, instructions);
}

// In load function:
do_config(SWITCH_FALSE);

// Bind to RELOADXML to support hot reload:
switch_event_bind_removable(modname, SWITCH_EVENT_RELOADXML, NULL,
                             event_handler, NULL, &globals.node);
```

---

## 6. Endpoint Modules

### 6.1 Endpoint Interface Structure

An endpoint module must implement `switch_endpoint_interface_t` and `switch_io_routines_t`:

```c
static switch_io_routines_t my_io_routines = {
    /*.outgoing_channel */ my_outgoing_channel,
    /*.read_frame */       my_read_frame,
    /*.write_frame */      my_write_frame,
    /*.kill_channel */     my_kill_channel,
    /*.send_dtmf */        my_send_dtmf,
    /*.receive_message */  my_receive_message,
    /*.receive_event */    my_receive_event,   // optional
    /*.state_change */     NULL,               // optional
    /*.read_video_frame */ NULL,               // optional
    /*.write_video_frame */NULL,               // optional
    /*.state_run */        NULL                // optional
};

static switch_state_handler_table_t my_state_handlers = {
    /*.on_init */          my_on_init,
    /*.on_routing */       my_on_routing,
    /*.on_execute */       my_on_execute,
    /*.on_hangup */        my_on_hangup,
    /*.on_exchange_media */my_on_exchange_media,
    /*.on_soft_execute */  my_on_soft_execute,
    /*.on_consume_media */ my_on_consume_media,
    /*.on_hibernate */     my_on_hibernate,
    /*.on_reset */         my_on_reset,
    /*.on_park */          NULL,
    /*.on_reporting */     NULL,
    /*.on_destroy */       my_on_destroy
};
```

### 6.2 Creating a New Session (Outbound)

```c
static switch_call_cause_t my_outgoing_channel(
    switch_core_session_t *session,
    switch_event_t *var_event,
    switch_caller_profile_t *outbound_profile,
    switch_core_session_t **new_session,
    switch_memory_pool_t **pool,
    switch_originate_flag_t flags,
    switch_call_cause_t *cancel_cause)
{
    switch_channel_t *channel;
    my_private_t *tech_pvt;

    // Request a new session from the core
    if (!(*new_session = switch_core_session_request(
            my_endpoint_interface,
            SWITCH_CALL_DIRECTION_OUTBOUND,
            flags, pool))) {
        return SWITCH_CAUSE_DESTINATION_OUT_OF_ORDER;
    }

    channel = switch_core_session_get_channel(*new_session);

    // Allocate private data in session pool
    tech_pvt = switch_core_session_alloc(*new_session, sizeof(*tech_pvt));
    switch_core_session_set_private(*new_session, tech_pvt);

    // Set caller profile
    switch_channel_set_caller_profile(channel, outbound_profile);

    // Add state handler
    switch_channel_add_state_handler(channel, &my_state_handlers);

    // Set initial state
    switch_channel_set_state(channel, CS_INIT);

    return SWITCH_CAUSE_SUCCESS;
}
```

### 6.3 mod_sofia Key Concepts

- **Profiles:** Logical SIP listeners (e.g., `internal`, `external`). Defined in `conf/vanilla/sip_profiles/`.
- **Gateways:** Outbound SIP registrations to providers. Defined within profiles.
- **tech_pvt:** `private_object_t` in `src/mod/endpoints/mod_sofia/mod_sofia.h` — stores SIP-specific state.
- **sofia_glue.c:** The bridge between Sofia-SIP NUA events and FreeSWITCH channel states.

Dial string format:
```
sofia/profile_name/user@domain
sofia/gateway/gateway_name/number
sofia/internal/1000@192.168.1.1
```

### 6.4 mod_loopback

Used for internal routing and testing. Creates two linked channels (A and B legs) that pass media internally.

```
loopback/extension[/context[/dialplan]]
loopback/1000/default/XML
```

Key channel variables set by loopback:
- `loopback_leg` — "A" or "B"
- `other_loopback_leg_uuid` — UUID of the paired leg

---

## 7. Application Modules

### 7.1 Core Dialplan Applications (mod_dptools)

These are the fundamental building blocks for call control:

```xml
<!-- Answer the call -->
<action application="answer"/>

<!-- Hangup with cause -->
<action application="hangup" data="NORMAL_CLEARING"/>

<!-- Bridge to another endpoint -->
<action application="bridge" data="sofia/internal/1001@domain"/>

<!-- Play audio file -->
<action application="playback" data="/path/to/file.wav"/>

<!-- Play and detect DTMF -->
<action application="play_and_get_digits"
        data="1 1 3 5000 # /prompt.wav /invalid.wav myvar 0-9"/>

<!-- Record audio -->
<action application="record" data="/tmp/recording.wav 60 200 5"/>

<!-- Record entire call -->
<action application="record_session" data="/tmp/call_${uuid}.wav"/>

<!-- Set channel variable -->
<action application="set" data="my_var=my_value"/>

<!-- Export variable to B-leg -->
<action application="export" data="my_var=my_value"/>

<!-- Transfer to extension -->
<action application="transfer" data="1000 XML default"/>

<!-- Park the call -->
<action application="park"/>

<!-- Sleep/wait -->
<action application="sleep" data="2000"/>

<!-- Execute API command -->
<action application="execute_extension" data="1000 XML default"/>

<!-- Send DTMF -->
<action application="send_dtmf" data="1234"/>

<!-- Speak text (TTS) -->
<action application="speak" data="flite|kal|Hello World"/>

<!-- Conference -->
<action application="conference" data="myconf@default"/>

<!-- IVR menu -->
<action application="ivr" data="main_menu"/>

<!-- Lua script -->
<action application="lua" data="myscript.lua arg1 arg2"/>
```

### 7.2 mod_conference Key Concepts

Conference rooms are identified by `name@profile`:

```xml
<action application="conference" data="room1@default"/>
<action application="conference" data="room1@default+flags{mute}"/>
```

Conference API commands (via ESL or `conference` API):
```
conference room1 list                    # List members
conference room1 kick <member_id>        # Kick member
conference room1 mute <member_id>        # Mute member
conference room1 unmute <member_id>      # Unmute member
conference room1 play /path/to/file.wav  # Play file to conference
conference room1 record /path/to/rec.wav # Start recording
conference room1 norecord /path/to/rec.wav # Stop recording
conference room1 vid-layout <layout>     # Set video layout
```

### 7.3 mod_callcenter

ACD (Automatic Call Distributor) for call center use cases:

```xml
<action application="callcenter" data="support@default"/>
```

Key concepts:
- **Queues:** Named call queues with strategies (ring-all, longest-idle-agent, etc.)
- **Agents:** Can be `callback` (FS calls agent) or `uuid-standby` (agent already on FS)
- **Tiers:** Priority-based agent-to-queue assignments

---

## 8. API Commands

### 8.1 Core API Commands

These are available via ESL `api` command, `fs_cli`, or `mod_xml_rpc`:

```bash
# System status
status

# List active channels
show channels
show channels as json

# List calls
show calls

# Originate a call
originate sofia/internal/1000@domain &echo()
originate {origination_caller_id_number=5551234}sofia/gw/mygw/18005551234 &bridge(sofia/internal/1001@domain)

# Hangup a channel by UUID
uuid_kill <uuid>
uuid_kill <uuid> NORMAL_CLEARING

# Bridge two existing channels
uuid_bridge <uuid1> <uuid2>

# Transfer a channel
uuid_transfer <uuid> <extension> [dialplan] [context]

# Set a channel variable
uuid_setvar <uuid> <variable> <value>

# Get a channel variable
uuid_getvar <uuid> <variable>

# Execute an application on a channel
uuid_execute <uuid> <app> [args]

# Send DTMF to a channel
uuid_send_dtmf <uuid> <dtmf_string>

# Record a channel
uuid_record <uuid> start /path/to/file.wav
uuid_record <uuid> stop /path/to/file.wav

# Play file to a channel
uuid_broadcast <uuid> /path/to/file.wav aleg

# Park a channel
uuid_park <uuid>

# Reload XML config
reloadxml

# Load/unload/reload a module
load mod_mymodule
unload mod_mymodule
reload mod_mymodule

# Show registered sofia endpoints
sofia status
sofia status profile internal
sofia status gateway mygw

# Background API (async)
bgapi originate sofia/internal/1000@domain &echo()
```

### 8.2 Background API (bgapi)

For long-running commands, use `bgapi` which returns a `Job-UUID`:

```
bgapi originate sofia/internal/1000@domain &echo()
```

Response:
```
Content-Type: command/reply
Reply-Text: +OK Job-UUID: <job-uuid>
```

Then listen for `BACKGROUND_JOB` event with matching `Job-UUID` header.

---

## 9. Dialplan and XML Routing

### 9.1 Dialplan Structure

```xml
<!-- conf/vanilla/dialplan/default.xml -->
<include>
  <context name="default">

    <extension name="my_extension">
      <!-- Conditions are ANDed by default -->
      <condition field="destination_number" expression="^(1\d{3})$">
        <!-- $1 is the first capture group -->
        <action application="bridge" data="sofia/internal/$1@${domain}"/>
        <!-- Anti-action runs if condition FAILS -->
        <anti-action application="hangup" data="UNALLOCATED_NUMBER"/>
      </condition>
    </extension>

    <!-- Multiple conditions (all must match) -->
    <extension name="time_based">
      <condition wday="2-6" hour="9-17">
        <action application="bridge" data="sofia/internal/1000@domain"/>
      </condition>
      <condition>
        <action application="voicemail" data="default ${domain} 1000"/>
      </condition>
    </extension>

  </context>
</include>
```

### 9.2 Condition Fields

The `field` attribute can be any channel variable or special field:

```xml
<!-- Standard fields -->
<condition field="destination_number" expression="^1234$"/>
<condition field="caller_id_number" expression="^5551234$"/>
<condition field="context" expression="default"/>
<condition field="rdnis" expression="^(.*)$"/>

<!-- Channel variables -->
<condition field="${my_var}" expression="^expected_value$"/>
<condition field="${sip_h_X-Custom}" expression="^value$"/>

<!-- Time-based conditions -->
<condition year="2024" mon="1-12" mday="1-31" wday="1-7"
           hour="0-23" minute="0-59" mweek="1-5" week="1-53"/>
```

### 9.3 Break Logic

Controls what happens after a condition is evaluated:

```xml
<!-- Stop processing if condition matches (default for anti-action) -->
<condition field="..." expression="..." break="on-true">

<!-- Stop processing if condition does NOT match (default) -->
<condition field="..." expression="..." break="on-false">

<!-- Always stop after this condition -->
<condition field="..." expression="..." break="always">

<!-- Never stop, always continue to next condition -->
<condition field="..." expression="..." break="never">
```

### 9.4 Inline Actions

```xml
<!-- Execute API inline -->
<action application="set" data="result=${my_api_command(arg)}"/>

<!-- Conditional set -->
<action application="set" data="my_var=${condition(${other_var} == value ? true_val : false_val)}"/>

<!-- String operations -->
<action application="set" data="upper=${upcase(${my_var})}"/>
<action application="set" data="lower=${downcase(${my_var})}"/>
<action application="set" data="len=${len(${my_var})}"/>
```

### 9.5 XML Preprocessing

```xml
<!-- Set a global variable -->
<X-PRE-PROCESS cmd="set" data="my_global_var=value"/>

<!-- Include another file -->
<X-PRE-PROCESS cmd="include" data="/etc/freeswitch/custom/*.xml"/>

<!-- Set from environment variable -->
<X-PRE-PROCESS cmd="env-set" data="my_var=MY_ENV_VAR"/>

<!-- Set from command output -->
<X-PRE-PROCESS cmd="exec-set" data="my_var=hostname"/>

<!-- Set from STUN (external IP detection) -->
<X-PRE-PROCESS cmd="stun-set" data="external_rtp_ip=stun:stun.freeswitch.org"/>
```

---

## 10. Event Socket Library (ESL)

### 10.1 ESL Overview

ESL provides TCP-based external control of FreeSWITCH. Two modes:

- **Inbound:** External app connects to FreeSWITCH on port 8021
- **Outbound:** FreeSWITCH connects to external app (via `socket` dialplan app)

Default credentials: host `127.0.0.1`, port `8021`, password `ClueCon`

### 10.2 ESL Protocol (Plain Text)

The ESL protocol is line-based. Commands end with `\n\n`:

```
# Authentication
auth ClueCon\n\n

# Subscribe to events
event plain CHANNEL_CREATE CHANNEL_HANGUP DTMF\n\n
event json ALL\n\n

# Filter events
filter Unique-ID <uuid>\n\n
filter delete Unique-ID <uuid>\n\n

# Execute API command
api status\n\n

# Execute API in background
bgapi originate sofia/internal/1000@domain &echo()\n\n

# Send message to a session (outbound mode)
sendmsg <uuid>\n
call-command: execute\n
execute-app-name: playback\n
execute-app-arg: /path/to/file.wav\n\n

# Subscribe to events for a specific UUID only
myevents <uuid>\n\n

# Linger after hangup (outbound mode)
linger\n\n
```

### 10.3 ESL C Library Usage

```c
#include <esl.h>

esl_handle_t handle = {{0}};

// Connect (inbound mode)
if (esl_connect(&handle, "127.0.0.1", 8021, NULL, "ClueCon") != ESL_SUCCESS) {
    fprintf(stderr, "Connection failed: %s\n", handle.err);
    return -1;
}

// Subscribe to events
esl_events(&handle, ESL_EVENT_TYPE_PLAIN, "CHANNEL_CREATE CHANNEL_HANGUP");

// Execute API command
esl_send_recv(&handle, "api status\n\n");
printf("Response: %s\n", handle.last_sr_reply);

// Event loop
while (esl_recv_timed(&handle, 1000) == ESL_SUCCESS) {
    if (handle.last_event) {
        const char *event_name = esl_event_get_header(handle.last_event, "event-name");
        const char *uuid = esl_event_get_header(handle.last_event, "unique-id");
        printf("Event: %s UUID: %s\n", event_name, uuid);
    }
}

esl_disconnect(&handle);
```

### 10.4 ESL Python Usage

```python
import ESL

# Inbound connection
con = ESL.ESLconnection("127.0.0.1", "8021", "ClueCon")

if not con.connected():
    raise Exception("Connection failed")

# Subscribe to events
con.events("plain", "CHANNEL_CREATE CHANNEL_HANGUP DTMF DETECTED_SPEECH")

# Filter to specific UUID
con.filter("Unique-ID", uuid)

# Execute API
e = con.api("status")
print(e.getBody())

# Event loop
while con.connected():
    e = con.recvEventTimed(1000)  # 1 second timeout
    if e:
        event_name = e.getHeader("Event-Name")
        uuid = e.getHeader("Unique-ID")
        body = e.getBody()
        print(f"Event: {event_name}, UUID: {uuid}")
```

### 10.5 ESL Outbound Mode

In outbound mode, FreeSWITCH connects to your server when a call hits the `socket` dialplan app:

```xml
<!-- In dialplan -->
<action application="socket" data="127.0.0.1:8084 async full"/>
```

Your server receives the connection and must:
1. Send `connect\n\n` to get channel data
2. Send `myevents\n\n` to subscribe to this channel's events
3. Control the call with `sendmsg` commands

```python
import ESL

def handle_connection(server_sock, client_sock, addr, user_data):
    con = ESL.ESLconnection(client_sock)

    # Get initial channel data
    info = con.getInfo()
    uuid = info.getHeader("unique-id")

    # Subscribe to this channel's events
    con.sendRecv("myevents\n\n")

    # Answer the call
    con.execute("answer", "", uuid)

    # Play a file
    con.execute("playback", "/path/to/greeting.wav", uuid)

    # Wait for DTMF
    while con.connected():
        e = con.recvEventTimed(5000)
        if e and e.getHeader("Event-Name") == "DTMF":
            digit = e.getHeader("DTMF-Digit")
            # Handle digit...
            break

    con.execute("hangup", "", uuid)

ESL.eslSetLogLevel(7)
ESL.esl_listen_threaded("127.0.0.1", 8084, handle_connection, 10)
```

### 10.6 sendmsg Commands

```
# Execute an application
sendmsg <uuid>
call-command: execute
execute-app-name: <app_name>
execute-app-arg: <app_arg>
event-lock: true    # Wait for app to complete before next command

# Hangup
sendmsg <uuid>
call-command: hangup
hangup-cause: NORMAL_CLEARING

# Unicast (stream audio to/from external process)
sendmsg <uuid>
call-command: unicast
local-ip: 127.0.0.1
local-port: 8025
remote-ip: 127.0.0.1
remote-port: 8026
transport: tcp
flags: native

# Nomedia (disable media)
sendmsg <uuid>
call-command: nomedia
nomedia-uuid: <uuid>
```

### 10.7 Event Filtering Best Practices

Always filter events to reduce load:

```
# Subscribe only to needed events
event plain CHANNEL_CREATE CHANNEL_HANGUP DTMF BACKGROUND_JOB

# Filter to specific UUID (reduces event volume dramatically)
filter Unique-ID <uuid>

# Filter by caller ID
filter Caller-Caller-ID-Number 5551234

# Remove a filter
filter delete Unique-ID <uuid>
```

---

## 11. Language Bindings and Scripting

### 11.1 Lua (mod_lua)

Lua is the most commonly used embedded scripting language in FreeSWITCH:

```lua
-- In dialplan: <action application="lua" data="myscript.lua arg1"/>
-- Or: <action application="lua" data="inline:session:answer()"/>

-- session is a CoreSession object
session:answer()
session:sleep(1000)

-- Play a file and wait for DTMF
local digits = session:playAndGetDigits(1, 4, 3, 5000, "#",
    "/sounds/prompt.wav", "/sounds/invalid.wav", "\\d+")

-- Set/get channel variables
session:setVariable("my_var", "my_value")
local val = session:getVariable("my_var")

-- Execute an application
session:execute("bridge", "sofia/internal/1001@domain")

-- Hangup
session:hangup("NORMAL_CLEARING")

-- Check if session is still active
if session:ready() then
    -- ...
end

-- API calls
local api = freeswitch.API()
local result = api:execute("status", "")

-- Event handling
local event = freeswitch.Event("CUSTOM", "mymodule::myevent")
event:addHeader("My-Header", "value")
event:fire()

-- Logging
freeswitch.consoleLog("INFO", "My log message\n")
```

### 11.2 JavaScript (mod_v8 / mod_duk)

```javascript
// session is available as a global
session.answer();
session.sleep(1000);

var digits = session.playAndGetDigits(1, 4, 3, 5000, "#",
    "/sounds/prompt.wav", "/sounds/invalid.wav", "\\d+");

session.setVariable("my_var", "my_value");
var val = session.getVariable("my_var");

// API
var api = new API();
var result = api.execute("status", "");
```

### 11.3 Python (mod_python / ESL)

For in-process Python (mod_python):
```python
# session is passed as argument
def handler(session, args):
    session.answer()
    session.sleep(1000)
    digits = session.playAndGetDigits(1, 4, 3, 5000, "#",
        "/sounds/prompt.wav", "/sounds/invalid.wav", "\\d+")
    session.hangup()
```

### 11.4 .NET/C# (mod_managed)

```csharp
using FreeSWITCH;
using FreeSWITCH.Native;

public class MyApp : AppFunction {
    public override void Run(AppFunctionArgs args) {
        var session = args.Session;
        session.Answer();
        session.Sleep(1000);
        session.Hangup("NORMAL_CLEARING");
    }
}
```

### 11.5 Perl (mod_perl)

```perl
# session is a CoreSession object
$session->answer();
$session->sleep(1000);
my $digits = $session->playAndGetDigits(1, 4, 3, 5000, "#",
    "/sounds/prompt.wav", "/sounds/invalid.wav", "\\d+");
$session->hangup("NORMAL_CLEARING");
```

---

## 12. Media Handling

### 12.1 RTP Engine

The RTP engine (`src/switch_rtp.c`) handles:
- RTP/RTCP send and receive
- SRTP encryption/decryption
- ICE NAT traversal
- DTLS key exchange (for WebRTC)
- Jitter buffer management

Key structures:
- `switch_rtp_t` — RTP session handle
- `switch_frame_t` — Media frame (audio or video)
- `switch_rtp_engine_t` — Per-media-type engine (audio/video/text)

### 12.2 Codec Interface

```c
// Codec implementation registration
static switch_codec_implementation_t my_codec_impl[] = {
    {
        /*.codec_type */            SWITCH_CODEC_TYPE_AUDIO,
        /*.ianacode */              0,      // PCMU
        /*.iananame */              "PCMU",
        /*.fmtp */                  NULL,
        /*.samples_per_second */    8000,
        /*.actual_samples_per_second */ 8000,
        /*.bits_per_second */       64000,
        /*.microseconds_per_packet */ 20000,
        /*.samples_per_packet */    160,
        /*.decoded_bytes_per_packet */ 320,
        /*.encoded_bytes_per_packet */ 160,
        /*.number_of_channels */    1,
        /*.codec_frames_per_packet */ 1,
        /*.init */                  my_codec_init,
        /*.encode */                my_codec_encode,
        /*.decode */                my_codec_decode,
        /*.destroy */               my_codec_destroy
    },
    SWITCH_CODEC_IMPLEMENTATION_END
};
```

### 12.3 Media Bugs (Tap into Media Stream)

Media bugs allow modules to intercept and process audio/video:

```c
switch_media_bug_t *bug;

// Add a media bug to tap audio
switch_core_media_bug_add(
    session,
    "my_bug_name",
    NULL,           // target (NULL for all)
    my_bug_callback,
    user_data,
    0,              // stop_time (0 = no timeout)
    SMBF_READ_STREAM | SMBF_WRITE_STREAM,  // flags
    &bug
);

// Bug callback
static switch_bool_t my_bug_callback(
    switch_media_bug_t *bug,
    void *user_data,
    switch_abc_type_t type)
{
    switch (type) {
    case SWITCH_ABC_TYPE_INIT:
        // Bug initialized
        break;
    case SWITCH_ABC_TYPE_READ:
        {
            switch_frame_t *frame = switch_core_media_bug_get_read_replace_frame(bug);
            // Process frame->data (PCM audio), frame->datalen bytes
            // frame->rate = sample rate, frame->channels = channel count
        }
        break;
    case SWITCH_ABC_TYPE_WRITE:
        // Process write (outgoing) audio
        break;
    case SWITCH_ABC_TYPE_CLOSE:
        // Bug being removed
        break;
    }
    return SWITCH_TRUE;
}

// Remove the bug
switch_core_media_bug_remove(session, &bug);
```

### 12.4 Media Bug Flags

```c
SMBF_READ_STREAM    // Tap into read (incoming) audio
SMBF_WRITE_STREAM   // Tap into write (outgoing) audio
SMBF_READ_REPLACE   // Replace read audio
SMBF_WRITE_REPLACE  // Replace write audio
SMBF_READ_PING      // Ping on read frames
SMBF_STEREO         // Stereo output
SMBF_ANSWER_REQ     // Only start after answer
SMBF_BRIDGE_REQ     // Only start after bridge
SMBF_ONE_ONLY       // Only one bug of this type per session
SMBF_VIDEO_PATCH    // Patch video frames
```

### 12.5 Audio Resampling

```c
switch_audio_resampler_t *resampler;

// Create resampler (e.g., 8kHz → 16kHz)
switch_resample_create(&resampler,
    8000,   // from_rate
    16000,  // to_rate
    320,    // to_size (output buffer size in samples)
    SWITCH_RESAMPLE_QUALITY,
    1       // channels
);

// Resample
switch_resample_process(resampler, input_samples, input_count);
// Output: resampler->to (int16_t*), resampler->to_len samples

switch_resample_destroy(&resampler);
```

### 12.6 File Playback and Recording

```c
switch_file_handle_t fh = {0};

// Open for playback
if (switch_core_file_open(&fh,
    "/path/to/file.wav",
    1,                          // channels
    8000,                       // rate
    SWITCH_FILE_FLAG_READ | SWITCH_FILE_DATA_SHORT,
    NULL) == SWITCH_STATUS_SUCCESS) {

    int16_t buf[320];
    switch_size_t len = 160;

    while (switch_core_file_read(&fh, buf, &len) == SWITCH_STATUS_SUCCESS) {
        // Process audio in buf
        len = 160;
    }

    switch_core_file_close(&fh);
}
```

---

## 13. SIP Integration (mod_sofia)

### 13.1 Profile Configuration

SIP profiles are in `conf/vanilla/sip_profiles/`. Key settings:

```xml
<profile name="internal">
  <settings>
    <param name="sip-ip" value="$${local_ip_v4}"/>
    <param name="sip-port" value="5060"/>
    <param name="rtp-ip" value="$${local_ip_v4}"/>
    <param name="ext-rtp-ip" value="$${external_rtp_ip}"/>
    <param name="ext-sip-ip" value="$${external_sip_ip}"/>
    <param name="codec-prefs" value="OPUS,G722,PCMU,PCMA,G729"/>
    <param name="inbound-codec-negotiation" value="generous"/>
    <param name="tls" value="false"/>
    <param name="tls-sip-port" value="5061"/>
    <param name="context" value="default"/>
    <param name="dialplan" value="XML"/>
  </settings>
</profile>
```

### 13.2 Gateway Configuration

```xml
<gateway name="my_provider">
  <param name="username" value="myuser"/>
  <param name="password" value="mypass"/>
  <param name="proxy" value="sip.provider.com"/>
  <param name="register" value="true"/>
  <param name="caller-id-in-from" value="false"/>
  <param name="codec-prefs" value="PCMU,PCMA"/>
</gateway>
```

### 13.3 SIP-Specific Channel Variables

```
sip_profile              — Profile name
sip_from_user            — SIP From user
sip_from_host            — SIP From host
sip_to_user              — SIP To user
sip_to_host              — SIP To host
sip_contact_user         — SIP Contact user
sip_contact_host         — SIP Contact host
sip_call_id              — SIP Call-ID
sip_h_X-Custom           — Custom SIP header X-Custom
sip_rh_X-Custom          — Custom SIP header on reply
sip_bye_h_X-Custom       — Custom SIP header on BYE
sip_req_uri              — Request URI
sip_network_ip           — Remote IP
sip_network_port         — Remote port
sip_received_ip          — IP where SIP was received
sip_via_protocol         — Transport protocol (UDP/TCP/TLS)
sip_user_agent           — Remote User-Agent
```

### 13.4 SIP Header Manipulation

```xml
<!-- Add custom SIP header to outbound INVITE -->
<action application="set" data="sip_h_X-My-Header=my_value"/>

<!-- Add header to all SIP messages -->
<action application="set" data="sip_rh_X-My-Header=my_value"/>

<!-- Read incoming SIP header -->
<condition field="${sip_h_X-My-Header}" expression="^(.+)$">
  <action application="set" data="my_var=$1"/>
</condition>
```

### 13.5 Sofia API Commands

```bash
# Profile management
sofia status
sofia status profile internal
sofia profile internal restart
sofia profile internal rescan  # Reload gateways without restart

# Gateway management
sofia status gateway my_gw
sofia profile internal killgw my_gw

# Registration management
sofia status profile internal reg
sofia profile internal flush_inbound_reg <user@domain>

# SIP trace
sofia global siptrace on
sofia global siptrace off

# Debug
sofia loglevel all 9
sofia loglevel all 0
```

---

## 14. WebRTC Integration (mod_verto)

### 14.1 Verto Protocol

mod_verto uses JSON-RPC over WebSocket. Key methods:

```json
// Login
{"jsonrpc":"2.0","method":"login","params":{"login":"user","passwd":"pass","sessid":"abc123"},"id":1}

// Make a call
{"jsonrpc":"2.0","method":"verto.invite","params":{"callID":"uuid","sdp":"...","destination_number":"1000","caller_id_name":"Test","caller_id_number":"1234"},"id":2}

// Answer a call
{"jsonrpc":"2.0","method":"verto.answer","params":{"callID":"uuid","sdp":"..."},"id":3}

// Hangup
{"jsonrpc":"2.0","method":"verto.bye","params":{"callID":"uuid"},"id":4}

// Send DTMF
{"jsonrpc":"2.0","method":"verto.info","params":{"callID":"uuid","dtmf":"5"},"id":5}
```

### 14.2 Verto Configuration

```xml
<!-- conf/vanilla/autoload_configs/verto.conf.xml -->
<configuration name="verto.conf" description="Verto Endpoint">
  <settings>
    <param name="debug" value="0"/>
    <param name="enable-presence" value="true"/>
  </settings>
  <profiles>
    <profile name="default-v4">
      <param name="bind-local" value="0.0.0.0:8081"/>
      <param name="force-register-domain" value="${domain}"/>
      <param name="secure-combined" value="/etc/freeswitch/tls/wss.pem"/>
      <param name="secure-chain" value="/etc/freeswitch/tls/wss.pem"/>
      <param name="userauth" value="true"/>
      <param name="context" value="default"/>
      <param name="dialplan" value="XML"/>
      <param name="mcast-ip" value="224.1.1.1"/>
      <param name="mcast-port" value="1337"/>
      <param name="rtp-ip" value="$${local_ip_v4}"/>
      <param name="ext-rtp-ip" value="$${external_rtp_ip}"/>
      <param name="local-network" value="localnet.auto"/>
      <param name="outbound-codec-string" value="opus,vp8"/>
      <param name="inbound-codec-string" value="opus,vp8"/>
    </profile>
  </profiles>
</configuration>
```

### 14.3 ICE/DTLS/SRTP

For WebRTC, FreeSWITCH handles:
- **ICE:** NAT traversal via STUN/TURN
- **DTLS:** Key exchange for SRTP
- **SRTP:** Encrypted media

Key channel variables for WebRTC:
```
rtp_secure_media=true          # Enable SRTP
rtp_secure_media_confirmed=true # SRTP confirmed
ice_lite=true                  # ICE lite mode
```

## 15. Configuration and XML Processing

```markdown
### 15.1 Configuration Hierarchy

The root config file `conf/vanilla/freeswitch.xml` uses `X-PRE-PROCESS` directives to assemble the full XML document at startup:

```xml
<!-- conf/vanilla/freeswitch.xml -->
<document type="freeswitch/xml">
  <!-- 1. Global preprocessor variables -->
  <X-PRE-PROCESS cmd="include" data="vars.xml"/>

  <!-- 2. Module configurations -->
  <section name="configuration" description="Various Configuration">
    <X-PRE-PROCESS cmd="include" data="autoload_configs/*.xml"/>
  </section>

  <!-- 3. Dialplan routing -->
  <section name="dialplan" description="Regex/XML Dialplan">
    <X-PRE-PROCESS cmd="include" data="dialplan/*.xml"/>
  </section>

  <!-- 4. Chat routing -->
  <section name="chatplan" description="Regex/XML Chatplan">
    <X-PRE-PROCESS cmd="include" data="chatplan/*.xml"/>
  </section>

  <!-- 5. User directory (SIP auth, voicemail, etc.) -->
  <section name="directory" description="User Directory">
    <X-PRE-PROCESS cmd="include" data="directory/*.xml"/>
  </section>

  <!-- 6. Language/phrase macros -->
  <section name="languages" description="Language Management">
    <X-PRE-PROCESS cmd="include" data="lang/en/*.xml"/>
  </section>
</document>
```

The preprocessor compiles the full document to `${log_dir}/freeswitch.xml.fsxml` at startup. **Do not edit this compiled file.**

### 15.2 Preprocessor Variables

Two variable namespaces exist:

| Syntax | Scope | Set with |
|--------|-------|---------|
| `$${var}` | Preprocessor (compile-time) | `X-PRE-PROCESS cmd="set"` |
| `${var}` | Runtime channel variable | `set` app or `switch_channel_set_variable()` |

**Built-in preprocessor variables** (auto-calculated, from `conf/vanilla/vars.xml`):
```
hostname          local_ip_v4       local_mask_v4     local_ip_v6
base_dir          recordings_dir    sound_prefix      sounds_dir
conf_dir          log_dir           run_dir           db_dir
mod_dir           htdocs_dir        script_dir        temp_dir
grammar_dir       certs_dir         storage_dir       cache_dir
core_uuid         nat_public_addr   nat_private_addr  nat_type
```

### 15.3 XML Sections

| Section | Purpose | Key Files |
|---------|---------|-----------|
| `configuration` | Module configs | `autoload_configs/*.xml` |
| `dialplan` | Call routing | `dialplan/*.xml` |
| `directory` | User/domain data | `directory/*.xml` |
| `languages` | Phrase macros | `lang/**/*.xml` |
| `chatplan` | Chat routing | `chatplan/*.xml` |

### 15.4 User Directory Structure

```xml
<!-- conf/vanilla/directory/default.xml -->
<include>
  <domain name="$${domain}">
    <params>
      <param name="dial-string"
             value="{^^:sip_invite_domain=${dialed_domain}:presence_id=${dialed_user}@${dialed_domain}}${sofia_contact(*/${dialed_user}@${dialed_domain})},${verto_contact(${dialed_user}@${dialed_domain})}"/>
    </params>
    <variables>
      <variable name="record_stereo" value="true"/>
    </variables>
    <groups>
      <group name="default">
        <users>
          <X-PRE-PROCESS cmd="include" data="default/*.xml"/>
        </users>
      </group>
    </groups>
  </domain>
</include>
```

Individual user entry:
```xml
<!-- conf/vanilla/directory/default/1000.xml -->
<include>
  <user id="1000">
    <params>
      <param name="password" value="$${default_password}"/>
      <param name="vm-password" value="1000"/>
    </params>
    <variables>
      <variable name="toll_allow" value="domestic,international,local"/>
      <variable name="accountcode" value="1000"/>
      <variable name="user_context" value="default"/>
      <variable name="effective_caller_id_name" value="Extension 1000"/>
      <variable name="effective_caller_id_number" value="1000"/>
      <!-- ESL per-user auth -->
      <variable name="esl-password" value="my_esl_pass"/>
      <variable name="esl-allowed-events" value="CHANNEL_CREATE,CHANNEL_HANGUP"/>
      <variable name="esl-allowed-api" value="status,show"/>
    </variables>
  </user>
</include>
```

### 15.5 XML Curl (Dynamic Configuration)

`mod_xml_curl` fetches XML config from an HTTP server on demand:

```xml
<!-- autoload_configs/xml_curl.conf.xml -->
<configuration name="xml_curl.conf" description="cURL XML Gateway">
  <bindings>
    <binding name="dialplan">
      <param name="gateway-url" value="http://myserver/freeswitch/dialplan"/>
      <param name="bindings" value="dialplan"/>
    </binding>
    <binding name="directory">
      <param name="gateway-url" value="http://myserver/freeswitch/directory"/>
      <param name="bindings" value="directory"/>
    </binding>
  </bindings>
</configuration>
```

Your HTTP server receives a POST with parameters like `section`, `tag_name`, `key_name`, `key_value`, `user`, `domain`, and must return valid FreeSWITCH XML.

---

## 16. Database and Storage

### 16.1 Database Abstraction Layer

FreeSWITCH uses a cached database handle pool (`switch_cache_db_handle_t`) that supports three backends:

| Type | DSN Format | Use Case |
|------|-----------|---------|
| SQLite (default) | `sqlite:///path/to/db` or just a path | Development, single-node |
| ODBC | `odbc://dsn:user:pass` | Production, MySQL/PostgreSQL |
| Database Interface | `pgsql://connection_string` | PostgreSQL via `mod_pgsql` |

### 16.2 Getting a Database Handle

```c
switch_cache_db_handle_t *dbh = NULL;

// Get handle by DSN (auto-detects type from prefix)
if (switch_cache_db_get_db_handle_dsn(&dbh, "sqlite:///tmp/mymodule.db")
    != SWITCH_STATUS_SUCCESS) {
    switch_log_printf(SWITCH_CHANNEL_LOG, SWITCH_LOG_ERROR, "DB connect failed\n");
    return SWITCH_STATUS_FALSE;
}

// Execute SQL
switch_cache_db_execute_sql(dbh, "CREATE TABLE IF NOT EXISTS calls "
    "(uuid TEXT, caller TEXT, ts INTEGER)", NULL);

// Execute with callback (for SELECT)
switch_cache_db_execute_sql_callback(dbh,
    "SELECT uuid, caller FROM calls",
    my_row_callback,
    my_user_data,
    NULL);

// Execute and get single string result
char result[256];
switch_cache_db_execute_sql2str(dbh,
    "SELECT COUNT(*) FROM calls",
    result, sizeof(result), NULL);

// ALWAYS release the handle when done
switch_cache_db_release_db_handle(&dbh);
```

### 16.3 SQL Callback Pattern

```c
static int my_row_callback(void *pArg, int argc, char **argv, char **columnNames)
{
    // argc = number of columns
    // argv[i] = column value (may be NULL)
    // columnNames[i] = column name
    // Return non-zero to abort iteration

    if (argv[0]) {
        switch_log_printf(SWITCH_CHANNEL_LOG, SWITCH_LOG_INFO,
            "UUID: %s Caller: %s\n", argv[0], argv[1] ? argv[1] : "NULL");
    }
    return 0;  // continue
}
```

### 16.4 Core Database Tables

The core maintains these tables (in `switch_core_sqldb.c`):

| Table | Purpose |
|-------|---------|
| `channels` | Active channel state (UUID, caller ID, state, etc.) |
| `calls` | Active call legs (bridged pairs) |
| `registrations` | SIP registrations |
| `aliases` | Dialplan aliases |
| `complete` | Tab-completion data |
| `nat` | NAT mappings |
| `recovery` | Call recovery data for failover |
| `interfaces` | Loaded module interfaces |
| `tasks` | Scheduled tasks |

Query example:
```sql
-- Get all active calls
SELECT uuid, caller_id_name, caller_id_number, dest, state
FROM channels
WHERE hostname = 'myhost';

-- Get bridged call pairs
SELECT a.uuid, a.caller_id_number, b.uuid, b.caller_id_number
FROM calls c
JOIN channels a ON c.uuid = a.uuid
JOIN channels b ON c.bleg_uuid = b.uuid;
```

### 16.5 DSN Configuration

In `conf/vanilla/autoload_configs/switch.conf.xml`:
```xml
<configuration name="switch.conf" description="Core Configuration">
  <settings>
    <!-- Use ODBC for core tables -->
    <param name="core-db-dsn" value="odbc://freeswitch:user:pass"/>
    <!-- Or PostgreSQL via mod_pgsql -->
    <param name="core-db-dsn" value="pgsql://hostaddr=127.0.0.1 dbname=freeswitch user=fs password=pass"/>
  </settings>
</configuration>
```

---

## 17. Testing Infrastructure

### 17.1 Test Framework (FCTX)

FreeSWITCH uses a custom FCTX-based test framework. Tests live in `tests/unit/`:

```c
// tests/unit/switch_core.c
#include <switch.h>
#include <test/switch_test.h>

FST_CORE_BEGIN("./conf")   // Start core with config in ./conf/
{
    FST_SUITE_BEGIN(switch_core)
    {
        FST_SETUP_BEGIN()
        {
            // Per-test setup
            switch_core_set_variable("spawn_instead_of_system", "false");
        }
        FST_SETUP_END()

        FST_TEARDOWN_BEGIN()
        {
            // Per-test teardown
        }
        FST_TEARDOWN_END()

        FST_TEST_BEGIN(test_my_feature)
        {
            // Test assertions
            fst_check(1 == 1);
            fst_check_string_equals("hello", "hello");
            fst_check_int_equals(42, 42);
            fst_requires(ptr != NULL);  // Fatal if fails
        }
        FST_TEST_END()
    }
    FST_SUITE_END()
}
FST_CORE_END()
```

### 17.2 Test Configuration

Each test has its own minimal config directory (e.g., `tests/unit/conf/`):

```
tests/unit/conf/
├── freeswitch.xml          # Minimal root config
├── autoload_configs/
│   ├── switch.conf.xml     # Core settings
│   ├── modules.conf.xml    # Only load needed modules
│   └── ...
└── dialplan/
    └── default.xml         # Test dialplan
```

### 17.3 Running Tests

```bash
# Run all unit tests
cd tests/unit
./run-tests.sh

# Run in Docker
./run-tests-docker.sh

# Run a specific test binary
./switch_core

# Run with verbose output
./switch_core -v

# Run specific test
./switch_core -t test_my_feature
```

### 17.4 Test Files Reference

| Test File | Tests |
|-----------|-------|
| `switch_core.c` | Core functions, UUID, regex, string ops |
| `switch_core_session.c` | Session creation, state machine |
| `switch_event.c` | Event creation, binding, firing |
| `switch_ivr_originate.c` | Call origination |
| `switch_ivr_play_say.c` | Playback and TTS |
| `switch_core_db.c` | Database operations |
| `switch_core_codec.c` | Codec encode/decode |
| `switch_rtp.c` | RTP send/receive |
| `switch_xml.c` | XML parsing |
| `switch_utils.c` | Utility functions |
| `switch_log.c` | Logging |
| `switch_vad.c` | Voice activity detection |
| `switch_sip.c` | SIP message parsing |
| `test_sofia.c` | Sofia SIP integration |

### 17.5 Integration Testing with ESL

For integration tests using ESL:

```python
import ESL
import time
import unittest

class FreeSWITCHTest(unittest.TestCase):
    def setUp(self):
        self.con = ESL.ESLconnection("127.0.0.1", "8021", "ClueCon")
        self.assertTrue(self.con.connected(), "ESL connection failed")
        self.con.events("plain", "ALL")

    def tearDown(self):
        self.con.disconnect()

    def test_originate_and_hangup(self):
        # Originate a loopback call
        e = self.con.api("originate loopback/1000/default &park()")
        self.assertIn("+OK", e.getBody())

        # Wait for CHANNEL_PARK event
        uuid = None
        deadline = time.time() + 10
        while time.time() < deadline:
            ev = self.con.recvEventTimed(500)
            if ev and ev.getHeader("Event-Name") == "CHANNEL_PARK":
                uuid = ev.getHeader("Unique-ID")
                break

        self.assertIsNotNone(uuid, "Call did not park")

        # Hangup
        e = self.con.api(f"uuid_kill {uuid}")
        self.assertIn("+OK", e.getBody())

if __name__ == "__main__":
    unittest.main()
```

---

## 18. Build System

### 18.1 Build Prerequisites

```bash
# Debian/Ubuntu
apt-get install -y build-essential autoconf automake libtool \
    libssl-dev zlib1g-dev libdb-dev unixodbc-dev \
    libncurses5-dev libexpat1-dev libgdbm-dev bison erlang-dev \
    libtiff5-dev yasm libsqlite3-dev libcurl4-openssl-dev \
    libpcre3-dev libspeex-dev libspeexdsp-dev libldns-dev \
    libedit-dev libopus-dev libsndfile1-dev

# CentOS/RHEL
yum install -y gcc gcc-c++ autoconf automake libtool \
    openssl-devel zlib-devel libdb-devel unixODBC-devel \
    ncurses-devel expat-devel gdbm-devel bison erlang \
    libtiff-devel yasm sqlite-devel libcurl-devel \
    pcre-devel speex-devel speexdsp-devel ldns-devel \
    libedit-devel opus-devel libsndfile-devel
```

### 18.2 Build Steps

```bash
# Clone
git clone https://github.com/signalwire/freeswitch.git
cd freeswitch

# Bootstrap (generates configure script)
./bootstrap.sh -j

# Configure
./configure \
    --enable-core-odbc-support \
    --enable-core-pgsql-pkgconfig \
    --prefix=/usr/local/freeswitch

# Build (parallel)
make -j$(nproc)

# Install
make install

# Install sounds (optional)
make cd-sounds-install
make cd-moh-install
```

### 18.3 Module Selection

Edit `modules.conf` before building to enable/disable modules:

```
# modules.conf
applications/mod_commands
applications/mod_conference
applications/mod_dptools
applications/mod_fifo
applications/mod_voicemail
codecs/mod_opus
codecs/mod_g729          # Requires separate license
endpoints/mod_sofia
endpoints/mod_verto
event_handlers/mod_event_socket
event_handlers/mod_json_cdr
formats/mod_sndfile
languages/mod_lua
xml_int/mod_xml_curl
asr_tts/mod_flite
```

### 18.4 Building a Single Module

```bash
# Build and install one module
cd src/mod/applications/mod_mymodule
make
make install

# Or from the top level
make mod_mymodule-install
```

### 18.5 Module Autoload Configuration

```xml
<!-- conf/vanilla/autoload_configs/modules.conf.xml -->
<configuration name="modules.conf" description="Modules">
  <modules>
    <load module="mod_event_socket"/>
    <load module="mod_sofia"/>
    <load module="mod_opus"/>
    <load module="mod_dptools"/>
    <load module="mod_commands"/>
    <load module="mod_lua"/>
    <!-- Conditionally load -->
    <!-- <load module="mod_g729"/> -->
  </modules>
</configuration>
```

---

## 19. Security Best Practices

### 19.1 ESL Security

The default ESL config (`event_socket.conf.xml`) binds only to `127.0.0.1` with ACL `loopback.auto`:

```xml
<!-- conf/vanilla/autoload_configs/event_socket.conf.xml -->
<configuration name="event_socket.conf" description="Socket Client">
  <settings>
    <param name="nat-map" value="false"/>
    <param name="listen-ip" value="127.0.0.1"/>   <!-- NEVER 0.0.0.0 in production -->
    <param name="listen-port" value="8021"/>
    <param name="password" value="CHANGE_THIS_PASSWORD"/>
    <param name="apply-inbound-acl" value="loopback.auto"/>
    <!-- Add additional ACL entries for trusted hosts -->
    <!-- <param name="apply-inbound-acl" value="192.168.1.0/24"/> -->
  </settings>
</configuration>
```

**Rules:**
- Never expose port 8021 to the public internet
- Always change the default password `ClueCon`
- Use `apply-inbound-acl` to restrict by IP
- Use `userauth` for per-user ESL credentials with limited permissions

### 19.2 Per-User ESL Authentication

For restricted ESL access, use `userauth` instead of `auth`:

```
# ESL client sends:
userauth user@domain:password\n\n

# Server responds with allowed events and API commands
```

User directory entry:
```xml
<variable name="esl-password" value="secure_password"/>
<variable name="esl-allowed-events" value="CHANNEL_CREATE,CHANNEL_HANGUP,DTMF"/>
<variable name="esl-allowed-api" value="status,uuid_kill,uuid_transfer"/>
```

### 19.3 SIP Security

```xml
<!-- In SIP profile -->
<!-- Require authentication for all inbound calls -->
<param name="auth-calls" value="true"/>
<param name="auth-all-packets" value="false"/>

<!-- Limit registration attempts -->
<param name="max-registrations-per-extension" value="3"/>

<!-- Challenge realm -->
<param name="challenge-realm" value="auto_from"/>

<!-- Disable REGISTER on external profile -->
<param name="disable-register" value="true"/>

<!-- ACL for SIP traffic -->
<param name="apply-inbound-acl" value="trusted_sip_providers"/>
<param name="apply-register-acl" value="internal_network"/>
```

ACL definition in `conf/vanilla/autoload_configs/acl.conf.xml`:
```xml
<configuration name="acl.conf" description="Network Lists">
  <network-lists>
    <list name="trusted_sip_providers" default="deny">
      <node type="allow" cidr="203.0.113.0/24"/>
      <node type="allow" cidr="198.51.100.5/32"/>
    </list>
    <list name="internal_network" default="deny">
      <node type="allow" cidr="192.168.0.0/16"/>
      <node type="allow" cidr="10.0.0.0/8"/>
    </list>
  </network-lists>
</configuration>
```

### 19.4 SRTP / TLS

Enable SRTP for media encryption:
```xml
<!-- In vars.xml -->
<X-PRE-PROCESS cmd="set" data="rtp_secure_media=mandatory"/>
<X-PRE-PROCESS cmd="set" data="rtp_sdes_suites=AEAD_AES_256_GCM_8|AES_CM_256_HMAC_SHA1_80"/>
```

Enable SIP TLS:
```xml
<!-- In SIP profile -->
<param name="tls" value="true"/>
<param name="tls-sip-port" value="5061"/>
<param name="tls-cert-dir" value="/etc/freeswitch/tls"/>
<param name="tls-version" value="tlsv1.2"/>
<param name="tls-ciphers" value="ALL:!ADH:!LOW:!EXP:!MD5:@STRENGTH"/>
```

### 19.5 Toll Fraud Prevention

```xml
<!-- Limit concurrent calls per user -->
<action application="limit" data="db domain ${sip_auth_user} 5 !NORMAL_CLEARING"/>

<!-- Restrict outbound calling by toll_allow variable -->
<condition field="${toll_allow}" expression="international">
  <action application="bridge" data="sofia/gateway/mygw/${destination_number}"/>
  <anti-action application="hangup" data="CALL_REJECTED"/>
</condition>

<!-- Rate limiting with mod_limit -->
<action application="limit" data="hash outbound ${caller_id_number} 10/60 !NORMAL_CLEARING"/>
```

### 19.6 Input Validation

Always validate and sanitize data before using in SQL or shell commands:

```c
// SQL injection prevention - use parameterized queries or escape
char *safe_val = switch_core_db_escape(pool, user_input);
char *sql = switch_core_sprintf(pool,
    "SELECT * FROM users WHERE name='%s'", safe_val);

// Never pass unsanitized user input to system()
// Use switch_system() which handles escaping
switch_system("safe_command", SWITCH_TRUE);

// Validate UUID format before use
if (!switch_is_uuid(uuid_str)) {
    // reject
}
```

---

## 20. Performance Tuning

### 20.1 Core Settings

In `conf/vanilla/autoload_configs/switch.conf.xml`:

```xml
<configuration name="switch.conf" description="Core Configuration">
  <settings>
    <!-- Thread pool for sessions (reduces thread creation overhead) -->
    <param name="sessions-per-second" value="30"/>
    <param name="max-sessions" value="1000"/>

    <!-- RTP port range -->
    <param name="rtp-start-port" value="16384"/>
    <param name="rtp-end-port" value="32768"/>

    <!-- Database connection pool -->
    <param name="max-db-handles" value="50"/>
    <param name="db-handle-timeout" value="10"/>

    <!-- Event dispatch threads (increase for high event volume) -->
    <param name="event-dispatch-threads" value="4"/>

    <!-- Use high-resolution timer -->
    <param name="timer-affinity" value="disabled"/>

    <!-- Minimum DTX period -->
    <param name="min-idle-cpu" value="25"/>
  </settings>
</configuration>
```

### 20.2 SIP Profile Tuning

```xml
<!-- In SIP profile -->
<!-- Increase worker threads for high call volume -->
<param name="sip-port" value="5060"/>
<param name="nonce-ttl" value="60"/>
<param name="rtp-timer-name" value="soft"/>

<!-- Disable features not needed -->
<param name="enable-timer" value="false"/>
<param name="manage-presence" value="false"/>  <!-- if not using presence -->
<param name="send-message-query-on-register" value="false"/>

<!-- Codec negotiation -->
<param name="inbound-codec-negotiation" value="generous"/>
<param name="outbound-codec-negotiation" value="generous"/>
<param name="codec-prefs" value="OPUS,G722,PCMU,PCMA"/>
```

### 20.3 Media Bypass

For pure SIP proxy scenarios, bypass media to reduce CPU:

```xml
<!-- Bypass media (FS not in media path) -->
<action application="set" data="bypass_media=true"/>
<action application="bridge" data="sofia/external/..."/>

<!-- Proxy media (FS in path but passes through) -->
<action application="set" data="proxy_media=true"/>
<action application="bridge" data="sofia/external/..."/>
```

### 20.4 RTP Optimization

```xml
<!-- Disable RTCP if not needed -->
<action application="set" data="rtp_disable_rtcp=true"/>

<!-- Jitter buffer tuning -->
<action application="set" data="jitterbuffer_msec=60:120:20"/>

<!-- Suppress comfort noise -->
<action application="set" data="suppress_cng=true"/>

<!-- Disable ZRTP if not needed -->
<action application="set" data="zrtp_secure_media=false"/>
```

### 20.5 Lua Performance

```lua
-- Cache API object (avoid recreating per call)
local api = freeswitch.API()

-- Use session:ready() check in loops
while session:ready() do
    -- ...
end

-- Avoid blocking calls in tight loops
-- Use session:sleep() instead of os.execute("sleep")
session:sleep(100)

-- Prefer session:getVariable() over API calls for channel vars
local val = session:getVariable("my_var")
```

### 20.6 Event Subscription Optimization

```
# Subscribe only to events you need (not ALL)
event plain CHANNEL_CREATE CHANNEL_HANGUP DTMF BACKGROUND_JOB

# Filter to specific UUIDs to reduce event processing
filter Unique-ID <uuid>

# Use JSON format for easier parsing (slightly more overhead)
event json CHANNEL_CREATE CHANNEL_HANGUP
```

---

## 21. Debugging and Logging

### 21.1 Log Levels

From `src/include/switch_types.h` and `src/switch_log.c`:

| Level | Value | Use |
|-------|-------|-----|
| `SWITCH_LOG_CONSOLE` | 0 | Console output only |
| `SWITCH_LOG_ALERT` | 1 | System-level alerts |
| `SWITCH_LOG_CRIT` | 2 | Critical errors (system may be unstable) |
| `SWITCH_LOG_ERROR` | 3 | Errors (operation failed) |
| `SWITCH_LOG_WARNING` | 4 | Warnings (unexpected but recoverable) |
| `SWITCH_LOG_NOTICE` | 5 | Notable events |
| `SWITCH_LOG_INFO` | 6 | Informational |
| `SWITCH_LOG_DEBUG` | 7 | Debug (default max) |
| `SWITCH_LOG_DEBUG1`–`DEBUG10` | 101–110 | Verbose debug levels |

### 21.2 Logging Macros

```c
// Standard log with file/function/line context
switch_log_printf(SWITCH_CHANNEL_LOG, SWITCH_LOG_INFO, "Message: %s\n", val);

// Session-scoped log (includes UUID in output)
switch_log_printf(SWITCH_CHANNEL_SESSION_LOG(session), SWITCH_LOG_DEBUG,
    "Session message: %s\n", val);

// Channel-scoped log
switch_log_printf(SWITCH_CHANNEL_CHANNEL_LOG(channel), SWITCH_LOG_WARNING,
    "Channel message\n");

// Clean log (no file/line prefix)
switch_log_printf(SWITCH_CHANNEL_LOG_CLEAN, SWITCH_LOG_INFO, "Clean: %s\n", val);
```

### 21.3 Runtime Log Level Control

```bash
# In fs_cli or via ESL api command:

# Set global log level
fsctl loglevel debug
fsctl loglevel info

# Set log level for a specific module
logsofttimer debug

# Enable SIP trace
sofia global siptrace on
sofia global siptrace off

# Enable RTP debug for a session
uuid_debug_media <uuid> on
uuid_debug_media <uuid> off

# Enable verbose events (adds more headers to events)
fsctl verbose_events on
```

### 21.4 fs_cli Debugging

```bash
# Connect to running FreeSWITCH
fs_cli -H 127.0.0.1 -P 8021 -p ClueCon

# Inside fs_cli:
/log debug          # Set log level to debug
/log info           # Set log level to info
/nolog              # Disable log output

# Show active channels
show channels
show channels as json

# Show calls
show calls

# Trace a specific call
uuid_debug_media <uuid> on

# Show module info
show modules
show api
show applications

# Execute API
status
sofia status
sofia status profile internal
```

### 21.5 SIP Tracing

```bash
# Enable SIP trace to console
sofia global siptrace on

# Enable SIP trace to file (via ngrep or sngrep)
sngrep -I /path/to/capture.pcap

# Sofia-SIP log level (0=quiet, 9=verbose)
sofia loglevel all 9
sofia loglevel all 0

# Capture RTP
uuid_debug_media <uuid> on
```

### 21.6 Core Dump Analysis

```bash
# Enable core dumps
ulimit -c unlimited

# Build with debug symbols
./configure --enable-debug
make

# Analyze with gdb
gdb /usr/local/freeswitch/bin/freeswitch core
(gdb) bt full
(gdb) thread apply all bt
```

### 21.7 ESL Log Subscription

```
# Subscribe to log output via ESL
log debug\n\n

# Stop log subscription
nolog\n\n

# Set log level for this connection
log 7\n\n
```

---

## 22. Common Patterns and Idioms

### 22.1 Safe String Handling

```c
// Check for NULL or empty string
if (zstr(str)) { /* NULL or "" */ }
if (!zstr(str)) { /* non-NULL and non-empty */ }

// NULL-safe string comparison
if (!strcasecmp(switch_str_nil(str), "expected")) { ... }

// NULL-safe string output
stream->write_function(stream, "%s", switch_str_nil(val));

// Safe string copy (always NUL-terminates)
switch_copy_string(dst, src, sizeof(dst));

// Safe snprintf
switch_snprintf(buf, sizeof(buf), "format %s", val);

// String duplication into pool
char *copy = switch_core_strdup(pool, original);

// String duplication into session pool
char *copy = switch_core_session_strdup(session, original);
```

### 22.2 Originate Dial String Syntax

```
# Basic originate
originate sofia/internal/1000@domain &echo()

# With channel variables (global, apply to all legs)
originate {origination_caller_id_number=5551234}sofia/internal/1000@domain &echo()

# Multiple variables
originate {var1=val1,var2=val2}sofia/internal/1000@domain &echo()

# Per-leg variables (apply only to this leg)
originate [leg_timeout=30]sofia/internal/1000@domain &echo()

# Simultaneous ring (AND - all ring at once)
originate sofia/internal/1000@domain:sofia/internal/1001@domain &echo()

# Sequential ring (OR - try each in order)
originate sofia/internal/1000@domain|sofia/internal/1001@domain &echo()

# Enterprise originate (multiple groups)
originate sofia/internal/1000@domain:_:sofia/internal/1001@domain &echo()

# With timeout
originate {originate_timeout=30}sofia/internal/1000@domain &echo()

# With retries
originate {originate_retries=3,originate_retry_sleep_ms=5000}sofia/gw/mygw/18005551234 &echo()
```

### 22.3 UUID Operations Pattern

```c
// Always check session validity before use
switch_core_session_t *session;
if ((session = switch_core_session_locate(uuid))) {
    switch_channel_t *channel = switch_core_session_get_channel(session);

    if (switch_channel_ready(channel)) {
        // Do work
    }

    switch_core_session_rwunlock(session);  // CRITICAL: always unlock
}
```

### 22.4 Thread-Safe Global State

```c
// Module globals pattern
static struct {
    switch_mutex_t *mutex;
    switch_hash_t *hash;
    int running;
    switch_memory_pool_t *pool;
} globals;

// Initialize in module load
switch_core_new_memory_pool(&globals.pool);
switch_mutex_init(&globals.mutex, SWITCH_MUTEX_NESTED, globals.pool);
switch_core_hash_init(&globals.hash);
globals.running = 1;

// Thread-safe access
switch_mutex_lock(globals.mutex);
switch_core_hash_insert(globals.hash, key, value);
switch_mutex_unlock(globals.mutex);

// Cleanup in shutdown
switch_mutex_lock(globals.mutex);
globals.running = 0;
switch_mutex_unlock(globals.mutex);
switch_core_hash_destroy(&globals.hash);
switch_core_destroy_memory_pool(&globals.pool);
```

### 22.5 Spawning a Thread from a Module

```c
static void *SWITCH_THREAD_FUNC my_thread_run(switch_thread_t *thread, void *obj)
{
    my_data_t *data = (my_data_t *)obj;

    while (globals.running) {
        // Do work
        switch_yield(100000);  // 100ms sleep
    }

    return NULL;
}

// Launch the thread
switch_thread_t *thread;
switch_threadattr_t *thd_attr;
switch_threadattr_create(&thd_attr, globals.pool);
switch_threadattr_detach_set(thd_attr, 1);  // detached = auto-cleanup
switch_threadattr_stacksize_set(thd_attr, SWITCH_THREAD_STACKSIZE);
switch_thread_create(&thread, thd_attr, my_thread_run, my_data, globals.pool);
```

### 22.6 Hash Table Usage

```c
switch_hash_t *hash;
switch_core_hash_init(&hash);

// Insert
switch_core_hash_insert(hash, "key", value_ptr);

// Find
void *val = switch_core_hash_find(hash, "key");

// Delete
switch_core_hash_delete(hash, "key");

// Iterate
switch_hash_index_t *hi;
for (hi = switch_core_hash_first(hash); hi; hi = switch_core_hash_next(&hi)) {
    const void *key;
    void *val;
    switch_core_hash_this(hi, &key, NULL, &val);
    // process key/val
}

// Destroy
switch_core_hash_destroy(&hash);
```

---

## 23. Common Pitfalls

### 23.1 Session Lock Leaks

**Wrong:**
```c
switch_core_session_t *session = switch_core_session_locate(uuid);
if (session) {
    // ... do work ...
    // FORGOT TO UNLOCK — session will never be destroyed
}
```

**Correct:**
```c
switch_core_session_t *session;
if ((session = switch_core_session_locate(uuid))) {
    // ... do work ...
    switch_core_session_rwunlock(session);  // ALWAYS
}
```

### 23.2 Blocking in Event Handlers

**Wrong:**
```c
static void my_event_handler(switch_event_t *event)
{
    // This blocks the event dispatch thread for all events!
    sleep(5);
    make_http_request(url);  // Network I/O in event handler
}
```

**Correct:**
```c
static void my_event_handler(switch_event_t *event)
{
    // Clone the event and queue it for async processing
    switch_event_t *clone;
    switch_event_dup(&clone, event);
    switch_queue_push(my_work_queue, clone);
    // Return immediately
}
```

### 23.3 Freeing Pool Memory

**Wrong:**
```c
char *buf = switch_core_session_alloc(session, 256);
// ...
free(buf);  // WRONG: pool memory must not be freed with free()
```

**Correct:**
```c
char *buf = switch_core_session_alloc(session, 256);
// Use buf, it will be freed when the session ends
// OR use heap allocation if you need to free it manually:
char *buf = malloc(256);
// ...
switch_safe_free(buf);  // NULL-safe free
```

### 23.4 Using `data` Pointer After Application Returns

**Wrong:**
```c
SWITCH_STANDARD_APP(my_app)
{
    // data points into the dialplan XML — do NOT store it
    globals.last_arg = data;  // WRONG: data may be freed
}
```

**Correct:**
```c
SWITCH_STANDARD_APP(my_app)
{
    // Duplicate into session pool if you need to keep it
    char *my_data = switch_core_session_strdup(session, data);
    globals.last_arg = my_data;  // Still wrong to store in globals
    // Better: use it locally only
}
```

### 23.5 Race Conditions with Channel State

**Wrong:**
```c
if (switch_channel_get_state(channel) == CS_EXECUTE) {
    // Channel might have changed state between check and use
    switch_channel_set_state(channel, CS_PARK);
}
```

**Correct:**
```c
// Use switch_channel_ready() for "is the channel usable" checks
if (switch_channel_ready(channel)) {
    // Channel is in a usable state (not hung up)
    switch_ivr_park(session, NULL);
}
```

### 23.6 XML Memory Leaks

**Wrong:**
```c
switch_xml_t xml = switch_xml_open_cfg("mymodule.conf", &cfg, NULL);
// ... use xml ...
// FORGOT to free
```

**Correct:**
```c
switch_xml_t xml, cfg;
if ((xml = switch_xml_open_cfg("mymodule.conf", &cfg, NULL))) {
    // ... use cfg ...
    switch_xml_free(xml);  // ALWAYS free the root xml handle
}
```

### 23.7 Incorrect Originate String Parsing

**Wrong:**
```c
// Assuming originate string is always "type/data"
char *slash = strchr(dial_str, '/');
char *type = strndup(dial_str, slash - dial_str);
```

**Correct:**
```c
// Use the core's originate function which handles all syntax
switch_ivr_originate(session, &new_session, &cause,
    dial_str, 30, NULL, NULL, NULL, NULL, NULL,
    SOF_NONE, NULL, NULL);
```

### 23.8 Default Password in Production

The default `vars.xml` sets `default_password=1234`. **Always change this** before deploying:

```xml
<!-- conf/vanilla/vars.xml -->
<X-PRE-PROCESS cmd="set" data="default_password=STRONG_RANDOM_PASSWORD"/>
```

Also change the ESL password in `event_socket.conf.xml`.

---

## 24. AI Agent Integration Patterns

### 24.1 Architecture Overview

The recommended architecture for AI agent integration with FreeSWITCH:

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Agent Service                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  ESL Client  │  │  ASR Engine  │  │  TTS Engine      │  │
│  │  (inbound)   │  │  (Whisper,   │  │  (ElevenLabs,    │  │
│  │              │  │   Deepgram)  │  │   Google, etc.)  │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │            │
│  ┌──────▼─────────────────▼────────────────────▼─────────┐  │
│  │              AI Orchestration Layer                    │  │
│  │  (LLM, dialog management, intent recognition)         │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │ ESL (port 8021)          │ Audio (RTP/unicast)
         ▼                          ▼
┌─────────────────────────────────────────────────────────────┐
│                       FreeSWITCH                            │
│  mod_event_socket │ mod_sofia │ mod_dptools │ mod_shout     │
└─────────────────────────────────────────────────────────────┘
```

### 24.2 Pattern 1: ESL Inbound + Audio Streaming

The most common pattern for AI voice agents:

```python
import ESL
import asyncio
import websockets
import json

class AIVoiceAgent:
    def __init__(self):
        self.con = ESL.ESLconnection("127.0.0.1", "8021", "ClueCon")
        self.active_calls = {}

    def start(self):
        self.con.events("plain",
            "CHANNEL_CREATE CHANNEL_HANGUP CHANNEL_ANSWER "
            "DTMF DETECTED_SPEECH RECORD_STOP PLAYBACK_STOP")

        while self.con.connected():
            e = self.con.recvEventTimed(100)
            if not e:
                continue

            event_name = e.getHeader("Event-Name")
            uuid = e.getHeader("Unique-ID")

            if event_name == "CHANNEL_CREATE":
                self.on_channel_create(uuid, e)
            elif event_name == "CHANNEL_ANSWER":
                self.on_channel_answer(uuid, e)
            elif event_name == "DTMF":
                self.on_dtmf(uuid, e.getHeader("DTMF-Digit"))
            elif event_name == "CHANNEL_HANGUP":
                self.on_channel_hangup(uuid, e)

    def on_channel_answer(self, uuid, event):
        # Start streaming audio to AI for transcription
        # Use mod_shout or unicast to stream RTP to ASR service
        self.con.api(f"uuid_record {uuid} start /tmp/recording_{uuid}.wav")

        # Or use unicast to stream raw audio
        self.con.execute("sendmsg", f"""
call-command: unicast
local-ip: 127.0.0.1
local-port: 8025
remote-ip: 127.0.0.1
remote-port: 8026
transport: tcp
""")

    def play_tts(self, uuid, text):
        # Play TTS audio file
        tts_file = self.generate_tts(text)
        self.con.api(f"uuid_broadcast {uuid} {tts_file} aleg")

    def on_dtmf(self, uuid, digit):
        # Handle DTMF input
        pass

    def on_channel_hangup(self, uuid, event):
        cause = event.getHeader("Hangup-Cause")
        self.active_calls.pop(uuid, None)
```

### 24.3 Pattern 2: Outbound Socket (Per-Call Control)

For maximum per-call control, use outbound socket mode:

```xml
<!-- Dialplan: route calls to AI agent -->
<extension name="ai_agent">
  <condition field="destination_number" expression="^(1800\d+)$">
    <action application="answer"/>
    <action application="socket" data="127.0.0.1:8084 async full"/>
  </condition>
</extension>
```

```python
import ESL

def handle_call(server_sock, client_sock, addr, user_data):
    con = ESL.ESLconnection(client_sock)
    info = con.getInfo()
    uuid = info.getHeader("unique-id")
    caller = info.getHeader("Caller-Caller-ID-Number")

    # Subscribe to this call's events
    con.sendRecv("myevents\n\n")
    con.sendRecv("linger\n\n")  # Stay connected after hangup

    # Greet the caller
    con.execute("playback", "/sounds/greeting.wav", uuid)

    # Wait for playback to finish
    while con.connected():
        e = con.recvEventTimed(5000)
        if not e:
            break
        if e.getHeader("Event-Name") == "PLAYBACK_STOP":
            break

    # Collect DTMF
    con.execute("play_and_get_digits",
        "1 1 3 5000 # /sounds/menu.wav /sounds/invalid.wav DTMF_RESULT \\d+",
        uuid)

    # Wait for result
    while con.connected():
        e = con.recvEventTimed(10000)
        if not e:
            break
        if e.getHeader("Event-Name") == "CHANNEL_EXECUTE_COMPLETE":
            if e.getHeader("Application") == "play_and_get_digits":
                digit = e.getHeader("variable_DTMF_RESULT")
                handle_menu_selection(con, uuid, digit)
                break

    con.execute("hangup", "", uuid)

ESL.eslSetLogLevel(0)
ESL.esl_listen_threaded("127.0.0.1", 8084, handle_call, 10)
```

### 24.4 Pattern 3: Real-Time Audio with mod_audio_stream

For streaming audio to an external WebSocket ASR service, use `mod_audio_stream` (if available) or `mod_shout`:

```xml
<!-- Stream audio to WebSocket ASR -->
<action application="audio_stream" data="ws://localhost:9000 16000 mixed"/>
```

Or use the unicast approach with a custom receiver:

```python
import socket
import threading

class RTPReceiver:
    def __init__(self, port=8026):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.bind(("127.0.0.1", port))
        self.sock.listen(1)

    def start(self, callback):
        def run():
            conn, addr = self.sock.accept()
            while True:
                data = conn.recv(320)  # 20ms of 8kHz PCM
                if not data:
                    break
                callback(data)  # Send to ASR engine
        threading.Thread(target=run, daemon=True).start()
```

### 24.5 Pattern 4: mod_lua for Inline AI Logic

For simpler integrations, use Lua with HTTP calls:

```lua
-- scripts/ai_ivr.lua
local http = require("socket.http")
local json = require("cjson")

session:answer()
session:sleep(500)

-- Get caller info
local caller_id = session:getVariable("caller_id_number")
local dest = session:getVariable("destination_number")

-- Call AI service to get greeting
local response = http.request("http://ai-service/greet?caller=" .. caller_id)
local data = json.decode(response)

-- Play TTS response
session:execute("speak", "flite|kal|" .. data.greeting)

-- Collect input
local digits = session:playAndGetDigits(1, 4, 3, 5000, "#",
    "/sounds/prompt.wav", "/sounds/invalid.wav", "\\d+")

-- Send to AI for intent recognition
local intent_response = http.request(
    "http://ai-service/intent?digits=" .. digits .. "&caller=" .. caller_id)
local intent = json.decode(intent_response)

-- Route based on intent
if intent.action == "transfer" then
    session:execute("transfer", intent.destination .. " XML default")
elseif intent.action == "voicemail" then
    session:execute("voicemail", "default " .. session:getVariable("domain") .. " " .. intent.mailbox)
else
    session:execute("playback", "/sounds/goodbye.wav")
    session:hangup("NORMAL_CLEARING")
end
```

### 24.6 Pattern 5: Conference-Based AI Participant

Add an AI participant to a conference call:

```python
def add_ai_to_conference(con, conf_name, ai_audio_source):
    """Originate an AI participant into a conference."""

    # Originate a loopback call into the conference
    result = con.api(
        f"originate {{origination_caller_id_name=AI Assistant,"
        f"origination_caller_id_number=0000}}"
        f"loopback/1000/default "
        f"&conference({conf_name}@default)"
    )

    if "+OK" in result.getBody():
        uuid = result.getBody().split()[1]

        # Now stream AI audio to this channel
        con.api(f"uuid_broadcast {uuid} {ai_audio_source} aleg")
        return uuid
    return None
```

### 24.7 DTMF-Based AI Menu

```python
class DTMFMenu:
    def __init__(self, con, uuid):
        self.con = con
        self.uuid = uuid
        self.state = "main"

    def play_prompt(self, text_or_file):
        if text_or_file.startswith("/"):
            self.con.api(f"uuid_broadcast {self.uuid} {text_or_file} aleg")
        else:
            # TTS
            tts_file = generate_tts(text_or_file)
            self.con.api(f"uuid_broadcast {self.uuid} {tts_file} aleg")

    def collect_dtmf(self, timeout_ms=5000):
        """Collect DTMF with timeout."""
        deadline = time.time() + timeout_ms / 1000
        digits = []

        while time.time() < deadline:
            e = self.con.recvEventTimed(100)
            if e and e.getHeader("Event-Name") == "DTMF":
                digit = e.getHeader("DTMF-Digit")
                if digit == "#":
                    break
                digits.append(digit)
                deadline = time.time() + 2  # Reset timeout after each digit

        return "".join(digits)

    def handle_main_menu(self):
        self.play_prompt("Press 1 for sales, 2 for support, or 0 to speak with an agent.")
        digit = self.collect_dtmf()

        if digit == "1":
            self.con.api(f"uuid_transfer {self.uuid} 1001 XML default")
        elif digit == "2":
            self.con.api(f"uuid_transfer {self.uuid} 1002 XML default")
        elif digit == "0":
            self.con.api(f"uuid_transfer {self.uuid} 1000 XML default")
        else:
            self.play_prompt("Invalid selection.")
            self.handle_main_menu()
```

### 24.8 Speech Recognition Integration

Using `mod_pocketsphinx` or external ASR via media bugs:

```xml
<!-- Enable ASR on a channel -->
<action application="set" data="fire_asr_events=true"/>
<action application="detect_speech" data="pocketsphinx default default"/>
```

```python
# Listen for ASR results via ESL
def handle_asr_event(event):
    if event.getHeader("Event-Name") == "DETECTED_SPEECH":
        grammar = event.getHeader("Speech-Type")
        result = event.getHeader("Speech-Result")
        confidence = event.getHeader("Speech-Confidence")

        if grammar == "detected":
            process_speech_result(result, float(confidence))
```

For external ASR (Whisper, Deepgram, etc.), use media bugs in a C module:

```c
// In your module, add a media bug to capture audio
switch_core_media_bug_add(
    session,
    "asr_capture",
    NULL,
    asr_bug_callback,
    my_asr_context,
    0,
    SMBF_READ_STREAM,
    &bug
);

// In the callback, buffer audio and send to ASR service
static switch_bool_t asr_bug_callback(
    switch_media_bug_t *bug,
    void *user_data,
    switch_abc_type_t type)
{
    asr_context_t *ctx = (asr_context_t *)user_data;

    if (type == SWITCH_ABC_TYPE_READ) {
        switch_frame_t *frame = switch_core_media_bug_get_read_replace_frame(bug);
        // Buffer PCM audio: frame->data, frame->datalen bytes
        // frame->rate = sample rate (typically 8000 or 16000)
        buffer_audio(ctx, frame->data, frame->datalen);
    }
    return SWITCH_TRUE;
}
```

### 24.9 Text-to-Speech Integration

```python
def generate_and_play_tts(con, uuid, text, voice="en-US-Neural2-F"):
    """Generate TTS audio and play it to a channel."""
    import hashlib
    import os

    # Cache TTS files by content hash
    cache_key = hashlib.md5(f"{text}{voice}".encode()).hexdigest()
    cache_file = f"/tmp/tts_cache/{cache_key}.wav"

    if not os.path.exists(cache_file):
        # Call TTS API (Google, ElevenLabs, etc.)
        audio_data = call_tts_api(text, voice)
        with open(cache_file, "wb") as f:
            f.write(audio_data)

    # Play via ESL
    con.api(f"uuid_broadcast {uuid} {cache_file} aleg")

    # Wait for playback to complete
    while True:
        e = con.recvEventTimed(30000)
        if not e:
            break
        if e.getHeader("Event-Name") == "PLAYBACK_STOP":
            if e.getHeader("Unique-ID") == uuid:
                break
```

### 24.10 Call Recording for AI Analysis

```python
def start_call_recording(con, uuid, output_dir="/recordings"):
    """Start dual-channel recording for AI analysis."""
    import os
    os.makedirs(output_dir, exist_ok=True)

    recording_path = f"{output_dir}/{uuid}.wav"

    # Record both legs in stereo
    con.api(f"uuid_setvar {uuid} RECORD_STEREO true")
    con.api(f"uuid_record {uuid} start {recording_path}")

    return recording_path

def stop_and_analyze(con, uuid, recording_path):
    """Stop recording and send to AI for analysis."""
    con.api(f"uuid_record {uuid} stop {recording_path}")

    # Wait for RECORD_STOP event
    while True:
        e = con.recvEventTimed(5000)
        if not e:
            break
        if e.getHeader("Event-Name") == "RECORD_STOP":
            if e.getHeader("variable_record_file_path") == recording_path:
                # Send to AI analysis service
                analyze_recording(recording_path)
                break
```

---

## 25. Glossary

| Term | Definition |
|------|-----------|
| **A-leg** | The originating (inbound) call leg |
| **B-leg** | The destination (outbound) call leg created by `bridge` or `originate` |
| **ACL** | Access Control List — IP-based allow/deny rules |
| **ANI** | Automatic Number Identification — the calling party's number |
| **ANIII** | ANI Information Indicator — additional caller info |
| **APR** | Apache Portable Runtime — the threading/socket/pool library FreeSWITCH uses |
| **ASR** | Automatic Speech Recognition |
| **bgapi** | Background API — async ESL command that returns a Job-UUID |
| **Bridge** | Connecting two call legs so they can exchange media |
| **CDR** | Call Detail Record — post-call accounting data |
| **Channel** | The signaling state of a call leg (`switch_channel_t`) |
| **ClueCon** | The default ESL password (also the name of the FreeSWITCH conference) |
| **Context** | A named group of dialplan extensions (e.g., `default`, `public`) |
| **DTLS** | Datagram TLS — used for WebRTC key exchange |
| **DTMF** | Dual-Tone Multi-Frequency — telephone keypad tones |
| **Early Media** | Audio before a call is answered (183 Session Progress) |
| **ESL** | Event Socket Library — the external control interface |
| **Extension** | A dialplan routing rule with conditions and actions |
| **FCTX** | FreeSWITCH's C unit test framework |
| **Gateway** | An outbound SIP registration to a provider |
| **ICE** | Interactive Connectivity Establishment — WebRTC NAT traversal |
| **IVR** | Interactive Voice Response — automated phone menus |
| **Media Bug** | A hook to intercept/modify audio/video frames in a session |
| **mod_dptools** | The core dialplan tools module (bridge, playback, set, etc.) |
| **mod_sofia** | The SIP endpoint module (based on Sofia-SIP library) |
| **mod_verto** | The WebRTC/WebSocket endpoint module |
| **NUA** | Sofia-SIP's Network User Agent — the SIP stack |
| **Originate** | Creating an outbound call leg |
| **Park** | Placing a call in a waiting state |
| **Pool** | APR memory pool — a region of memory freed all at once |
| **Profile** | A SIP listener configuration (internal, external, etc.) |
| **RDNIS** | Redirecting DNIS — the number that was redirected |
| **RTP** | Real-time Transport Protocol — carries audio/video |
| **SAF** | Switch Application Flag — flags for dialplan applications |
| **SCF** | Switch Core Flag — runtime flags for the core engine |
| **SDP** | Session Description Protocol — describes media capabilities |
| **Session** | A single call leg with its own thread (`switch_core_session_t`) |
| **SMBF** | Switch Media Bug Flag — flags for media bug behavior |
| **SOF** | Switch Originate Flag — flags for `switch_ivr_originate()` |
| **Sofia-SIP** | The open-source SIP stack used by `mod_sofia` |
| **SRTP** | Secure RTP — encrypted media |
| **State Handler** | A callback table for channel state transitions |
| **tech_pvt** | Technology-private data — endpoint-specific session data |
| **TLS** | Transport Layer Security — encrypted SIP signaling |
| **TTS** | Text-to-Speech |
| **UUID** | Universally Unique Identifier — identifies a session |
| **VAD** | Voice Activity Detection |
| **Verto** | FreeSWITCH's JSON-RPC over WebSocket protocol |
| **XML Curl** | Dynamic XML config fetched from an HTTP server |
| `zstr()` | Macro: returns true if string is NULL or empty |
| `switch_safe_free()` | NULL-safe `free()` macro |
| `SWITCH_CHANNEL_LOG` | Log channel macro that includes file/function/line |
| `SWITCH_CHANNEL_SESSION_LOG(s)` | Log channel macro that includes session UUID |

---

Here is the continuation of the SKILL.md with the new sections. Add these after section 25 (Glossary):

---

```markdown
---

## 26. OpenSIPS Integration

### 26.1 Architecture: OpenSIPS as SIP Proxy in Front of FreeSWITCH

The canonical production pattern places OpenSIPS as the SIP edge proxy and FreeSWITCH as the media/application server:

```
                    ┌──────────────────────────────────────────┐
  SIP Clients ──────►  OpenSIPS (SIP Proxy / Load Balancer)   │
  PSTN Carriers ────►  Port 5060/5061 (UDP/TCP/TLS)           │
                    └──────────────┬───────────────────────────┘
                                   │ SIP (internal, port 5080)
                    ┌──────────────▼───────────────────────────┐
                    │  FreeSWITCH Cluster (1..N nodes)         │
                    │  mod_sofia (internal profile, port 5080) │
                    │  mod_event_socket (port 8021)            │
                    └──────────────────────────────────────────┘
```

**Why this pattern:**
- OpenSIPS handles registration, authentication, NAT traversal, and load balancing
- FreeSWITCH handles media, conferencing, IVR, recording, and application logic
- FreeSWITCH's `internal` profile does NOT need to be exposed to the public internet
- OpenSIPS `dispatcher` module distributes calls across FS nodes

### 26.2 FreeSWITCH Configuration for OpenSIPS Integration

Configure a dedicated SIP profile that trusts OpenSIPS:

```xml
<!-- conf/sip_profiles/opensips.xml -->
<profile name="opensips">
  <settings>
    <!-- Listen on internal interface only -->
    <param name="sip-ip" value="10.0.0.10"/>
    <param name="sip-port" value="5080"/>
    <param name="rtp-ip" value="10.0.0.10"/>

    <!-- Trust OpenSIPS as a proxy — disable auth for trusted IPs -->
    <param name="auth-calls" value="false"/>
    <param name="apply-inbound-acl" value="opensips_trusted"/>

    <!-- Accept calls from OpenSIPS without re-authentication -->
    <param name="accept-blind-auth" value="true"/>

    <!-- Context for inbound calls from OpenSIPS -->
    <param name="context" value="from_opensips"/>
    <param name="dialplan" value="XML"/>

    <!-- Do NOT register — OpenSIPS pushes calls to us -->
    <param name="disable-register" value="true"/>

    <!-- Preserve OpenSIPS Route headers -->
    <param name="outbound-proxy" value="sip:10.0.0.5:5060"/>

    <!-- Pass P-Asserted-Identity through -->
    <param name="pass-rfc2833" value="true"/>
    <param name="inbound-use-callid-as-uuid" value="true"/>
  </settings>
</profile>
```

ACL for OpenSIPS:
```xml
<!-- autoload_configs/acl.conf.xml -->
<list name="opensips_trusted" default="deny">
  <node type="allow" cidr="10.0.0.5/32"/>   <!-- OpenSIPS primary -->
  <node type="allow" cidr="10.0.0.6/32"/>   <!-- OpenSIPS secondary -->
</list>
```

### 26.3 OpenSIPS dispatcher.list for FreeSWITCH Nodes

```
# /etc/opensips/dispatcher.list
# setid  destination                  flags  priority  attrs
1        sip:10.0.0.10:5080           0      0         fs_node=fs1
1        sip:10.0.0.11:5080           0      0         fs_node=fs2
1        sip:10.0.0.12:5080           0      0         fs_node=fs3
```

### 26.4 OpenSIPS Script for FreeSWITCH Dispatch

```
# opensips.cfg (relevant sections)

loadmodule "dispatcher.so"
loadmodule "dialog.so"
loadmodule "tm.so"

modparam("dispatcher", "db_url", "mysql://opensips:pass@localhost/opensips")
modparam("dispatcher", "ds_ping_method", "OPTIONS")
modparam("dispatcher", "ds_ping_interval", 10)
modparam("dispatcher", "ds_probing_mode", 1)

route[TO_FREESWITCH] {
    # Load balance across FS nodes (round-robin with failover)
    if (!ds_select_dst(1, 4)) {
        send_reply(503, "Service Unavailable");
        exit;
    }

    # Add X-FS-Node header so FS knows which OpenSIPS sent the call
    append_hf("X-OpenSIPS-Node: $Ri\r\n");

    # Forward to selected FreeSWITCH node
    t_relay();
    exit;
}
```

### 26.5 Reading OpenSIPS Headers in FreeSWITCH Dialplan

```xml
<!-- conf/dialplan/from_opensips.xml -->
<context name="from_opensips">

  <!-- Extract caller info passed by OpenSIPS -->
  <extension name="inbound_from_opensips">
    <condition field="${sip_h_X-OpenSIPS-Node}" expression="^(.+)$">
      <action application="set" data="opensips_node=$1"/>
    </condition>
    <condition field="${sip_h_P-Asserted-Identity}" expression="sip:(.+)@">
      <action application="set" data="effective_caller_id_number=$1"/>
    </condition>
    <condition field="destination_number" expression="^(\d+)$">
      <action application="transfer" data="$1 XML default"/>
    </condition>
  </extension>

</context>
```

### 26.6 FreeSWITCH → OpenSIPS Outbound (Originate via OpenSIPS)

```xml
<!-- Route outbound calls through OpenSIPS -->
<action application="bridge"
        data="sofia/opensips/sip:${destination_number}@10.0.0.5:5060"/>
```

Or via ESL:
```python
# Originate through OpenSIPS outbound proxy
con.api(
    "originate "
    "{origination_caller_id_number=5551234,"
    "sip_h_X-Tenant-ID=tenant_abc}"
    "sofia/opensips/sip:18005551234@10.0.0.5:5060 "
    "&bridge(sofia/internal/1001@domain)"
)
```

### 26.7 OpenSIPS + FreeSWITCH: Call State Synchronization via MI

OpenSIPS Management Interface (MI) can query FreeSWITCH state via ESL:

```python
# Sync active calls between OpenSIPS and FreeSWITCH
import ESL
import requests

def sync_call_state():
    con = ESL.ESLconnection("127.0.0.1", "8021", "ClueCon")
    e = con.api("show channels as json")
    channels = json.loads(e.getBody())

    # Post active UUIDs to OpenSIPS via MI HTTP
    for ch in channels.get("rows", []):
        uuid = ch["uuid"]
        requests.post("http://opensips:8080/mi/dlg_list",
                      json={"callid": uuid})
    con.disconnect()
```

### 26.8 OpenSIPS Presence / BLF with FreeSWITCH

```xml
<!-- FreeSWITCH sofia profile: enable presence -->
<param name="manage-presence" value="true"/>
<param name="presence-hosts" value="${domain}"/>
<param name="presence-privacy" value="false"/>

<!-- OpenSIPS handles SUBSCRIBE, queries FS for state -->
<param name="send-presence-on-register" value="true"/>
```

### 26.9 Cautions for OpenSIPS Integration

| Risk | Mitigation |
|------|-----------|
| SIP loop (FS sends back to OpenSIPS) | Use separate profiles/ports; set `Max-Forwards` limit |
| Auth bypass on FS internal profile | Strict ACL — only allow OpenSIPS IPs |
| Route header stripping | Use `Record-Route` carefully; test with `sip_trace` |
| OPTIONS ping flood | Set `ds_ping_interval` ≥ 10s; use `ds_probing_mode=1` |
| Split-brain call state | Use shared Redis for dialog state |
| TLS mismatch | Ensure both sides use same TLS version and cipher suite |

---

## 27. Redis Integration

### 27.1 mod_redis vs mod_hiredis

FreeSWITCH ships two Redis modules:

| Module | Library | Use Case |
|--------|---------|---------|
| `mod_redis` | `credis` (bundled) | Legacy; limit/rate-limiting backend |
| `mod_hiredis` | `libhiredis` | Modern; full Redis command support |

`mod_hiredis` is preferred for new integrations. [1](#2-0) 

### 27.2 mod_hiredis Configuration

```xml
<!-- conf/autoload_configs/hiredis.conf.xml -->
<configuration name="hiredis.conf" description="Redis Client">
  <profiles>
    <profile name="default">
      <param name="host" value="127.0.0.1"/>
      <param name="port" value="6379"/>
      <param name="timeout" value="500"/>       <!-- ms -->
      <param name="password" value="your_redis_auth_password"/>
      <param name="max-connections" value="10"/>
      <param name="ignore-connect-fail" value="false"/>
    </profile>
    <!-- Sentinel / cluster profile -->
    <profile name="sentinel">
      <param name="host" value="sentinel1:26379,sentinel2:26379"/>
      <param name="master-name" value="mymaster"/>
      <param name="timeout" value="1000"/>
      <param name="password" value="your_redis_auth_password"/>
    </profile>
  </profiles>
</configuration>
```

### 27.3 mod_hiredis Dialplan Usage

```xml
<!-- Store a value -->
<action application="hiredis_raw" data="default SET call:${uuid} ${caller_id_number}"/>
<action application="hiredis_raw" data="default EXPIRE call:${uuid} 3600"/>

<!-- Get a value into a channel variable -->
<action application="set" data="tenant=${hiredis(default GET tenant:${sip_from_host})}"/>

<!-- Increment a counter -->
<action application="set" data="call_count=${hiredis(default INCR calls:${caller_id_number})}"/>

<!-- Check rate limit -->
<condition field="${hiredis(default GET ratelimit:${caller_id_number})}" expression="^([5-9]\d|[1-9]\d{2,})$">
  <action application="hangup" data="CALL_REJECTED"/>
</condition>
```

### 27.4 External Redis Integration (Go/Python Service)

For complex Redis operations, use an external service that communicates with FreeSWITCH via ESL:

```go
// Go service: Redis-backed call state manager
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "time"

    "github.com/redis/go-redis/v9"
    "github.com/0x19/goesl"  // Go ESL library
)

type CallState struct {
    UUID        string    `json:"uuid"`
    CallerID    string    `json:"caller_id"`
    Destination string    `json:"destination"`
    State       string    `json:"state"`
    StartTime   time.Time `json:"start_time"`
    TenantID    string    `json:"tenant_id"`
}

type CallManager struct {
    rdb *redis.Client
    esl *goesl.Client
}

func (cm *CallManager) OnChannelCreate(uuid, callerID, dest, tenantID string) error {
    ctx := context.Background()

    state := CallState{
        UUID:        uuid,
        CallerID:    callerID,
        Destination: dest,
        State:       "created",
        StartTime:   time.Now(),
        TenantID:    tenantID,
    }

    data, _ := json.Marshal(state)

    pipe := cm.rdb.Pipeline()
    // Store call state with TTL
    pipe.Set(ctx, fmt.Sprintf("call:%s", uuid), data, 4*time.Hour)
    // Add to tenant's active calls set
    pipe.SAdd(ctx, fmt.Sprintf("tenant:%s:calls", tenantID), uuid)
    // Increment tenant call counter
    pipe.Incr(ctx, fmt.Sprintf("tenant:%s:call_count", tenantID))
    _, err := pipe.Exec(ctx)
    return err
}

func (cm *CallManager) OnChannelHangup(uuid string) error {
    ctx := context.Background()

    // Get state before deleting
    data, err := cm.rdb.Get(ctx, fmt.Sprintf("call:%s", uuid)).Bytes()
    if err != nil {
        return err
    }

    var state CallState
    json.Unmarshal(data, &state)

    pipe := cm.rdb.Pipeline()
    pipe.Del(ctx, fmt.Sprintf("call:%s", uuid))
    pipe.SRem(ctx, fmt.Sprintf("tenant:%s:calls", state.TenantID), uuid)
    pipe.Decr(ctx, fmt.Sprintf("tenant:%s:call_count", state.TenantID))
    _, err = pipe.Exec(ctx)
    return err
}
```

### 27.5 Redis Key Naming Conventions for FreeSWITCH SaaS

```
# Call state
call:{uuid}                          → JSON CallState, TTL=4h
call:{uuid}:recording                → recording file path
call:{uuid}:transcript               → ASR transcript

# Tenant/account
tenant:{tenant_id}:calls             → SET of active UUIDs
tenant:{tenant_id}:call_count        → INT active call count
tenant:{tenant_id}:max_calls         → INT concurrent call limit
tenant:{tenant_id}:balance           → FLOAT credit balance (cents)
tenant:{tenant_id}:config            → JSON tenant config

# Rate limiting
ratelimit:calls:{caller_number}      → INT, TTL=60s (calls per minute)
ratelimit:api:{tenant_id}            → INT, TTL=1s (API requests per second)

# Registration cache
reg:{user}@{domain}                  → JSON registration data, TTL=3600s

# Routing cache
route:{destination}                  → JSON routing decision, TTL=300s

# Session tokens (for Next.js frontend)
session:{token}                      → JSON user session, TTL=86400s

# Pub/Sub channels
fs:events:{tenant_id}                → FreeSWITCH events for tenant
fs:calls:{tenant_id}                 → Real-time call updates
```

### 27.6 Redis Pub/Sub for Real-Time Frontend Updates

```go
// Go service: bridge FreeSWITCH ESL events to Redis Pub/Sub
func (cm *CallManager) BridgeEventsToRedis(eslConn *goesl.Client, rdb *redis.Client) {
    ctx := context.Background()

    for msg := range eslConn.Events {
        eventName := msg.GetHeader("Event-Name")
        uuid := msg.GetHeader("Unique-ID")
        tenantID := msg.GetHeader("variable_tenant_id")

        if tenantID == "" {
            continue
        }

        payload := map[string]string{
            "event":   eventName,
            "uuid":    uuid,
            "state":   msg.GetHeader("Channel-State"),
            "caller":  msg.GetHeader("Caller-Caller-ID-Number"),
            "dest":    msg.GetHeader("Caller-Destination-Number"),
        }

        data, _ := json.Marshal(payload)

        // Publish to tenant-specific channel
        rdb.Publish(ctx,
            fmt.Sprintf("fs:events:%s", tenantID),
            string(data))
    }
}
```

### 27.7 Redis Security Cautions

| Risk | Mitigation |
|------|-----------|
| Unauthenticated Redis | Always set `requirepass` in `redis.conf` |
| Redis exposed to internet | Bind to `127.0.0.1` or private network only |
| No TLS | Use Redis 6+ TLS or stunnel for cross-host connections |
| Key collision between tenants | Always prefix keys with `tenant:{id}:` |
| Unbounded key growth | Set TTL on ALL call-related keys |
| Lua injection via EVAL | Validate all inputs before passing to Redis EVAL |
| Sensitive data in Redis | Encrypt PII fields; use Redis ACLs to restrict key access |

```
# redis.conf hardening
bind 127.0.0.1 10.0.0.10
requirepass STRONG_RANDOM_PASSWORD_HERE
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command CONFIG ""
rename-command DEBUG ""
maxmemory 2gb
maxmemory-policy allkeys-lru
```

---

## 28. Golang Integration

### 28.1 Go ESL Libraries

Two main Go ESL libraries exist (neither is in the FreeSWITCH repo — use as external dependencies):

| Library | Import Path | Notes |
|---------|------------|-------|
| `goesl` | `github.com/0x19/goesl` | Inbound + outbound, widely used |
| `eventsocket` | `github.com/fiorix/go-eventsocket/eventsocket` | Clean API, good for inbound |

### 28.2 Go Inbound ESL Client

```go
package fsclient

import (
    "context"
    "fmt"
    "log"
    "net"
    "bufio"
    "strings"
    "strconv"
    "io"
)

// Minimal ESL client in pure Go (no external deps)
type ESLClient struct {
    conn   net.Conn
    reader *bufio.Reader
}

func Connect(host string, port int, password string) (*ESLClient, error) {
    conn, err := net.Dial("tcp", fmt.Sprintf("%s:%d", host, port))
    if err != nil {
        return nil, fmt.Errorf("ESL connect: %w", err)
    }

    c := &ESLClient{conn: conn, reader: bufio.NewReader(conn)}

    // Read auth/request
    if _, err := c.readEvent(); err != nil {
        conn.Close()
        return nil, fmt.Errorf("ESL auth request: %w", err)
    }

    // Send auth
    fmt.Fprintf(conn, "auth %s\n\n", password)

    // Read reply
    reply, err := c.readEvent()
    if err != nil || !strings.Contains(reply["Reply-Text"], "+OK") {
        conn.Close()
        return nil, fmt.Errorf("ESL auth failed: %v", reply)
    }

    return c, nil
}

func (c *ESLClient) Subscribe(events ...string) error {
    cmd := "event plain " + strings.Join(events, " ") + "\n\n"
    _, err := fmt.Fprint(c.conn, cmd)
    if err != nil {
        return err
    }
    _, err = c.readEvent() // consume reply
    return err
}

func (c *ESLClient) API(cmd string) (string, error) {
    fmt.Fprintf(c.conn, "api %s\n\n", cmd)
    event, err := c.readEvent()
    if err != nil {
        return "", err
    }
    return event["_body"], nil
}

func (c *ESLClient) BGApi(cmd string) (string, error) {
    fmt.Fprintf(c.conn, "bgapi %s\n\n", cmd)
    event, err := c.readEvent()
    if err != nil {
        return "", err
    }
    return event["Job-UUID"], nil
}

func (c *ESLClient) Filter(header, value string) error {
    fmt.Fprintf(c.conn, "filter %s %s\n\n", header, value)
    _, err := c.readEvent()
    return err
}

func (c *ESLClient) ReadEvent() (map[string]string, error) {
    return c.readEvent()
}

func (c *ESLClient) readEvent() (map[string]string, error) {
    headers := make(map[string]string)

    for {
        line, err := c.reader.ReadString('\n')
        if err != nil {
            return nil, err
        }
        line = strings.TrimRight(line, "\r\n")
        if line == "" {
            break
        }
        parts := strings.SplitN(line, ": ", 2)
        if len(parts) == 2 {
            headers[parts[0]] = parts[1]
        }
    }

    if cl, ok := headers["Content-Length"]; ok {
        length, _ := strconv.Atoi(cl)
        body := make([]byte, length)
        if _, err := io.ReadFull(c.reader, body); err != nil {
            return nil, err
        }
        headers["_body"] = string(body)
    }

    return headers, nil
}

func (c *ESLClient) Close() {
    c.conn.Close()
}
```

### 28.3 Go Event Loop with Context Cancellation

```go
package main

import (
    "context"
    "log"
    "os/signal"
    "syscall"
)

type FSEventHandler struct {
    client   *ESLClient
    handlers map[string]func(map[string]string)
}

func (h *FSEventHandler) On(event string, fn func(map[string]string)) {
    h.handlers[event] = fn
}

func (h *FSEventHandler) Run(ctx context.Context) error {
    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        default:
        }

        event, err := h.client.ReadEvent()
        if err != nil {
            return fmt.Errorf("read event: %w", err)
        }

        eventName := event["Event-Name"]
        if fn, ok := h.handlers[eventName]; ok {
            // Run handler in goroutine — never block the event loop
            go fn(event)
        }
    }
}

func main() {
    ctx, stop := signal.NotifyContext(context.Background(),
        syscall.SIGINT, syscall.SIGTERM)
    defer stop()

    client, err := Connect("127.0.0.1", 8021, "ClueCon")
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    client.Subscribe("CHANNEL_CREATE", "CHANNEL_HANGUP", "DTMF", "BACKGROUND_JOB")

    handler := &FSEventHandler{
        client:   client,
        handlers: make(map[string]func(map[string]string)),
    }

    handler.On("CHANNEL_CREATE", func(e map[string]string) {
        log.Printf("New call: %s → %s (UUID: %s)",
            e["Caller-Caller-ID-Number"],
            e["Caller-Destination-Number"],
            e["Unique-ID"])
    })

    handler.On("CHANNEL_HANGUP", func(e map[string]string) {
        log.Printf("Hangup: %s cause=%s",
            e["Unique-ID"], e["Hangup-Cause"])
    })

    if err := handler.Run(ctx); err != nil && err != context.Canceled {
        log.Fatal(err)
    }
}
```

### 28.4 Go HTTP API Gateway for FreeSWITCH

```go
package main

import (
    "encoding/json"
    "net/http"
    "regexp"

    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
)

type CallAPI struct {
    fs  *ESLClient
    rdb *redis.Client
}

var uuidRegex = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func (api *CallAPI) Router() http.Handler {
    r := chi.NewRouter()
    r.Use(middleware.Logger)
    r.Use(middleware.Recoverer)
    r.Use(middleware.RequestID)
    r.Use(api.AuthMiddleware)

    r.Post("/calls/originate", api.Originate)
    r.Delete("/calls/{uuid}", api.Hangup)
    r.Post("/calls/{uuid}/transfer", api.Transfer)
    r.Post("/calls/{uuid}/bridge", api.Bridge)
    r.Get("/calls", api.ListCalls)
    r.Get("/calls/{uuid}", api.GetCall)

    return r
}

func (api *CallAPI) Originate(w http.ResponseWriter, r *http.Request) {
    var req struct {
        From        string `json:"from"`
        To          string `json:"to"`
        TenantID    string `json:"tenant_id"`
        CallbackURL string `json:"callback_url"`
    }

    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request", http.StatusBadRequest)
        return
    }

    // Validate inputs — NEVER pass raw user input to ESL
    if !isValidE164(req.To) || !isValidE164(req.From) {
        http.Error(w, "invalid phone number", http.StatusBadRequest)
        return
    }

    // Check tenant concurrent call limit via Redis
    ctx := r.Context()
    count, _ := api.rdb.Get(ctx,
        fmt.Sprintf("tenant:%s:call_count", req.TenantID)).Int()
    maxCalls, _ := api.rdb.Get(ctx,
        fmt.Sprintf("tenant:%s:max_calls", req.TenantID)).Int()

    if count >= maxCalls {
        http.Error(w, "concurrent call limit reached", http.StatusTooManyRequests)
        return
    }

    // Build safe dial string
    dialStr := fmt.Sprintf(
        "{origination_caller_id_number=%s,variable_tenant_id=%s}"+
        "sofia/gateway/mygw/%s &park()",
        sanitizeCallerID(req.From),
        sanitizeTenantID(req.TenantID),
        sanitizeE164(req.To),
    )

    jobUUID, err := api.fs.BGApi("originate " + dialStr)
    if err != nil {
        http.Error(w, "originate failed", http.StatusInternalServerError)
        return
    }

    json.NewEncoder(w).Encode(map[string]string{"job_uuid": jobUUID})
}

func (api *CallAPI) Hangup(w http.ResponseWriter, r *http.Request) {
    uuid := chi.URLParam(r, "uuid")

    // CRITICAL: validate UUID format before passing to ESL
    if !uuidRegex.MatchString(uuid) {
        http.Error(w, "invalid uuid", http.StatusBadRequest)
        return
    }

    result, err := api.fs.API(fmt.Sprintf("uuid_kill %s", uuid))
    if err != nil || !strings.HasPrefix(result, "+OK") {
        http.Error(w, "hangup failed", http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusNoContent)
}

func (api *CallAPI) AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        token := r.Header.Get("Authorization")
        if !strings.HasPrefix(token, "Bearer ") {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }

        // Validate JWT token
        claims, err := validateJWT(strings.TrimPrefix(token, "Bearer "))
        if err != nil {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }

        ctx := context.WithValue(r.Context(), "claims", claims)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

### 28.5 Go Reconnection Pattern

ESL connections drop. Always implement reconnection:

```go
func ConnectWithRetry(ctx context.Context, host string, port int, pass string) (*ESLClient, error) {
    backoff := time.Second

    for {
        select {
        case <-ctx.Done():
            return nil, ctx.Err()
        default:
        }

        client, err := Connect(host, port, pass)
        if err == nil {
            return client, nil
        }

        log.Printf("ESL connect failed: %v, retrying in %v", err, backoff)
        select {
        case <-ctx.Done():
            return nil, ctx.Err()
        case <-time.After(backoff):
        }

        if backoff < 30*time.Second {
            backoff *= 2
        }
    }
}
```

### 28.6 Go Cautions for FreeSWITCH Integration

| Risk | Mitigation |
|------|-----------|
| ESL injection via user input | Validate ALL inputs; use regex allowlists for phone numbers and UUIDs |
| Goroutine leak on ESL disconnect | Use `context.Context` cancellation; always `defer client.Close()` |
| Race on shared ESL connection | Use a single goroutine for reads; use mutex for writes |
| Blocking event loop | Always `go fn(event)` for handlers; never block the read loop |
| Missing reconnect logic | Implement exponential backoff reconnection |
| Unbounded goroutine spawning | Use `semaphore` or worker pool for event handlers |

---

## 29. SaaS Software Structure

### 29.1 Multi-Tenant Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Load Balancer / CDN                       │
│                    (Cloudflare / AWS ALB / nginx)                │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐
│  Next.js App   │  │  Go API        │  │  WebSocket Gateway     │
│  (Frontend)    │  │  (REST/gRPC)   │  │  (Real-time events)    │
│  Port 3000     │  │  Port 8080     │  │  Port 8082             │
└────────────────┘  └───────┬────────┘  └──────────┬─────────────┘
                            │                       │
              ┌─────────────┼───────────────────────┤
              │             │                       │
              ▼             ▼                       ▼
     ┌──────────────┐ ┌──────────────┐  ┌──────────────────────┐
     │  PostgreSQL  │ │    Redis     │  │  FreeSWITCH Cluster  │
     │  (primary    │ │  (cache,     │  │  (ESL port 8021)     │
     │   data)      │ │   pub/sub,   │  │  (SIP port 5080)     │
     └──────────────┘ │   sessions)  │  └──────────────────────┘
                      └──────────────┘
```

### 29.2 Service Decomposition

```
services/
├── api-gateway/          # Go: REST API, auth, rate limiting
│   ├── cmd/server/
│   ├── internal/
│   │   ├── auth/         # JWT validation, tenant resolution
│   │   ├── calls/        # Call CRUD, originate, hangup
│   │   ├── tenants/      # Tenant management
│   │   └── billing/      # Usage tracking, balance
│   └── pkg/
│       ├── fsclient/     # ESL client wrapper
│       └── redisclient/  # Redis wrapper
│
├── event-bridge/         # Go: ESL → Redis Pub/Sub bridge
│   ├── cmd/bridge/
│   └── internal/
│       ├── eslhandler/   # ESL event processing
│       └── publisher/    # Redis publisher
│
├── ws-gateway/           # Go: WebSocket server for frontend
│   ├── cmd/ws/
│   └── internal/
│       ├── hub/          # WebSocket connection hub
│       └── subscriber/   # Redis subscriber
│
├── dialplan-service/     # Go: Dynamic XML dialplan via mod_xml_curl
│   └── internal/
│       ├── routing/      # Routing logic
│       └── xmlbuilder/   # XML response builder
│
├── recording-service/    # Go: Recording management, S3 upload
│
└── frontend/             # Next.js: Dashboard, call control UI
```

### 29.3 Tenant Isolation Strategy

```go
// Every API request must resolve to a tenant
type TenantContext struct {
    TenantID   string
    AccountID  string
    Plan       string
    MaxCalls   int
    Features   []string
}

// Middleware: resolve tenant from JWT or API key
func TenantMiddleware(rdb *redis.Client) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            tenantID := extractTenantFromToken(r)
            if tenantID == "" {
                http.Error(w, "tenant not found", http.StatusUnauthorized)
                return
            }

            // Load tenant config from Redis (cached from PostgreSQL)
            ctx := r.Context()
            data, err := rdb.Get(ctx,
                fmt.Sprintf("tenant:%s:config", tenantID)).Bytes()
            if err != nil {
                // Fallback to PostgreSQL
                // ...
            }

            var tenant TenantContext
            json.Unmarshal(data, &tenant)

            ctx = context.WithValue(ctx, "tenant", tenant)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

### 29.4 Dynamic Dialplan via mod_xml_curl

```go
// Go HTTP handler for mod_xml_curl dialplan requests
func (s *DialplanService) HandleDialplan(w http.ResponseWriter, r *http.Request) {
    r.ParseForm()

    section := r.FormValue("section")
    if section != "dialplan" {
        w.Write([]byte(`<?xml version="1.0"?><document type="freeswitch/xml"><section name="result"><result status="not found"/></section></document>`))
        return
    }

    dest := r.FormValue("Caller-Destination-Number")
    domain := r.FormValue("domain")
    callerID := r.FormValue("Caller-Caller-ID-Number")

    // Resolve tenant from domain
    tenantID := s.resolveTenant(domain)

    // Get routing decision
    route := s.router.Route(tenantID, dest, callerID)

    // Build XML response
    xml := s.buildDialplanXML(route)
    w.Header().Set("Content-Type", "text/xml")
    w.Write([]byte(xml))
}

func (s *DialplanService) buildDialplanXML(route *Route) string {
    // CRITICAL: escape all values before inserting into XML
    dest := xmlEscape(route.Destination)
    context := xmlEscape(route.Context)

    return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<document type="freeswitch/xml">
  <section name="dialplan">
    <context name="%s">
      <extension name="dynamic_route">
        <condition field="destination_number" expression="^%s$">
          <action application="bridge" data="%s"/>
        </condition>
      </extension>
    </context>
  </section>
</document>`, context, dest, xmlEscape(route.BridgeString))
}
```

### 29.5 CDR Processing Pipeline

```
FreeSWITCH (mod_json_cdr)
    │ HTTP POST JSON CDR
    ▼
CDR Receiver (Go HTTP endpoint)
    │
    ├── Validate CDR structure
    ├── Enrich with tenant data (Redis lookup)
    ├── Calculate billing (duration × rate)
    ├── Write to PostgreSQL (cdr table)
    ├── Update Redis balance (DECRBY)
    └── Publish to Redis (cdr:completed:{tenant_id})
         │
         ▼
    Billing Service (subscribes to Redis)
         │
         ├── Check low balance → send alert
         └── Generate invoice (monthly batch)
```

```xml
<!-- mod_json_cdr config -->
<configuration name="json_cdr.conf" description="JSON CDR">
  <settings>
    <param name="url" value="http://cdr-service:8083/cdr"/>
    <param name="retries" value="3"/>
    <param name="delay" value="5000"/>
    <param name="log-b-leg" value="false"/>
    <param name="encode-values" value="true"/>
    <param name="auth-scheme" value="basic"/>
    <param name="auth-params" value="cdr_user:STRONG_PASSWORD"/>
  </settings>
</configuration>
```

### 29.6 SaaS Security Cautions

| Risk | Mitigation |
|------|-----------|
| Tenant data leakage | Always scope DB queries with `tenant_id`; use Row-Level Security in PostgreSQL |
| ESL command injection | Validate ALL inputs; never interpolate raw user data into ESL commands |
| Unlimited call origination | Enforce `max_calls` limit via Redis before every originate |
| CDR tampering | Sign CDRs with HMAC; store raw CDR in append-only storage |
| Billing bypass | Double-check balance in both API and dialplan (defense in depth) |
| Cross-tenant UUID access | Verify UUID belongs to requesting tenant before any operation |

---

## 30. Next.js Frontend Integration

### 30.1 Architecture: Next.js + WebSocket + REST

```
Next.js App (App Router)
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── layout.tsx
│   ├── dashboard/
│   │   ├── calls/
│   │   │   ├── page.tsx          # Active calls list
│   │   │   └── [uuid]/page.tsx   # Call detail
│   │   ├── analytics/page.tsx
│   │   └── layout.tsx
│   └── api/
│       ├── calls/route.ts        # Proxy to Go API
│       ├── calls/[uuid]/route.ts
│       └── auth/[...nextauth]/route.ts
├── components/
│   ├── calls/
│   │   ├── CallList.tsx          # Real-time call list
│   │   ├── CallCard.tsx
│   │   └── CallControls.tsx      # Hangup, transfer, hold
│   └── ui/
└── lib/
    ├── api.ts                    # API client
    ├── websocket.ts              # WebSocket client
    └── auth.ts                   # Auth helpers
```

### 30.2 Real-Time Call Updates via WebSocket

```typescript
// lib/websocket.ts
import { useEffect, useRef, useCallback } from 'react';

export type FSEvent = {
  event: string;
  uuid: string;
  state: string;
  caller: string;
  dest: string;
  tenant_id: string;
};

export function useFreeSWITCHEvents(
  tenantId: string,
  onEvent: (event: FSEvent) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    // Use secure WebSocket in production
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL!;
    const token = getAuthToken(); // from cookie/localStorage

    const ws = new WebSocket(`${wsUrl}?token=${token}&tenant=${tenantId}`);

    ws.onopen = () => {
      console.log('FreeSWITCH WS connected');
      clearTimeout(reconnectTimer.current);
    };

    ws.onmessage = (msg) => {
      try {
        const event: FSEvent = JSON.parse(msg.data);
        onEvent(event);
      } catch (e) {
        console.error('Invalid WS message', e);
      }
    };

    ws.onclose = (e) => {
      console.log('WS closed, reconnecting...', e.code);
      // Exponential backoff reconnect
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = (e) => {
      console.error('WS error', e);
      ws.close();
    };

    wsRef.current = ws;
  }, [tenantId, onEvent]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
```

### 30.3 Active Calls Component

```typescript
// components/calls/CallList.tsx
'use client';

import { useState, useCallback } from 'react';
import { useFreeSWITCHEvents, FSEvent } from '@/lib/websocket';
import { hangupCall, transferCall } from '@/lib/api';

type Call = {
  uuid: string;
  caller: string;
  dest: string;
  state: string;
  duration: number;
  startTime: Date;
};

export function CallList({ tenantId }: { tenantId: string }) {
  const [calls, setCalls] = useState<Map<string, Call>>(new Map());

  const handleEvent = useCallback((event: FSEvent) => {
    setCalls(prev => {
      const next = new Map(prev);

      switch (event.event) {
        case 'CHANNEL_CREATE':
          next.set(event.uuid, {
            uuid: event.uuid,
            caller: event.caller,
            dest: event.dest,
            state: event.state,
            duration: 0,
            startTime: new Date(),
          });
          break;

        case 'CHANNEL_STATE':
          if (next.has(event.uuid)) {
            next.set(event.uuid, {
              ...next.get(event.uuid)!,
              state: event.state,
            });
          }
          break;

        case 'CHANNEL_HANGUP':
          next.delete(event.uuid);
          break;
      }

      return next;
    });
  }, []);

  useFreeSWITCHEvents(tenantId, handleEvent);

  return (
    <div className="call-list">
      {Array.from(calls.values()).map(call => (
        <CallCard
          key={call.uuid}
          call={call}
          onHangup={() => hangupCall(call.uuid)}
          onTransfer={(dest) => transferCall(call.uuid, dest)}
        />
      ))}
    </div>
  );
}
```

### 30.4 Next.js API Route (Proxy to Go API)

```typescript
// app/api/calls/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const API_BASE = process.env.API_BASE_URL!; // internal Go API URL

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}/calls`, {
    headers: {
      'Authorization': `Bearer ${session.accessToken}`,
      'X-Tenant-ID': session.user.tenantId,
    },
    // Don't cache active calls
    cache: 'no-store',
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch calls' },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  // Validate on the frontend side too
  if (!isValidE164(body.to) || !isValidE164(body.from)) {
    return NextResponse.json(
      { error: 'Invalid phone number format' },
      { status: 400 }
    );
  }

  const res = await fetch(`${API_BASE}/calls/originate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({
      ...body,
      tenant_id: session.user.tenantId, // Always use server-side tenant ID
    }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

function isValidE164(number: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(number);
}
```

### 30.5 Environment Variables

```bash
# .env.local (Next.js — NEVER commit to git)
NEXTAUTH_SECRET=STRONG_RANDOM_SECRET_32_CHARS_MIN
NEXTAUTH_URL=https://app.yourdomain.com

# Internal API (server-side only — no NEXT_PUBLIC_ prefix)
API_BASE_URL=http://api-service:8080

# Public WebSocket URL (client-side)
NEXT_PUBLIC_WS_URL=wss://ws.yourdomain.com

# OAuth providers
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### 30.6 Next.js Security Cautions

| Risk | Mitigation |
|------|-----------|
| Exposing internal API URL | Use `API_BASE_URL` (no `NEXT_PUBLIC_`) for server-side calls |
| CSRF on API routes | Use `next-auth` CSRF protection; validate `Origin` header |
| XSS via call data | Sanitize all caller ID / destination data before rendering |
| JWT stored in localStorage | Use `httpOnly` cookies via `next-auth`; never localStorage |
| WebSocket token exposure | Use short-lived tokens (TTL ≤ 60s) for WS auth |
| Tenant ID from client | NEVER trust `tenant_id` from client; always derive from server-side session |
| Unvalidated phone numbers | Validate E.164 format on both client and server |
| Open redirects | Validate `callbackUrl` against allowlist in `next-auth` config |

```typescript
// next-auth config with security hardening
// lib/auth.ts
import { NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.tenantId = user.tenantId;
        token.accessToken = user.accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.tenantId = token.tenantId as string;
      session.accessToken = token.accessToken as string;
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Prevent open redirect
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
};
```

---

## 31. Comprehensive Security Guidelines

### 31.1 Defense-in-Depth Model

```
Layer 1: Network
  ├── Firewall: block 8021, 5060 from public internet
  ├── VPC/private network for FS ↔ OpenSIPS ↔ Redis ↔ Go API
  └── TLS everywhere (SIP TLS, Redis TLS, HTTPS, WSS)

Layer 2: Authentication
  ├── ESL: strong password + ACL (never default "ClueCon")
  ├── SIP: digest auth + ACL for trusted peers
  ├── Redis: requirepass + ACL users
  ├── API: JWT with short expiry (1h access, 8h session)
  └── Frontend: httpOnly cookies, CSRF protection

Layer 3: Authorization
  ├── Tenant isolation: every query scoped by tenant_id
  ├── UUID ownership: verify UUID belongs to tenant before action
  ├── Feature flags: check plan before allowing premium features
  └── Rate limiting: per-tenant, per-IP, per-endpoint

Layer 4: Input Validation
  ├── Phone numbers: E.164 regex allowlist
  ├── UUIDs: strict UUID v4 format check
  ├── ESL commands: no raw user input in ESL strings
  ├── XML: escape all values in dynamic XML
  └── SQL: parameterized queries only

Layer 5: Monitoring
  ├── Log all ESL commands with tenant context
  ├── Alert on: auth failures, rate limit hits, unusual call volumes
  ├── CDR integrity: HMAC-sign all CDRs
  └── Audit log: all call control actions (originate, hangup, transfer)
```

### 31.2 ESL Command Injection Prevention

**The most critical security issue in FreeSWITCH integrations:**

```go
// WRONG — never do this
func badOriginate(userInput string) {
    cmd := "originate sofia/internal/" + userInput + " &echo()"
    eslClient.API(cmd)
    // userInput could be: "1000@domain &system(rm -rf /)"
}

// CORRECT — validate and sanitize
var e164Regex = regexp.MustCompile(`^\+?[1-9]\d{1,14}$`)
var domainRegex = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9\-\.]{0,253}[a-zA-Z0-9]$`)

func safeOriginate(number, domain string) error {
    if !e164Regex.MatchString(number) {
        return fmt.Errorf("invalid number: %q", number)
    }
    if !domainRegex.MatchString(domain) {
        return fmt.Errorf("invalid domain: %q", domain)
    }

    // Safe to use — validated inputs only
    cmd := fmt.Sprintf("originate sofia/internal/%s@%s &echo()", number, domain)
    _, err := eslClient.API(cmd)
    return err
}
```

### 31.3 SIP Fraud Prevention Checklist

```
☐ Change default_password from "1234" in vars.xml
☐ Change ESL password from "ClueCon" in event_socket.conf.xml
☐ Disable REGISTER on external-facing profiles
☐ Set auth-calls=true on all profiles
☐ Apply ACL to all SIP profiles (apply-inbound-acl)
☐ Set max-registrations-per-extension to a reasonable limit
☐ Enable fail2ban or similar for SIP brute-force protection
☐ Use mod_limit to cap concurrent calls per user
☐ Use mod_limit to cap calls per minute per caller
☐ Restrict international dialing via toll_allow variable
☐ Monitor for unusual call volumes (alert on > N calls/minute)
☐ Use SRTP/TLS for all media and signaling
☐ Disable unused SIP methods (NOTIFY, SUBSCRIBE if not needed)
```

### 31.4 Redis Security Checklist

```
☐ Set requirepass in redis.conf
☐ Bind Redis to 127.0.0.1 or private network only
☐ Disable dangerous commands: FLUSHALL, FLUSHDB, CONFIG, DEBUG
☐ Use Redis ACL users (Redis 6+) for least-privilege access
☐ Enable TLS for cross-host Redis connections
☐ Set maxmemory and eviction policy
☐ Set TTL on ALL call-related keys
☐ Prefix all keys with tenant ID
☐ Never store plaintext passwords or PII in Redis
☐ Enable Redis persistence (AOF) for critical data
```

### 31.5 Go API Security Checklist

```
☐ Validate all inputs with strict regex allowlists
☐ Use parameterized queries for all PostgreSQL operations
☐ Implement rate limiting (per-tenant, per-IP)
☐ Set request timeouts (ReadTimeout, WriteTimeout, IdleTimeout)
☐ Use HTTPS only (redirect HTTP → HTTPS)
☐ Set security headers (HSTS, CSP, X-Frame-Options)
☐ Log all API calls with tenant context and request ID
☐ Never log sensitive data (passwords, tokens, full phone numbers)
☐ Use short-lived JWT tokens (access: 1h, refresh: 7d)
☐ Implement token revocation via Redis blacklist
☐ Validate Content-Type on all POST/PUT endpoints
☐ Limit request body size (prevent DoS)
```

```go
// Go HTTP server with security settings
srv := &http.Server{
    Addr:         ":8080",
    Handler:      router,
    ReadTimeout:  10 * time.Second,
    WriteTimeout: 30 * time.Second,
    IdleTimeout:  120 * time.Second,
    // TLS config
    TLSConfig: &tls.Config{
        MinVersion:               tls.VersionTLS12,
        CurvePreferences:         []tls.CurveID{tls.X25519, tls.CurveP256},
        PreferServerCipherSuites: true,
        CipherSuites: []uint16{
            tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
            tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
            tls.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305,
            tls.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305,
        },
    },
}
```

### 31.6 Next.js Security Checklist

```
☐ Use httpOnly, Secure, SameSite=Lax cookies for sessions
☐ Never store tokens in localStorage or sessionStorage
☐ Validate all phone numbers client-side AND server-side
☐ Use Content Security Policy headers
☐ Sanitize all user-generated content before rendering
☐ Use next-auth for authentication (do not roll your own)
☐ Validate callbackUrl against allowlist (prevent open redirect)
☐ Use NEXT_PUBLIC_ prefix ONLY for truly public config
☐ Never expose internal service URLs to the client
☐ Implement CSRF protection on all state-changing API routes
☐ Use rate limiting on login endpoints
☐ Audit all npm dependencies regularly (npm audit)
```

```typescript
// next.config.ts — security headers
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // tighten in prod
      "style-src 'self' 'unsafe-inline'",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_WS_URL}`,
      "img-src 'self' data: blob:",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};
```

### 31.7 Network Topology Checklist

```
☐ FreeSWITCH ESL (8021) — accessible ONLY from Go API service
☐ FreeSWITCH SIP (5080) — accessible ONLY from OpenSIPS
☐ OpenSIPS SIP (5060/5061) — public-facing (with fail2ban)
☐ Redis (6379) — accessible ONLY from Go services
☐ PostgreSQL (5432) — accessible ONLY from Go services
☐ Go API (8080) — accessible ONLY from Next.js (via internal network)
☐ Next.js (3000) — behind reverse proxy (nginx/Cloudflare)
☐ WebSocket Gateway (8082) — behind reverse proxy (WSS)
☐ All cross-service communication on private VPC subnet
☐ No service exposes debug/admin ports to public internet
```

---

## Appendix B: Full Stack Integration Checklist

Before deploying a FreeSWITCH SaaS integration to production:

### FreeSWITCH
- [ ] Changed `default_password` from `1234`
- [ ] Changed ESL password from `ClueCon`
- [ ] ESL bound to `127.0.0.1` or private IP only
- [ ] SIP profiles have ACL configured
- [ ] SRTP enabled for all media
- [ ] SIP TLS enabled for signaling
- [ ] `mod_json_cdr` configured with auth
- [ ] `mod_xml_curl` configured with auth
- [ ] Log level set to `INFO` (not `DEBUG`) in production
- [ ] RTP port range configured and firewalled

### OpenSIPS
- [ ] Dispatcher list configured with all FS nodes
- [ ] OPTIONS ping enabled for health checking
- [ ] fail2ban or pike module enabled
- [ ] TLS profile configured
- [ ] ACL for trusted FS nodes

### Redis
- [ ] `requirepass` set
- [ ] Bound to private network
- [ ] Dangerous commands disabled
- [ ] TTL set on all call-related keys
- [ ] Maxmemory and eviction policy set
- [ ] TLS enabled for cross-host connections

### Go API
- [ ] All inputs validated with regex allowlists
- [ ] UUID format validated before ESL commands
- [ ] Rate limiting implemented
- [ ] JWT expiry set (≤ 1h for access tokens)
- [ ] Request timeouts configured
- [ ] TLS configured with TLS 1.2+ minimum
- [ ] Structured logging with tenant context

### Next.js
- [ ] `NEXTAUTH_SECRET` is a strong random value
- [ ] All cookies are `httpOnly` and `Secure`
- [ ] Security headers configured in `next.config.ts`
- [ ] No sensitive config in `NEXT_PUBLIC_` variables
- [ ] Phone number validation on

### Citations

**File:** debian/control-modules (L113-117)
```text
Module: applications/mod_hiredis
Description: Redis client support
 This module provides a mechanism to use Redis as a datastore.
Build-Depends: libhiredis-dev
Depends: libhiredis0.10 | libhiredis0.13 | libhiredis0.14
```
Here is the new section to append to the SKILL.md:

---

```markdown
---

## 32. SaaS-Level System Design for 1000+ Concurrent Users

### 32.1 Capacity Planning Fundamentals

Before configuring anything, understand the math:

| Resource | Formula | 1000-user example |
|----------|---------|-------------------|
| Sessions | 2 per active call (A-leg + B-leg) | 2000 sessions |
| OS threads | 1 per session + system threads | ~2100 threads |
| RTP ports | 2 per call (RTP + RTCP) | 2000 ports minimum |
| File descriptors | ~10 per session | ~20,000 FDs |
| RAM | ~1–2 MB per session | 2–4 GB for calls alone |
| CPU cores | ~1 core per 100–150 concurrent calls | 8–16 cores |
| Bandwidth | 64–128 kbps per call (G.711/Opus) | 64–128 Mbps NIC |

The default `switch.conf.xml` ships with `max-sessions=1000` and `sessions-per-second=30`. Both must be raised for 1000+ concurrent users. [1](#3-0) 

---

### 32.2 FreeSWITCH Core Configuration for High Scale

```xml
<!-- conf/vanilla/autoload_configs/switch.conf.xml -->
<configuration name="switch.conf" description="Core Configuration">
  <settings>

    <!-- ── Session Limits ─────────────────────────────────────────── -->
    <!-- 1000 users × 2 legs = 2000 sessions; add 20% headroom -->
    <param name="max-sessions" value="2500"/>

    <!-- Calls per second burst capacity; 1000 users / 60s avg call = ~17 CPS;
         set higher to handle burst origination from campaigns -->
    <param name="sessions-per-second" value="100"/>

    <!-- Refuse new calls if CPU idle drops below this % -->
    <param name="min-idle-cpu" value="15"/>

    <!-- Smooth CPU idle measurement over N samples (reduces spikes) -->
    <param name="cpu-idle-smoothing-depth" value="30"/>

    <!-- ── Event Dispatch ─────────────────────────────────────────── -->
    <!-- Enable threaded event dispatch (required for initial-event-threads) -->
    <param name="events-use-dispatch" value="true"/>

    <!-- Number of event dispatch threads; capped at cpu_count/2 by the core -->
    <!-- On a 16-core box this can be up to 8; start at 4 and tune -->
    <param name="initial-event-threads" value="4"/>

    <!-- ── Database ───────────────────────────────────────────────── -->
    <!-- Use PostgreSQL for core tables (NOT SQLite in production) -->
    <param name="core-db-dsn"
           value="pgsql://hostaddr=10.0.0.20 dbname=freeswitch user=freeswitch password=STRONG_PASS options='-c client_min_messages=NOTICE'"/>

    <!-- DB handle pool: max simultaneous open handles -->
    <param name="max-db-handles" value="100"/>
    <param name="db-handle-timeout" value="10"/>

    <!-- Increase SQL write buffer for high call volume -->
    <param name="sql-buffer-len" value="2m"/>
    <param name="max-sql-buffer-len" value="8m"/>

    <!-- ── RTP Ports ──────────────────────────────────────────────── -->
    <!-- 1000 concurrent calls × 2 ports = 2000 ports minimum.
         Range 16384–32768 = 16384 ports = 8192 concurrent calls max.
         Default range is sufficient for 1000 users. -->
    <param name="rtp-start-port" value="16384"/>
    <param name="rtp-end-port" value="32768"/>

    <!-- Check each port before allocating (prevents conflicts) -->
    <param name="rtp-port-usage-robustness" value="true"/>

    <!-- ── HA / Cluster Identity ──────────────────────────────────── -->
    <!-- Override hostname for DB/CURL requests in cluster environments.
         Each node must have a unique switchname. -->
    <param name="switchname" value="fs-node-01"/>

    <!-- ── Timer ─────────────────────────────────────────────────── -->
    <!-- Use timerfd for lower jitter on Linux (recommended for high load) -->
    <param name="enable-softtimer-timerfd" value="true"/>

    <!-- Disable timer CPU affinity to let OS schedule freely -->
    <param name="timer-affinity" value="disabled"/>

    <!-- ── Logging ────────────────────────────────────────────────── -->
    <!-- INFO in production; DEBUG generates too much I/O at scale -->
    <param name="loglevel" value="info"/>

    <!-- Use UUID v7 (time-ordered) for better DB index performance -->
    <param name="uuid-version" value="7"/>

    <!-- Session thread pool: reuse threads instead of creating per session -->
    <param name="session-thread-pool" value="true"/>

  </settings>
</configuration>
```

The `initial-event-threads` value is capped internally at `cpu_count / 2`. [2](#3-1) 

The `sessions-per-second` counter resets every second via the soft timer loop. [3](#3-2) 

Session creation is rejected when `session_count + 1 > session_limit` or `sps <= 0`. [4](#3-3) 

---

### 32.3 OS-Level Tuning (Linux)

These settings must be applied **before** starting FreeSWITCH. Add to `/etc/sysctl.conf` and `/etc/security/limits.conf`:

```bash
# /etc/sysctl.conf — apply with: sysctl -p

# ── Network ──────────────────────────────────────────────────────────
# Increase socket buffer sizes for high RTP throughput
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.core.rmem_default = 16777216
net.core.wmem_default = 16777216
net.ipv4.udp_rmem_min = 8192
net.ipv4.udp_wmem_min = 8192

# Increase connection backlog
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535

# Reduce TIME_WAIT for SIP TCP connections
net.ipv4.tcp_fin_timeout = 10
net.ipv4.tcp_tw_reuse = 1

# Increase local port range (for outbound SIP TCP/TLS)
net.ipv4.ip_local_port_range = 10000 65535

# ── File Descriptors ─────────────────────────────────────────────────
fs.file-max = 1000000

# ── Virtual Memory ───────────────────────────────────────────────────
# Prevent swapping (swap kills real-time audio)
vm.swappiness = 1
vm.dirty_ratio = 10
vm.dirty_background_ratio = 5
```

```bash
# /etc/security/limits.conf — apply after re-login

freeswitch  soft  nofile  100000
freeswitch  hard  nofile  100000
freeswitch  soft  nproc   65535
freeswitch  hard  nproc   65535
freeswitch  soft  stack   240
freeswitch  hard  stack   240
freeswitch  soft  memlock unlimited
freeswitch  hard  memlock unlimited
```

```bash
# /etc/systemd/system/freeswitch.service.d/limits.conf
[Service]
LimitNOFILE=100000
LimitNPROC=65535
LimitMEMLOCK=infinity
# Real-time scheduling for audio threads
LimitRTPRIO=infinity
CPUSchedulingPolicy=rr
CPUSchedulingPriority=1
```

---

### 32.4 SIP Profile Tuning for High Concurrency

```xml
<!-- conf/sip_profiles/internal.xml — high-scale settings -->
<profile name="internal">
  <settings>
    <!-- ── Threading ─────────────────────────────────────────────── -->
    <!-- Sofia-SIP worker threads; increase for high CPS -->
    <!-- Each thread handles SIP message parsing and dispatch -->
    <!-- Rule of thumb: 1 thread per 50 CPS -->
    <!-- Note: this is a Sofia-SIP nua parameter -->

    <!-- ── Codec Negotiation ──────────────────────────────────────── -->
    <!-- Limit codec list to reduce SDP parsing overhead -->
    <param name="codec-prefs" value="OPUS,G722,PCMU,PCMA"/>
    <param name="inbound-codec-negotiation" value="generous"/>
    <param name="outbound-codec-negotiation" value="generous"/>

    <!-- ── Registration ───────────────────────────────────────────── -->
    <!-- Allow multiple registrations per extension (softphone + mobile) -->
    <param name="multiple-registrations" value="contact"/>
    <!-- Limit registrations per extension to prevent abuse -->
    <param name="max-registrations-per-extension" value="5"/>

    <!-- ── Presence (disable if not needed — saves significant CPU) ── -->
    <param name="manage-presence" value="false"/>
    <param name="send-message-query-on-register" value="false"/>
    <param name="send-presence-on-register" value="false"/>

    <!-- ── Timers ─────────────────────────────────────────────────── -->
    <!-- Reduce SIP timer overhead -->
    <param name="nonce-ttl" value="60"/>
    <param name="rtp-timer-name" value="soft"/>

    <!-- ── Media ──────────────────────────────────────────────────── -->
    <!-- Disable ZRTP (not needed if using SRTP/DTLS) -->
    <param name="disable-rtp-auto-adjust" value="false"/>

    <!-- ── Logging ────────────────────────────────────────────────── -->
    <!-- Disable SIP trace in production (massive I/O overhead) -->
    <!-- Enable only for debugging specific issues -->
    <!-- sofia global siptrace on/off via ESL when needed -->

    <!-- ── ACL ───────────────────────────────────────────────────── -->
    <param name="apply-inbound-acl" value="trusted_peers"/>
    <param name="apply-register-acl" value="internal_network"/>

    <!-- ── Auth ──────────────────────────────────────────────────── -->
    <param name="auth-calls" value="true"/>
    <param name="auth-all-packets" value="false"/>
  </settings>
</profile>
```

---

### 32.5 PostgreSQL Schema for Core Tables

Use PostgreSQL (via `mod_pgsql`) instead of SQLite for the core database at scale. The core creates its own tables automatically, but you need to tune PostgreSQL:

```sql
-- postgresql.conf tuning for FreeSWITCH workload
-- (high write throughput, many short transactions)

max_connections = 200           -- FS uses connection pool
shared_buffers = 2GB            -- 25% of RAM
effective_cache_size = 6GB      -- 75% of RAM
work_mem = 16MB
maintenance_work_mem = 256MB
wal_buffers = 64MB
checkpoint_completion_target = 0.9
synchronous_commit = off        -- Safe for call state (not billing)
wal_writer_delay = 200ms
max_wal_size = 2GB

-- For the channels table (high churn)
-- Add index on hostname for multi-node queries
CREATE INDEX CONCURRENTLY idx_channels_hostname
  ON channels(hostname);

CREATE INDEX CONCURRENTLY idx_channels_state
  ON channels(state);

-- For registrations (frequent lookups)
CREATE INDEX CONCURRENTLY idx_registrations_user_host
  ON registrations(sip_user, sip_host);
```

**Important:** Set `synchronous_commit = off` only for the FreeSWITCH database. Call state data (channels, registrations) can tolerate a small window of data loss on crash. Billing/CDR data must use a separate database with `synchronous_commit = on`.

---

### 32.6 Multi-Node Cluster Architecture

A single FreeSWITCH node on modern hardware (32-core, 64 GB RAM) can handle approximately 2000–4000 concurrent calls depending on codec and features. For 1000+ users with headroom, a 3-node cluster is recommended:

```
                    ┌──────────────────────────────────────────────┐
  SIP/WebRTC ───────►  OpenSIPS Cluster (2 nodes, active-active)  │
  Clients           │  Dispatcher: round-robin + health check      │
                    └──────────────┬───────────────────────────────┘
                                   │ SIP (port 5080, internal)
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
     ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
     │  FS Node 01  │   │  FS Node 02  │   │  FS Node 03  │
     │  switchname= │   │  switchname= │   │  switchname= │
     │  fs-node-01  │   │  fs-node-02  │   │  fs-node-03  │
     │  max=2500    │   │  max=2500    │   │  max=2500    │
     └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
            │                  │                  │
            └──────────────────┼──────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
     ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
     │  PostgreSQL  │  │  Redis       │  │  Go API      │
     │  (primary +  │  │  Cluster     │  │  (3 replicas)│
     │   replica)   │  │  (3 nodes)   │  │              │
     └──────────────┘  └──────────────┘  └──────────────┘
```

Each FS node uses the same `core-db-dsn` pointing to PostgreSQL. The `switchname` parameter ensures each node's channels are distinguishable in the shared `channels` table. [5](#3-4) 

---

### 32.7 Call Recovery Across Nodes

FreeSWITCH has built-in call recovery (`SCSC_RECOVER`). When a node restarts, it can recover calls from the database:

```bash
# After node restart, recover calls from DB
fsctl recover

# Or via ESL
api fsctl recover
```

For this to work across nodes, all nodes must share the same PostgreSQL database. The `recovery` table stores call state that survives restarts.

Enable recovery in the dialplan:
```xml
<!-- Enable call recovery for bridged calls -->
<action application="set" data="enable_recovery=true"/>
```

---

### 32.8 Go API: Connection Pool for ESL at Scale

At 1000+ users, a single ESL connection becomes a bottleneck. Use a pool:

```go
package eslpool

import (
    "context"
    "fmt"
    "sync"
    "time"
)

type ESLPool struct {
    mu       sync.Mutex
    conns    chan *ESLClient
    host     string
    port     int
    password string
    size     int
}

func NewESLPool(host string, port int, password string, size int) (*ESLPool, error) {
    pool := &ESLPool{
        conns:    make(chan *ESLClient, size),
        host:     host,
        port:     port,
        password: password,
        size:     size,
    }

    for i := 0; i < size; i++ {
        conn, err := Connect(host, port, password)
        if err != nil {
            return nil, fmt.Errorf("pool init failed at conn %d: %w", i, err)
        }
        pool.conns <- conn
    }

    return pool, nil
}

// Acquire gets a connection from the pool (blocks until available)
func (p *ESLPool) Acquire(ctx context.Context) (*ESLClient, error) {
    select {
    case conn := <-p.conns:
        // Health check: try a no-op
        if _, err := conn.API("status"); err != nil {
            // Reconnect
            conn.Close()
            newConn, err := ConnectWithRetry(ctx, p.host, p.port, p.password)
            if err != nil {
                return nil, err
            }
            return newConn, nil
        }
        return conn, nil
    case <-ctx.Done():
        return nil, ctx.Err()
    case <-time.After(5 * time.Second):
        return nil, fmt.Errorf("ESL pool exhausted: all %d connections in use", p.size)
    }
}

// Release returns a connection to the pool
func (p *ESLPool) Release(conn *ESLClient) {
    select {
    case p.conns <- conn:
    default:
        // Pool is full (shouldn't happen), close the extra connection
        conn.Close()
    }
}

// Do executes a function with a pooled connection
func (p *ESLPool) Do(ctx context.Context, fn func(*ESLClient) error) error {
    conn, err := p.Acquire(ctx)
    if err != nil {
        return err
    }
    defer p.Release(conn)
    return fn(conn)
}
```

Usage:
```go
pool, _ := NewESLPool("127.0.0.1", 8021, "ClueCon", 10)

// Thread-safe API call
err := pool.Do(ctx, func(conn *ESLClient) error {
    result, err := conn.API(fmt.Sprintf("uuid_kill %s", uuid))
    if err != nil || !strings.HasPrefix(result, "+OK") {
        return fmt.Errorf("hangup failed: %s", result)
    }
    return nil
})
```

**Important:** ESL API connections (for commands) can be pooled. ESL event connections (for receiving events) must be **dedicated** — one long-lived connection per FS node, not pooled.

---

### 32.9 Dedicated Event Consumer per FS Node

For 1000+ users, the event volume is high. Use one dedicated goroutine per FS node for event consumption, and fan out to Redis:

```go
package eventbridge

import (
    "context"
    "encoding/json"
    "log"

    "github.com/redis/go-redis/v9"
)

type NodeBridge struct {
    nodeID string
    esl    *ESLClient
    rdb    *redis.Client
}

func (b *NodeBridge) Run(ctx context.Context) {
    // Subscribe to only the events we need — NOT "ALL"
    // At 1000 concurrent calls, "ALL" generates ~50,000 events/minute
    b.esl.Subscribe(
        "CHANNEL_CREATE",
        "CHANNEL_ANSWER",
        "CHANNEL_HANGUP",
        "CHANNEL_HANGUP_COMPLETE",
        "CHANNEL_BRIDGE",
        "CHANNEL_UNBRIDGE",
        "DTMF",
        "BACKGROUND_JOB",
        "RECORD_START",
        "RECORD_STOP",
        "HEARTBEAT",
    )

    for {
        select {
        case <-ctx.Done():
            return
        default:
        }

        event, err := b.esl.ReadEvent()
        if err != nil {
            log.Printf("[%s] ESL read error: %v — reconnecting", b.nodeID, err)
            b.reconnect(ctx)
            continue
        }

        // Dispatch to Redis asynchronously — never block the read loop
        go b.publishEvent(ctx, event)
    }
}

func (b *NodeBridge) publishEvent(ctx context.Context, event map[string]string) {
    eventName := event["Event-Name"]
    tenantID := event["variable_tenant_id"]

    if tenantID == "" {
        return // Skip events without tenant context
    }

    payload, _ := json.Marshal(map[string]string{
        "node":    b.nodeID,
        "event":   eventName,
        "uuid":    event["Unique-ID"],
        "caller":  event["Caller-Caller-ID-Number"],
        "dest":    event["Caller-Destination-Number"],
        "state":   event["Channel-State"],
        "cause":   event["Hangup-Cause"],
        "tenant":  tenantID,
    })

    // Publish to tenant-specific channel
    b.rdb.Publish(ctx,
        "fs:events:"+tenantID,
        string(payload))

    // Also publish to global monitoring channel
    b.rdb.Publish(ctx, "fs:events:all:"+b.nodeID, string(payload))
}
```

---

### 32.10 Redis Cluster for High Availability

At 1000+ users, a single Redis node is a SPOF. Use Redis Cluster (3 primary + 3 replica):

```
Redis Cluster (6 nodes):
  Primary 1: 10.0.0.30:6379  → slots 0–5460
  Primary 2: 10.0.0.31:6379  → slots 5461–10922
  Primary 3: 10.0.0.32:6379  → slots 10923–16383
  Replica 1: 10.0.0.33:6379  → replicates Primary 1
  Replica 2: 10.0.0.34:6379  → replicates Primary 2
  Replica 3: 10.0.0.35:6379  → replicates Primary 3
```

Go Redis Cluster client:
```go
rdb := redis.NewClusterClient(&redis.ClusterOptions{
    Addrs: []string{
        "10.0.0.30:6379",
        "10.0.0.31:6379",
        "10.0.0.32:6379",
    },
    Password:     "STRONG_REDIS_PASSWORD",
    PoolSize:     50,
    MinIdleConns: 10,
    DialTimeout:  2 * time.Second,
    ReadTimeout:  1 * time.Second,
    WriteTimeout: 1 * time.Second,
    // Route read-only commands to replicas
    RouteRandomly: true,
})
```

**Key constraint with Redis Cluster:** All keys in a pipeline or transaction must hash to the same slot. Use hash tags `{tenant_id}` to force co-location:

```go
// These keys will be on the same slot (same hash tag)
pipe := rdb.Pipeline()
pipe.Set(ctx, "{tenant_abc}:call:"+uuid, data, 4*time.Hour)
pipe.SAdd(ctx, "{tenant_abc}:calls", uuid)
pipe.Incr(ctx, "{tenant_abc}:call_count")
pipe.Exec(ctx)
```

---

### 32.11 Horizontal Scaling: When to Add a Node

Monitor these metrics via the `HEARTBEAT` event (fires every 20 seconds by default):

```go
func monitorHeartbeat(event map[string]string) {
    sessionCount, _ := strconv.Atoi(event["Session-Count"])
    maxSessions, _ := strconv.Atoi(event["Max-Sessions"])
    spsLast, _ := strconv.Atoi(event["Session-Per-Sec-Last"])
    idleCPU, _ := strconv.ParseFloat(event["Idle-CPU"], 64)

    utilization := float64(sessionCount) / float64(maxSessions) * 100

    // Alert thresholds
    if utilization > 80 {
        alert("FS session utilization > 80%: add a node")
    }
    if idleCPU < 20 {
        alert("FS CPU idle < 20%: add a node or reduce load")
    }
    if spsLast > 80 {
        alert("FS CPS > 80: approaching sessions-per-second limit")
    }

    // Publish to Prometheus/Grafana
    metrics.Set("fs_sessions_active", float64(sessionCount))
    metrics.Set("fs_sessions_utilization_pct", utilization)
    metrics.Set("fs_idle_cpu_pct", idleCPU)
    metrics.Set("fs_cps_last", float64(spsLast))
}
```

The `HEARTBEAT` event carries `Session-Count`, `Max-Sessions`, `Session-Per-Sec`, `Session-Per-Sec-Last`, `Session-Peak-Max`, and `Idle-CPU`. [6](#3-5) 

---

### 32.12 Graceful Node Drain (Zero-Downtime Maintenance)

To take a node out of service without dropping calls:

```python
# Step 1: Tell OpenSIPS to stop sending new calls to this node
# (via OpenSIPS MI or dispatcher weight change)
requests.post("http://opensips:8080/mi/ds_set_state",
              json={"group": 1, "address": "sip:10.0.0.10:5080",
                    "state": "inactive"})

# Step 2: Pause inbound calls on FreeSWITCH
con.api("fsctl pause inbound")

# Step 3: Wait for active sessions to drain
import time
while True:
    e = con.api("status")
    # Parse session count from status output
    # When it reaches 0 (or acceptable minimum), proceed
    if "0 session(s)" in e.getBody():
        break
    time.sleep(10)

# Step 4: Elegant shutdown (waits for all calls to end)
con.api("fsctl shutdown elegant")
```

The `SCSC_PAUSE_INBOUND` and `SCSC_SHUTDOWN_ELEGANT` controls are available via `fsctl`. [7](#3-6) 

---

### 32.13 Rate Limiting at Every Layer

For 1000+ users, rate limiting must be enforced at multiple layers to prevent any single tenant from starving others:

**Layer 1: OpenSIPS (SIP level)**
```
# opensips.cfg — rate limit per source IP
loadmodule "pike.so"
modparam("pike", "sampling_time_unit", 2)
modparam("pike", "reqs_density_per_unit", 30)
modparam("pike", "remove_latency", 4)

route[CHECK_RATE] {
    if (!pike_check_req()) {
        sl_send_reply(503, "Flood Detected");
        exit;
    }
}
```

**Layer 2: FreeSWITCH dialplan (per-tenant)**
```xml
<!-- Limit concurrent calls per tenant using mod_limit -->
<action application="limit"
        data="hash tenant ${variable_tenant_id} ${variable_tenant_max_calls} !CALL_REJECTED"/>

<!-- Rate limit: max 10 new calls per minute per caller -->
<action application="limit"
        data="hash rate ${caller_id_number} 10/60 !NORMAL_TEMPORARY_FAILURE"/>
```

**Layer 3: Go API (per-tenant, per-endpoint)**
```go
// Token bucket rate limiter per tenant
type TenantLimiter struct {
    mu       sync.Mutex
    limiters map[string]*rate.Limiter
}

func (tl *TenantLimiter) Allow(tenantID string, rps float64, burst int) bool {
    tl.mu.Lock()
    limiter, ok := tl.limiters[tenantID]
    if !ok {
        limiter = rate.NewLimiter(rate.Limit(rps), burst)
        tl.limiters[tenantID] = limiter
    }
    tl.mu.Unlock()
    return limiter.Allow()
}

// In API handler
func (api *CallAPI) Originate(w http.ResponseWriter, r *http.Request) {
    tenant := r.Context().Value("tenant").(TenantContext)

    // Check Redis-based concurrent call limit
    count := getCurrentCallCount(tenant.TenantID)
    if count >= tenant.MaxCalls {
        http.Error(w, "concurrent call limit reached", http.StatusTooManyRequests)
        return
    }

    // Check in-process rate limit (CPS)
    if !api.limiter.Allow(tenant.TenantID, 5.0, 10) {
        http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
        return
    }

    // Proceed with originate...
}
```

**Layer 4: Redis (balance check)**
```go
// Atomic balance check and deduct using Redis Lua script
const deductScript = `
local balance = tonumber(redis.call('GET', KEYS[1]))
local cost = tonumber(ARGV[1])
if balance == nil or balance < cost then
    return -1
end
redis.call('INCRBYFLOAT', KEYS[1], -cost)
return 1
`

func checkAndDeductBalance(ctx context.Context, rdb *redis.Client,
    tenantID string, estimatedCost float64) (bool, error) {
    result, err := rdb.Eval(ctx, deductScript,
        []string{"{" + tenantID + "}:balance"},
        estimatedCost).Int()
    if err != nil {
        return false, err
    }
    return result == 1, nil
}
```

---

### 32.14 Observability Stack

At 1000+ users, you need structured observability. The recommended stack:

```
FreeSWITCH HEARTBEAT events
    │
    ▼
Go Event Bridge
    │ Parses events, extracts metrics
    ▼
Prometheus Exporter (port 9090)
    │
    ▼
Grafana Dashboard
    │
    ├── Active sessions per node
    ├── Sessions per second (current / peak)
    ├── CPU idle per node
    ├── Active calls per tenant
    ├── Call success rate (answered / total)
    ├── Average call duration
    ├── RTP packet loss (from RTCP)
    └── ESL connection health
```

```go
// Prometheus metrics for FreeSWITCH
var (
    activeSessions = prometheus.NewGaugeVec(
        prometheus.GaugeOpts{
            Name: "freeswitch_sessions_active",
            Help: "Number of active sessions",
        },
        []string{"node"},
    )
    sessionsPerSec = prometheus.NewGaugeVec(
        prometheus.GaugeOpts{
            Name: "freeswitch_sessions_per_second",
            Help: "Sessions created per second",
        },
        []string{"node"},
    )
    idleCPU = prometheus.NewGaugeVec(
        prometheus.GaugeOpts{
            Name: "freeswitch_idle_cpu_percent",
            Help: "CPU idle percentage",
        },
        []string{"node"},
    )
    callsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "freeswitch_calls_total",
            Help: "Total calls by tenant and outcome",
        },
        []string{"tenant", "outcome", "hangup_cause"},
    )
)

func handleHeartbeat(event map[string]string, nodeID string) {
    sessions, _ := strconv.ParseFloat(event["Session-Count"], 64)
    sps, _ := strconv.ParseFloat(event["Session-Per-Sec-Last"], 64)
    cpu, _ := strconv.ParseFloat(event["Idle-CPU"], 64)

    activeSessions.WithLabelValues(nodeID).Set(sessions)
    sessionsPerSec.WithLabelValues(nodeID).Set(sps)
    idleCPU.WithLabelValues(nodeID).Set(cpu)
}
```

---

### 32.15 CDR Pipeline at Scale

At 1000 concurrent users with average 5-minute calls, you generate ~200 CDRs/minute. The CDR pipeline must be non-blocking:

```xml
<!-- mod_json_cdr: async HTTP POST with retry -->
<configuration name="json_cdr.conf" description="JSON CDR">
  <settings>
    <!-- Post to internal CDR receiver -->
    <param name="url" value="http://cdr-service:8083/cdr"/>
    <!-- Retry on failure -->
    <param name="retries" value="5"/>
    <param name="delay" value="2000"/>
    <!-- Log to file as fallback if HTTP fails -->
    <param name="log-dir" value="/var/log/freeswitch/cdr"/>
    <param name="log-b-leg" value="false"/>
    <!-- Encode special characters -->
    <param name="encode-values" value="true"/>
    <!-- Auth -->
    <param name="auth-scheme" value="basic"/>
    <param name="auth-params" value="cdr_user:STRONG_CDR_PASSWORD"/>
    <!-- Batch mode: collect CDRs and post in batches -->
    <param name="batch-requests" value="true"/>
    <param name="batch-size" value="10"/>
  </settings>
</configuration>
```

Go CDR receiver with async processing:
```go
func (s *CDRService) HandleCDR(w http.ResponseWriter, r *http.Request) {
    // Respond immediately — never make FS wait for CDR processing
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("OK"))

    // Process asynchronously
    body, _ := io.ReadAll(r.Body)
    go s.processCDR(body)
}

func (s *CDRService) processCDR(data []byte) {
    var cdr map[string]interface{}
    if err := json.Unmarshal(data, &cdr); err != nil {
        log.Printf("invalid CDR: %v", err)
        return
    }

    // Extract key fields
    uuid := getString(cdr, "variables.uuid")
    tenantID := getString(cdr, "variables.tenant_id")
    duration := getInt(cdr, "variables.billsec")
    cause := getString(cdr, "variables.hangup_cause")

    // Write to PostgreSQL (CDR table — separate from core DB)
    s.db.Exec(`INSERT INTO cdrs
        (uuid, tenant_id, caller, destination, duration, hangup_cause, raw, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        uuid, tenantID,
        getString(cdr, "variables.caller_id_number"),
        getString(cdr, "variables.destination_number"),
        duration, cause, string(data))

    // Update Redis billing
    if duration > 0 {
        cost := calculateCost(tenantID, duration)
        s.rdb.IncrByFloat(context.Background(),
            "{"+tenantID+"}:balance", -cost)
    }

    // Publish CDR event for real-time billing alerts
    s.rdb.Publish(context.Background(),
        "cdr:completed:"+tenantID,
        fmt.Sprintf(`{"uuid":"%s","duration":%d,"cause":"%s"}`,
            uuid, duration, cause))
}
```

---

### 32.16 High-Scale Cautions and Anti-Patterns

| Anti-Pattern | Why It Fails at Scale | Correct Approach |
|-------------|----------------------|-----------------|
| `event plain ALL` on ESL | Generates millions of events/day; overwhelms the consumer | Subscribe only to needed events |
| SQLite for core DB | File locking serializes all DB writes; collapses above ~200 CPS | Use PostgreSQL via `mod_pgsql` |
| Single ESL connection for API calls | Serializes all commands; creates queue backlog | Use ESL connection pool (10–20 connections) |
| `siptrace on` in production | Logs every SIP packet; fills disk in hours | Enable only for targeted debugging |
| `loglevel debug` in production | Generates gigabytes of logs per hour | Use `info` in production |
| Presence enabled when not needed | `manage-presence=true` adds significant CPU/DB overhead | Disable if not using BLF/presence |
| Blocking in event handlers | Stalls the event dispatch thread for all events | Always `go func()` for handler work |
| No `min-idle-cpu` | FS accepts calls until CPU is 100%; audio quality degrades | Set `min-idle-cpu=15` |
| No `sessions-per-second` limit | Burst origination can overwhelm the system | Set appropriate CPS limit |
| Shared Redis keys without tenant prefix | Tenant A can read/overwrite Tenant B's data | Always prefix: `{tenant_id}:key` |
| CDR processing in HTTP handler | Makes FS wait for DB write; causes CDR timeouts | Respond 200 immediately, process async |
| No graceful drain procedure | Rolling restarts drop active calls | Implement pause-inbound + elegant shutdown |
| Verbose channel events enabled | Doubles event payload size | Keep `verbose-channel-events=no` |

---

### 32.17 Single-Node Maximum Capacity Reference

On a well-tuned single Linux server (32 vCPU, 64 GB RAM, 10 Gbps NIC):

| Workload | Realistic Max | Notes |
|---------|--------------|-------|
| G.711 bridged calls (bypass media) | 5000+ concurrent | FS not in media path |
| G.711 bridged calls (proxy media) | 2000–3000 concurrent | FS processes all RTP |
| Opus transcoding | 800–1200 concurrent | CPU-intensive |
| Conference (mod_conference) | 500–800 rooms × 5 participants | Mixing is CPU-heavy |
| Recording (all calls) | 1000–1500 concurrent | Disk I/O becomes bottleneck |
| IVR with TTS/ASR | 300–500 concurrent | Depends on TTS/ASR engine |

**The RTP port range** defaults to 16384–32768 (16384 ports). Each call needs 2 ports (RTP + RTCP), giving a hard maximum of 8192 concurrent calls per IP address. For 1000 users this is not a constraint, but for larger deployments, use multiple IP addresses. [8](#3-7) 

---

### 32.18 Production Deployment Checklist for 1000+ Users

```
FreeSWITCH Core
  ☐ max-sessions ≥ 2 × expected concurrent calls + 20% headroom
  ☐ sessions-per-second set to expected peak CPS
  ☐ min-idle-cpu = 15 (refuse calls before CPU saturation)
  ☐ events-use-dispatch = true
  ☐ initial-event-threads = cpu_count / 4 (start conservative)
  ☐ session-thread-pool = true
  ☐ core-db-dsn pointing to PostgreSQL (NOT SQLite)
  ☐ max-db-handles ≥ 100
  ☐ sql-buffer-len = 2m, max-sql-buffer-len = 8m
  ☐ rtp-start-port and rtp-end-port configured
  ☐ switchname set uniquely per node
  ☐ loglevel = info (not debug)
  ☐ uuid-version = 7 (time-ordered, better DB index performance)
  ☐ enable-softtimer-timerfd = true (Linux only)

OS / Linux
  ☐ nofile limit ≥ 100,000 for freeswitch user
  ☐ nproc limit ≥ 65,535
  ☐ vm.swappiness = 1
  ☐ net.core.rmem_max / wmem_max increased
  ☐ fs.file-max = 1,000,000
  ☐ systemd LimitNOFILE and LimitNPROC set

SIP Profile
  ☐ manage-presence = false (unless needed)
  ☐ send-message-query-on-register = false
  ☐ auth-all-packets = false
  ☐ siptrace disabled (enable only for debugging)

PostgreSQL
  ☐ shared_buffers = 25% of RAM
  ☐ synchronous_commit = off (for call state DB only)
  ☐ Index on channels(hostname) and channels(state)
  ☐ Index on registrations(sip_user, sip_host)
  ☐ Connection pooler (PgBouncer) in front of PostgreSQL

Redis
  ☐ Redis Cluster (3 primary + 3 replica) for HA
  ☐ requirepass set
  ☐ maxmemory and eviction policy set
  ☐ All keys use tenant-scoped hash tags {tenant_id}
  ☐ TTL set on all call-related keys

Go API
  ☐ ESL connection pool (10–20 connections per FS node)
  ☐ Dedicated event consumer goroutine per FS node
  ☐ Per-tenant rate limiting (CPS + concurrent calls)
  ☐ Prometheus metrics exported
  ☐ Graceful shutdown with drain procedure

Monitoring
  ☐ HEARTBEAT events consumed and metrics exported
  ☐ Alert on: session utilization > 80%, idle CPU < 20%, CPS > 80%
  ☐ CDR pipeline monitored for backlog
  ☐ Redis memory usage monitored
  ☐ PostgreSQL connection count monitored
```
```

---

The key codebase facts backing this section:

- Default `max-sessions=1000` and `sessions-per-second=30` in `conf/vanilla/autoload_configs/switch.conf.xml` must both be raised for 1000+ users. [1](#3-0) 
- `initial-event-threads` is capped at `cpu_count / 2` by the core. [2](#3-1) 
- Session creation is hard-rejected when `session_count + 1 > session_limit` or `sps <= 0`. [4](#3-3) 
- The `sps` counter resets every second in the soft timer loop. [3](#3-2) 
- Default RTP port range is `16384–32768` (16384 ports = 8192 concurrent calls max per IP). [8](#3-7) 
- `switchname` overrides hostname for all DB/CURL requests in cluster environments. [5](#3-4) 
- `HEARTBEAT` events carry `Session-Count`, `Max-Sessions`, `Idle-CPU`, and SPS metrics. [6](#3-5) 
- `core-db-name` can be set to `/dev/shm/core.db` for ramdisk SQLite (single-node only). [9](#3-8) 
- `SCSC_PAUSE_INBOUND` and `SCSC_SHUTDOWN_ELEGANT` are available for graceful drain. [7](#3-6)

### Citations

**File:** conf/vanilla/autoload_configs/switch.conf.xml (L58-63)
```text
    this will ensure you're able to use the entire DS3 without a problem.  Otherwise you'll
    be 144 channels short of always filling that DS3 up which can translate into waste.
    -->
    <param name="max-sessions" value="1000"/>
    <!--Most channels to create per second -->
    <param name="sessions-per-second" value="30"/>
```

**File:** conf/vanilla/autoload_configs/switch.conf.xml (L192-195)
```text
     Allow to specify the sqlite db at a different location (In this example, move it to ramdrive for
     better performance on most linux distro (note, you loose the data if you reboot))
    -->
    <!-- <param name="core-db-name" value="/dev/shm/core.db" /> -->
```

**File:** src/switch_core.c (L114-124)
```c
        switch_event_add_header(event, SWITCH_STACK_BOTTOM, "Session-Count", "%u", switch_core_session_count());
        switch_event_add_header(event, SWITCH_STACK_BOTTOM, "Max-Sessions", "%u", switch_core_session_limit(0));
        switch_event_add_header(event, SWITCH_STACK_BOTTOM, "Session-Per-Sec", "%u", runtime.sps);
        switch_event_add_header(event, SWITCH_STACK_BOTTOM, "Session-Per-Sec-Last", "%u", runtime.sps_last);
        switch_event_add_header(event, SWITCH_STACK_BOTTOM, "Session-Per-Sec-Max", "%u", runtime.sps_peak);
        switch_event_add_header(event, SWITCH_STACK_BOTTOM, "Session-Per-Sec-FiveMin", "%u", runtime.sps_peak_fivemin);
        switch_event_add_header(event, SWITCH_STACK_BOTTOM, "Session-Since-Startup", "%" SWITCH_SIZE_T_FMT, switch_core_session_id() - 1);
        switch_event_add_header(event, SWITCH_STACK_BOTTOM, "Session-Peak-Max", "%u", runtime.sessions_peak);
        switch_event_add_header(event, SWITCH_STACK_BOTTOM, "Session-Peak-FiveMin", "%u", runtime.sessions_peak_fivemin);
        switch_event_add_header(event, SWITCH_STACK_BOTTOM, "Idle-CPU", "%f", switch_core_idle_cpu());
        switch_event_fire(&event);
```

**File:** src/switch_core.c (L2284-2306)
```c
                } else if (!strcasecmp(var, "initial-event-threads") && !zstr(val)) {
                    int tmp;

                    if (!runtime.events_use_dispatch) {
                        runtime.events_use_dispatch = 1;
                        switch_log_printf(SWITCH_CHANNEL_LOG, SWITCH_LOG_WARNING,
                                          "Implicitly setting events-use-dispatch based on usage of this initial-event-threads parameter.\n");
                    }

                    tmp = atoi(val);

                    if (tmp > runtime.cpu_count / 2) {
                        tmp = runtime.cpu_count / 2;
                        switch_log_printf(SWITCH_CHANNEL_LOG, SWITCH_LOG_WARNING, "This value cannot be higher than %d so setting it to that value\n",
                                          runtime.cpu_count / 2);
                    }

                    if (tmp < 1) {
                        tmp = 1;
                        switch_log_printf(SWITCH_CHANNEL_LOG, SWITCH_LOG_WARNING, "This value cannot be lower than 1 so setting it to that level\n");
                    }

                    switch_event_launch_dispatch_threads(tmp);
```

**File:** src/switch_core.c (L2336-2338)
```c
                } else if (!strcasecmp(var, "switchname") && !zstr(val)) {
                    runtime.switchname = switch_core_strdup(runtime.memory_pool, val);
                    switch_log_printf(SWITCH_CHANNEL_LOG, SWITCH_LOG_NOTICE, "Set switchname to %s\n", runtime.switchname);
```

**File:** src/switch_time.c (L1242-1267)
```c
            if (runtime.sps <= 0) {
                switch_log_printf(SWITCH_CHANNEL_LOG, SWITCH_LOG_CRIT, "Over Session Rate of %d!\n", runtime.sps_total);
            }

            /* These two mutexes must be held in exact order: session_hash_mutex and then throttle_mutex. See switch_core_session_request_uuid() */
            switch_mutex_lock(runtime.session_hash_mutex);
            switch_mutex_lock(runtime.throttle_mutex);
            runtime.sps_last = runtime.sps_total - runtime.sps;

            if (sps_interval_ticks >= 300) {
                runtime.sps_peak_fivemin = 0;
                sps_interval_ticks = 0;
                /* This line is protected by runtime.session_hash_mutex */
                runtime.sessions_peak_fivemin = session_manager.session_count;
            }

            sps_interval_ticks++;

            if (runtime.sps_last > runtime.sps_peak_fivemin) {
                runtime.sps_peak_fivemin = runtime.sps_last;
            }

            if (runtime.sps_last > runtime.sps_peak) {
                runtime.sps_peak = runtime.sps_last;
            }
            runtime.sps = runtime.sps_total;
```

**File:** src/switch_core_session.c (L2418-2436)
```c
    if (!(originate_flags & SOF_NO_LIMITS)) {
        switch_mutex_lock(runtime.throttle_mutex);
        count = session_manager.session_count;
        sps = --runtime.sps;
        switch_mutex_unlock(runtime.throttle_mutex);

        if (sps <= 0) {
            switch_mutex_unlock(runtime.session_hash_mutex);
            switch_log_printf(SWITCH_CHANNEL_LOG, SWITCH_LOG_CRIT, "Throttle Error! %d\n", session_manager.session_count);
            UNPROTECT_INTERFACE(endpoint_interface);
            return NULL;
        }

        if ((count + 1) > session_manager.session_limit) {
            switch_mutex_unlock(runtime.session_hash_mutex);
            switch_log_printf(SWITCH_CHANNEL_LOG, SWITCH_LOG_CRIT, "Over Session Limit! %d\n", session_manager.session_limit);
            UNPROTECT_INTERFACE(endpoint_interface);
            return NULL;
        }
```

**File:** src/include/switch_types.h (L2268-2286)
```text
typedef enum {
    SCSC_PAUSE_INBOUND,
    SCSC_PAUSE_OUTBOUND,
    SCSC_PAUSE_ALL,
    SCSC_HUPALL,
    SCSC_SHUTDOWN,
    SCSC_CHECK_RUNNING,
    SCSC_LOGLEVEL,
    SCSC_SPS,
    SCSC_LAST_SPS,
    SCSC_RECLAIM,
    SCSC_MAX_SESSIONS,
    SCSC_SYNC_CLOCK,
    SCSC_MAX_DTMF_DURATION,
    SCSC_MIN_DTMF_DURATION,
    SCSC_DEFAULT_DTMF_DURATION,
    SCSC_SHUTDOWN_ELEGANT,
    SCSC_SHUTDOWN_ASAP,
    SCSC_CANCEL_SHUTDOWN,
```

**File:** src/switch_rtp.c (L74-75)
```c
#define RTP_START_PORT 16384
#define RTP_END_PORT 32768
```


## Appendix A: Quick Reference Card

### Channel Variable Cheat Sheet

```
# Call routing
destination_number      — Dialed number
context                 — Current dialplan context
caller_id_name          — Caller ID name
caller_id_number        — Caller ID number
effective_caller_id_name/number — Effective (displayed) caller ID

# Bridge/transfer
bridge_uuid             — UUID of bridged channel
transfer_to             — Transfer destination
last_bridge_to          — Last bridged UUID

# Media
bypass_media            — true/false: bypass FS media
proxy_media             — true/false: proxy media through FS
rtp_secure_media        — mandatory/optional/false
absolute_codec_string   — Force specific codec
jitterbuffer_msec       — Jitter buffer settings

# Recording
record_file_path        — Active recording path
RECORD_STEREO           — true: record both legs in stereo

# SIP
sip_h_X-*              — Custom SIP headers (inbound)
sip_rh_X-*             — Custom SIP headers (reply)
sip_profile             — S