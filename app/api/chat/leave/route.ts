import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ success: false, error: "Session ID required" })
    }

    // Import and call cleanup function
    const { cleanupUser } = await import("../join/route")
    cleanupUser(sessionId)

    // Close the event stream
    global.eventStreams?.delete(sessionId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Leave chat error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" })
  }
}
