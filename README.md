# screen-mcp

An MCP server that gives Claude Code (or any MCP client) the ability to take screenshots. Useful when working on games, GUIs, or anything visual where Claude needs to see what's on your screen.

**Windows only** — uses PowerShell and .NET for screen capture.

## Features

- **Full screen capture** — captures your primary display
- **Window capture** — capture a specific window by title (partial match)
- **Auto-resize** — images are resized to 1280px wide to save tokens
- **Zero native dependencies** — uses PowerShell/.NET built into Windows, no native compilation needed

## Installation

```bash
git clone https://github.com/kmoulder/screen-mcp.git
cd screen-mcp
npm install
npm run build
```

Then register it with Claude Code:

```bash
claude mcp add -s user -t stdio screen-mcp -- node /path/to/screen-mcp/dist/index.js
```

Or add it manually to your `~/.claude.json`:

```json
{
  "mcpServers": {
    "screen-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/screen-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Code after registering.

## Usage

Once registered, Claude Code can call the `take_screenshot` tool:

```
"Take a screenshot"                        → captures full primary screen
"Take a screenshot of the Godot window"   → captures window with "Godot" in the title
```

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
