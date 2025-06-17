import { type NextRequest, NextResponse } from "next/server"
import { addEventForSession } from "../events/route"
import { updateUserActivity } from "../join/route"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, partnerId, message, senderName, senderGender } = body

    console.log("Message request received:", { sessionId, partnerId, senderName, messageLength: message?.length })

    if (!sessionId || !partnerId || !message || !senderName) {
      console.error("Missing required fields:", {
        sessionId: !!sessionId,
        partnerId: !!partnerId,
        message: !!message,
        senderName: !!senderName,
      })
      return NextResponse.json({ success: false, error: "Missing required fields" })
    }

    // Verify both users are still active
    const activeUsers = globalThis.activeUsers
    if (!activeUsers) {
      console.error("Active users not initialized")
      return NextResponse.json({ success: false, error: "System not initialized" })
    }

    const sender = activeUsers.get(sessionId)
    const partner = activeUsers.get(partnerId)

    console.log("User lookup:", {
      senderFound: !!sender,
      partnerFound: !!partner,
      senderPartnerId: sender?.partnerId,
      partnerPartnerId: partner?.partnerId,
    })

    if (!sender) {
      console.error("Sender not found:", sessionId)
      return NextResponse.json({ success: false, error: "Sender not found" })
    }

    if (!partner) {
      console.error("Partner not found:", partnerId)
      return NextResponse.json({ success: false, error: "Partner not found or disconnected" })
    }

    // Verify they are actually paired
    if (sender.partnerId !== partnerId || partner.partnerId !== sessionId) {
      console.error("Users not properly paired:", {
        senderPartnerId: sender.partnerId,
        expectedPartnerId: partnerId,
        partnerPartnerId: partner.partnerId,
        expectedSessionId: sessionId,
      })
      return NextResponse.json({ success: false, error: "Users are not paired" })
    }

    console.log(
      `✅ Message from ${senderName} (${senderGender}) to ${partner.name} (${partner.gender}): "${message.substring(0, 50)}${message.length > 50 ? "..." : ""}"`,
    )

    // Update sender's last seen timestamp
    updateUserActivity(sessionId)

    // Send message to partner via events
    addEventForSession(partnerId, "message", {
      message: message.trim(),
      senderName,
      senderGender: senderGender || "male", // Default fallback
      timestamp: Date.now(),
    })

    console.log(`✅ Message event added for partner: ${partnerId}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Send message error:", error)
    return NextResponse.json({
      success: false,
      error: "Internal server error: " + (error instanceof Error ? error.message : "Unknown error"),
    })
  }
}
