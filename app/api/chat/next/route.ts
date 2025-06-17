import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ success: false, error: "Session ID required" })
    }

    // Import the cleanup function and active users from join route
    const { cleanupUser } = await import("../join/route")

    // This will handle disconnecting from current partner and rejoining queue
    cleanupUser(sessionId)

    // Rejoin the chat system
    const joinResponse = await fetch(`${request.nextUrl.origin}/api/chat/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })

    const joinData = await joinResponse.json()

    return NextResponse.json({ success: true, ...joinData })
  } catch (error) {
    console.error("Next chat error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" })
  }
}
