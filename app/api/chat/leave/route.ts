import { type NextRequest, NextResponse } from "next/server"
import { cleanupUser } from "../join/route"

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ success: false, error: "Session ID required" })
    }

    console.log(`User leaving chat: ${sessionId}`)

    // Get user info before cleanup
    const activeUsers = globalThis.activeUsers
    const user = activeUsers?.get(sessionId)

    if (user && user.partnerId) {
      const partnerId = user.partnerId
      const partner = activeUsers?.get(partnerId)

      if (partner) {
        console.log(`Ending chat for both users: ${user.name} and ${partner.name}`)

        // Import and call cleanup function which will handle partner notification
        cleanupUser(sessionId)
      }
    } else {
      // No partner, just cleanup this user
      cleanupUser(sessionId)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Leave chat error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" })
  }
}
