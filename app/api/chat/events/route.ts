import { type NextRequest, NextResponse } from "next/server"
import { updateUserActivity } from "../join/route"

// Simple polling endpoint instead of SSE
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("sessionId")
  const lastEventId = searchParams.get("lastEventId") || "0"

  if (!sessionId) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 })
  }

  try {
    // Update user activity when they poll
    updateUserActivity(sessionId)

    // Get events for this session
    const events = getEventsForSession(sessionId, lastEventId)

    if (events.length > 0) {
      console.log(
        `📨 Returning ${events.length} events for ${sessionId}:`,
        events.map((e) => e.type),
      )
    }

    return NextResponse.json({
      success: true,
      events,
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error("Events API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Store events in memory (in production, you'd use Redis or similar)
const sessionEvents = new Map<string, Array<{ id: string; type: string; data: any; timestamp: number }>>()

export function addEventForSession(sessionId: string, type: string, data: any) {
  if (!sessionEvents.has(sessionId)) {
    sessionEvents.set(sessionId, [])
  }

  const events = sessionEvents.get(sessionId)!
  const eventId = Date.now().toString() + Math.random().toString(36).substring(2)

  events.push({
    id: eventId,
    type,
    data,
    timestamp: Date.now(),
  })

  console.log(`📨 Added event for ${sessionId}: ${type}`, data)

  // Keep only last 100 events per session
  if (events.length > 100) {
    events.splice(0, events.length - 100)
  }
}

function getEventsForSession(sessionId: string, lastEventId: string) {
  const events = sessionEvents.get(sessionId) || []

  // If lastEventId is "0", return all events
  if (lastEventId === "0") {
    return events
  }

  // Find the index of the last event ID
  const lastIndex = events.findIndex((event) => event.id === lastEventId)

  if (lastIndex === -1) {
    // If lastEventId not found, return all events (might have been cleaned up)
    return events
  }

  // Return events after the last event ID
  return events.slice(lastIndex + 1)
}

export function clearEventsForSession(sessionId: string) {
  sessionEvents.delete(sessionId)
  console.log(`🗑️ Cleared events for session: ${sessionId}`)
}
