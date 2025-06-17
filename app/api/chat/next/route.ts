import { type NextRequest, NextResponse } from "next/server"
import { cleanupUser } from "../join/route"

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ success: false, error: "Session ID required" })
    }

    console.log(`User requesting next chat: ${sessionId}`)

    // Get user info
    const activeUsers = globalThis.activeUsers
    const user = activeUsers?.get(sessionId)

    if (user && user.partnerId) {
      const partnerId = user.partnerId
      const partner = activeUsers?.get(partnerId)

      if (partner) {
        console.log(`Ending current chat between ${user.name} and ${partner.name}`)

        // Cleanup current user (this will notify partner and add them back to queue)
        cleanupUser(sessionId)

        // Rejoin the chat system
        const joinResponse = await fetch(`${request.nextUrl.origin}/api/chat/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        })

        const joinData = await joinResponse.json()
        return NextResponse.json({ success: true, ...joinData })
      }
    }

    // If no partner, just rejoin
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
