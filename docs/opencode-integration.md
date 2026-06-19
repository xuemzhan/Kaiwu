# OpenCode Integration Contract

## Overview

OpenCodeAIService must implement the same interface as AIService to be interchangeable via AIServiceFactory. The factory selects between implementations based on `config.mode`:

```javascript
// taskpane/services/ai-factory.js
AIServiceFactory.create = function(config) {
    config = config || Config.getAll();
    if (config.mode === 'opencode' && typeof OpenCodeAIService !== 'undefined') {
        return OpenCodeAIService;
    }
    return AIService;
};
```

## Interface Contract

### Core AI Methods

These methods must match AIService signatures exactly for interchangeability.

#### send(messages, onSuccess, onError, options)

Non-streaming chat completion request.

**Parameters:**
- `messages` - `Array<{role: string, content: string}>` Chat history including system prompt
- `onSuccess` - `function(content: string)` Called with response text content
- `onError` - `function(message: string)` Called with error message on failure
- `options` - `{temperature?: number, maxTokens?: number}` Optional request parameters

**Returns:** `void`

**Implementation Note:** Must validate API key/config before making request. Should handle JSON response parsing and extract `choices[0].message.content`.

**Example:**
```javascript
const messages = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' }
];
aiservice.send(messages, 
    (content) => console.log('Response:', content),
    (error) => console.error('Error:', error),
    { temperature: 0.7, maxTokens: 1000 }
);
```

---

#### sendStream(messages, onChunk, onComplete, onError, options)

Streaming chat completion request via Server-Sent Events (SSE).

**Parameters:**
- `messages` - `Array<{role: string, content: string}>` Chat history
- `onChunk` - `function(delta: string, fullContent: string)` Called for each streaming chunk with delta and accumulated content
- `onComplete` - `function(fullContent: string)` Called when stream completes with full content
- `onError` - `function(message: string)` Called on error
- `options` - `{temperature?: number, maxTokens?: number}` Optional request parameters

**Returns:** `{abort: function()}` Controller object to cancel the request

**Implementation Note:** Must handle SSE parsing (data: prefix, [DONE] termination). Must implement reasoning content stripping for reasoning models.

**Example:**
```javascript
const controller = aiservice.sendStream(
    messages,
    (delta, full) => { /* update UI with delta */ },
    (full) => { /* stream complete */ },
    (error) => { /* handle error */ },
    { temperature: 0.7 }
);

// To cancel:
controller.abort();
```

---

#### abort()

Cancel current streaming request. No-op if no request in progress.

**Parameters:** None

**Returns:** `void`

**Implementation Note:** Should set internal aborted flag and abort any active fetch/stream reader.

---

### OpenCode-Specific Methods

These methods are specific to OpenCodeAIService and extend the base AIService interface.

---

#### listSessions(onSuccess, onError)

List all OpenCode sessions from the server.

**Parameters:**
- `onSuccess` - `function(sessions: Array<Object>)` Called with array of session objects
- `onError` - `function(message: string)` Called with error message on failure

**Returns:** `void`

**Session Object Structure:**
```javascript
{
    id: string,           // Session ID
    title: string,        // Session title
    parentId?: string,    // Parent session ID (if child session)
    createdAt: string,    // ISO timestamp
    updatedAt: string    // ISO timestamp
}
```

---

#### createSession(parentID, title, onSuccess, onError)

Create a new OpenCode session.

**Parameters:**
- `parentID` - `string | null` Optional parent session ID for branching
- `title` - `string` Session title
- `onSuccess` - `function(session: Object)` Called with created session object
- `onError` - `function(message: string)` Called with error message on failure

**Returns:** `void`

**Session Object Structure:**
```javascript
{
    id: string,           // New session ID
    title: string,        // Session title
    parentId?: string,    // Parent session ID (if provided)
    createdAt: string,    // ISO timestamp
    updatedAt: string     // ISO timestamp
}
```

---

#### testConnection(onSuccess, onError)

Test connection to OpenCode server and retrieve server information.

**Parameters:**
- `onSuccess` - `function(info: Object)` Called with server info object
- `onError` - `function(message: string)` Called with error message on failure

**Returns:** `void`

**Server Info Structure:**
```javascript
{
    version: string,      // OpenCode server version
    status: string,       // 'connected' or other status
    url: string           // Server URL
}
```

---

### Helper Methods

#### buildMessages(systemPrompt, historyMessages, newUserMessage, options)

Build message array for API requests. (Optional - can be copied from AIService)

**Parameters:**
- `systemPrompt` - `string` System prompt
- `historyMessages` - `Array<{role, content}>` Previous messages
- `newUserMessage` - `string` Current user message
- `options` - `{maxHistoryMessages?: number}` Options

**Returns:** `Array<{role: string, content: string}>`

---

## Error Handling

All errors must be classified consistently. AIService defines error classification by HTTP status code:

| Status Code | Error Type | Message Pattern | Retryable |
|-------------|------------|-----------------|-----------|
| 401 | AuthError | "API Key 无效或已过期" | No |
| 403 | AuthError | "API Key 权限不足" | No |
| 404 | NotFoundError | "API 地址或模型名称不存在" | No |
| 408 | TimeoutError | "服务器响应超时" | Yes |
| 429 | RateLimitError | "请求过于频繁，已达速率上限" | Yes |
| 500 | ServerError | "AI 服务暂不可用" | Yes |
| 502 | ServerError | "AI 服务暂不可用" | Yes |
| 503 | ServerError | "AI 服务暂不可用" | Yes |
| 504 | TimeoutError | "服务器响应超时" | Yes |
| >=500 | ServerError | "AI 服务异常" | Yes |

**Network Errors:**
- Timeout: "AI 响应超时" - retryable
- Connection failure: "网络请求失败" - not retryable

**Error Object Structure:**
```javascript
{
    message: string,      // User-friendly error message
    retryable: boolean,   // Whether the request should be retried
    status?: number       // HTTP status code (if applicable)
}
```

---

## Configuration

OpenCodeAIService reads configuration from Config:

| Config Key | Type | Description |
|------------|------|-------------|
| `opencodeUrl` | `string` | OpenCode server URL (default: `http://localhost:4096`) |
| `opencodeUsername` | `string` | Authentication username |
| `opencodePassword` | `string` | Authentication password |
| `opencodeAgent` | `string` | Agent name: `plan` or `build` |
| `mode` | `string` | Set to `'opencode'` to activate OpenCodeAIService |

**Config Source:**
```javascript
var config = Config.getAll();
// Check mode
if (config.mode === 'opencode') {
    // Use OpenCodeAIService
}
```

---

## Implementation Checklist

To implement OpenCodeAIService:

- [ ] Implement `send()` - non-streaming request to `/chat/completions`
- [ ] Implement `sendStream()` - streaming request with SSE parsing
- [ ] Implement `abort()` - cancel in-progress stream
- [ ] Implement `listSessions()` - GET `/sessions`
- [ ] Implement `createSession()` - POST `/sessions`
- [ ] Implement `testConnection()` - GET `/health` or similar
- [ ] Handle authentication (username/password via headers or token)
- [ ] Implement error classification matching AIService
- [ ] Handle reasoning content stripping for reasoning models
- [ ] Test interchangeability via AIServiceFactory

---

## File References

- Base interface: `taskpane/services/ai.js`
- OpenCode stub: `taskpane/services/opencode-ai.js`
- Factory: `taskpane/services/ai-factory.js`
- Config: `taskpane/services/config.js`
