import { type NextRequest, NextResponse } from "next/server"
import { addEventForSession } from "../events/route"

export async function POST(request: NextRequest) {
  try {
    const { sessionId, partnerId, message, senderName } = await request.json()

    if (!sessionId || !partnerId || !message) {
      return NextResponse.json({ success: false, error: "Missing required fields" })
    }

    // Verify both users are still active
    const activeUsers = globalThis.activeUsers
    if (!activeUsers) {
      return NextResponse.json({ success: false, error: "System not initialized" })
    }

    const sender = activeUsers.get(sessionId)
    const partner = activeUsers.get(partnerId)

    if (!sender || !partner) {
      return NextResponse.json({ success: false, error: "User not found or disconnected" })
    }

    // Update last seen timestamp for sender
    activeUsers.set(sessionId, { ...sender, lastSeen: Date.now() })

    // Send message to partner via events
    addEventForSession(partnerId, "message", {
      message: message.trim(),
      senderName,
      timestamp: Date.now(),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Send message error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" })
  }
}
