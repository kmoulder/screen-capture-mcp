#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import sharp from "sharp";
import { execSync } from "child_process";

const server = new McpServer({
  name: "screen-capture-mcp",
  version: "1.0.0",
});

function runPowerShell(script: string): Buffer {
  const result = execSync(
    `powershell -NoProfile -NonInteractive -Command ${JSON.stringify(script)}`,
    { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, timeout: 15000 }
  );
  return Buffer.from(result.trim(), "base64");
}

function captureFullScreen(): Buffer {
  return runPowerShell(`
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$graphics.Dispose()

$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

[Convert]::ToBase64String($ms.ToArray())
$ms.Dispose()
`);
}

function captureWindowByTitle(title: string): Buffer {
  const safeTitle = title.replace(/'/g, "''");

  return runPowerShell(`
Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
}
public struct RECT {
    public int Left; public int Top; public int Right; public int Bottom;
}
'@

$proc = Get-Process | Where-Object { $_.MainWindowTitle -like '*${safeTitle}*' -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Error "Window not found: ${safeTitle}"; exit 1 }

$hwnd = $proc.MainWindowHandle
$rect = New-Object RECT
[Win32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null

$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top

if ($width -le 0 -or $height -le 0) { Write-Error "Invalid window dimensions"; exit 1 }

$bmp = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($width, $height)))
$graphics.Dispose()

$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

[Convert]::ToBase64String($ms.ToArray())
$ms.Dispose()
`);
}

async function resizeImage(
  pngBuffer: Buffer,
  targetWidth = 1280
): Promise<Buffer> {
  const metadata = await sharp(pngBuffer).metadata();
  if (metadata.width && metadata.width > targetWidth) {
    return sharp(pngBuffer)
      .resize({ width: targetWidth, withoutEnlargement: true })
      .png()
      .toBuffer();
  }
  return pngBuffer;
}

server.tool(
  "take_screenshot",
  "Captures a screenshot of the primary display or a specific window. Returns the image as a PNG. If window_title is provided, captures only that window (partial title match). Otherwise captures the full screen.",
  {
    window_title: z
      .string()
      .optional()
      .describe(
        "Optional window title to capture (partial match). If omitted, captures the full primary screen."
      ),
  },
  async ({ window_title }) => {
    try {
      let pngBuffer: Buffer;

      if (window_title) {
        pngBuffer = captureWindowByTitle(window_title);
      } else {
        pngBuffer = captureFullScreen();
      }

      pngBuffer = await resizeImage(pngBuffer);
      const base64 = pngBuffer.toString("base64");

      return {
        content: [
          {
            type: "image" as const,
            data: base64,
            mimeType: "image/png",
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          { type: "text" as const, text: `Screenshot failed: ${message}` },
        ],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
