import type { NextRequest } from "next/server"

// Global event streams storage
declare global {
  var eventStreams: Map<string, WritableStreamDefaultWriter> | undefined
}

if (!global.eventStreams) {
  global.eventStreams = new Map()
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("sessionId")

  if (!sessionId) {
    return new Response("Session ID required", { status: 400 })
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      // Store the writer for this session
      const writer = controller
      global.eventStreams!.set(sessionId, {
        write: (data: string) => {
          try {
            controller.enqueue(encoder.encode(data))
          } catch (error) {
            console.error("Stream write error:", error)
          }
        },
      } as any)

      // Send initial connection message
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "connected",
            sessionId,
          })}\n\n`,
        ),
      )

      // Handle cleanup when stream closes
      request.signal.addEventListener("abort", () => {
        global.eventStreams!.delete(sessionId)
        // Import and call cleanup function
        import("../join/route").then(({ cleanupUser }) => {
          cleanupUser(sessionId)
        })
        try {
          controller.close()
        } catch (error) {
          // Stream already closed
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    },
  })
}
