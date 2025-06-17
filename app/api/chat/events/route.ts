import { type NextRequest, NextResponse } from "next/server"

// Simple polling endpoint instead of SSE
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("sessionId")
  const lastEventId = searchParams.get("lastEventId") || "0"

  if (!sessionId) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 })
  }

  try {
    // Get events for this session
    const events = getEventsForSession(sessionId, lastEventId)

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

  // Keep only last 50 events per session
  if (events.length > 50) {
    events.splice(0, events.length - 50)
  }
}

function getEventsForSession(sessionId: string, lastEventId: string) {
  const events = sessionEvents.get(sessionId) || []
  const lastId = Number.parseInt(lastEventId) || 0

  // Return events newer than lastEventId
  return events.filter((event) => Number.parseInt(event.id) > lastId)
}

export function clearEventsForSession(sessionId: string) {
  sessionEvents.delete(sessionId)
}
