#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import sharp from "sharp";
import { spawn } from "child_process";

const server = new McpServer({
  name: "screen-capture-mcp",
  version: "1.1.0",
});

async function runPowerShell(script: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Launch PowerShell, using '-' to indicate that commands should be read from standard input (stdin).
    const child = spawn("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "-"
    ]);

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    // Set timeout protection (15 seconds)
    const timeoutId = setTimeout(() => {
      child.kill();
      reject(new Error("PowerShell script execution timed out (15000ms)"));
    }, 15000);

    child.on("error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeoutId);
      if (code !== 0) {
        reject(
          new Error(
            `PowerShell error (code ${code}): ${
              stderrData.trim() || stdoutData.trim()
            }`
          )
        );
      } else {
        // Restore a base64 string to a buffer
        resolve(Buffer.from(stdoutData.trim(), "base64"));
      }
    });

    // Write script to stdin and end input
    child.stdin.write(script);
    child.stdin.end();
  });
}

async function captureFullScreen(): Promise<Buffer> {
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

async function captureWindowByTitle(title: string): Promise<Buffer> {
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

server.registerTool(
  "take_screenshot",
  {
    description: "Captures a screenshot of the primary display or a specific window. Returns the image as a PNG. If window_title is provided, captures only that window (partial title match). Otherwise captures the full screen.",
    inputSchema: {
      window_title: z
        .string()
        .optional()
        .describe(
          "Optional window title to capture (partial match). If omitted, captures the full primary screen."
        ),
    },
  },
  async ({ window_title }) => {
    try {
      let pngBuffer: Buffer;

      if (window_title) {
        pngBuffer = await captureWindowByTitle(window_title);
      } else {
        pngBuffer = await captureFullScreen();
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
