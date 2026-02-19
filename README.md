# screen-capture-mcp

An MCP server that gives Claude Code (or any MCP client) the ability to take screenshots of your screen. Useful when working on games, GUIs, or anything visual where Claude needs to see what you see.

**Windows only** — uses PowerShell and .NET for screen capture.

## Why?

When you're working with Claude Code on something visual — a game, a UI, a 3D editor — Claude is blind. It can read your code but has no idea what the result actually looks like. You end up manually screenshotting, dragging images into the chat, and explaining what you're looking at.

This MCP server fixes that. Once installed, Claude can take screenshots on its own whenever it needs to see what's happening on screen.

## Features

- **Full screen capture** — captures your primary display
- **Window capture** — capture a specific window by title (partial match)
- **Auto-resize** — images are resized to 1280px wide to save tokens
- **Zero native dependencies** — uses PowerShell/.NET built into Windows, no native compilation needed

## Installation

```bash
git clone https://github.com/kmoulder/screen-capture-mcp.git
cd screen-capture-mcp
npm install
npm run build
```

Then register it with Claude Code:

```bash
claude mcp add -s user -t stdio screen-capture-mcp -- node /path/to/screen-capture-mcp/dist/index.js
```

Or add it manually to your `~/.claude.json`:

```json
{
  "mcpServers": {
    "screen-capture-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/screen-capture-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Code after registering.

## Usage

Once registered, Claude Code can call the `take_screenshot` tool. You can ask for screenshots naturally:

```
"Take a screenshot"
"Take a screenshot of the Godot window"
"Show me what the game looks like right now"
```

### Monitoring Over Time

Because Claude can call the tool repeatedly, you can ask it to watch your screen over time:

```
"Take a screenshot every 5 seconds for the next minute and describe what changes"
"Wait 30 seconds then take a screenshot"
"Watch the Unity window and let me know when the build finishes"
"Capture the game window every 10 seconds while I playtest — give me feedback on the UI"
```

This is especially useful for:

- **Playtesting feedback** — run your game and get real-time observations from Claude as you play
- **Build monitoring** — have Claude watch a long-running build or deployment and notify you when it's done
- **UI iteration** — make changes in an editor and have Claude compare screenshots to track progress
- **Bug reproduction** — ask Claude to capture screenshots while you reproduce a bug, then analyze the sequence

### Bringing Visual Context Into Coding Tasks

You can also mix screenshots into normal development work:

```
"Look at the game window and then fix the player sprite so it faces the right direction"
"Take a screenshot of the editor, then update the CSS to match the mockup I have open"
"Check what the app looks like in the browser and fix any layout issues you see"
```

This closes the loop between writing code and seeing results — Claude can make a change, screenshot the result, and iterate.

### Tool Schema

```
take_screenshot(window_title?: string)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `window_title` | `string` (optional) | Window title to capture (partial match). Omit for full screen. |

Returns a base64-encoded PNG image.

## How It Works

- Uses PowerShell with `System.Drawing` and `System.Windows.Forms` to capture the screen
- For window-specific capture, uses `user32.dll GetWindowRect` via P/Invoke to find and capture the target window
- Images are resized to 1280px wide using `sharp` before being returned to keep token usage reasonable

## Requirements

- Windows 10/11
- Node.js 18+
- PowerShell (included with Windows)

## License

MIT
