import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { sessionId, partnerId, message, senderName } = await request.json()

    if (!sessionId || !partnerId || !message) {
      return NextResponse.json({ success: false, error: "Missing required fields" })
    }

    // Send message to partner
    const partnerStream = global.eventStreams?.get(partnerId)
    if (partnerStream) {
      partnerStream.write(
        `data: ${JSON.stringify({
          type: "message",
          message,
          senderName,
          timestamp: Date.now(),
        })}\n\n`,
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Send message error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" })
  }
}
