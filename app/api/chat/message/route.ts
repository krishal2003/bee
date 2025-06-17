import { type NextRequest, NextResponse } from "next/server"
import { addEventForSession } from "../events/route"
import { updateUserActivity } from "../join/route"

export async function POST(request: NextRequest) {
  try {
    const { sessionId, partnerId, message, senderName, senderGender } = await request.json()

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

    if (!sender) {
      return NextResponse.json({ success: false, error: "Sender not found" })
    }

    if (!partner) {
      return NextResponse.json({ success: false, error: "Partner not found or disconnected" })
    }

    // Verify they are actually paired
    if (sender.partnerId !== partnerId || partner.partnerId !== sessionId) {
      return NextResponse.json({ success: false, error: "Users are not paired" })
    }

    console.log(
      `Message from ${senderName} (${senderGender}) to ${partner.name} (${partner.gender}): ${message.substring(0, 50)}...`,
    )

    // Update sender's last seen timestamp
    updateUserActivity(sessionId)

    // Send message to partner via events
    addEventForSession(partnerId, "message", {
      message: message.trim(),
      senderName,
      senderGender,
      timestamp: Date.now(),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Send message error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" })
  }
}
