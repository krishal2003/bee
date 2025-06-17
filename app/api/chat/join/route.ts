import { type NextRequest, NextResponse } from "next/server"

// In-memory storage for active users and chat pairs
const activeUsers = new Map<string, { sessionId: string; name: string; partnerId?: string }>()
const waitingQueue: string[] = []
const chatPairs = new Map<string, string>() // sessionId -> partnerId

// Generate random anonymous names
const adjectives = [
  "Happy",
  "Clever",
  "Bright",
  "Swift",
  "Kind",
  "Brave",
  "Calm",
  "Cool",
  "Wise",
  "Bold",
  "Gentle",
  "Quick",
  "Smart",
  "Funny",
  "Lucky",
  "Sunny",
  "Witty",
  "Zesty",
  "Eager",
  "Noble",
]

const animals = [
  "Bee",
  "Fox",
  "Cat",
  "Dog",
  "Bear",
  "Bird",
  "Fish",
  "Lion",
  "Wolf",
  "Deer",
  "Owl",
  "Frog",
  "Duck",
  "Seal",
  "Hawk",
  "Dove",
  "Swan",
  "Crab",
  "Moth",
  "Wren",
]

function generateRandomName(): string {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)]
  const animal = animals[Math.floor(Math.random() * animals.length)]
  const number = Math.floor(Math.random() * 999) + 1
  return `${adjective}${animal}${number}`
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ success: false, error: "Session ID required" })
    }

    const userName = generateRandomName()

    // Add user to active users
    activeUsers.set(sessionId, { sessionId, name: userName })

    // Try to match with someone from the waiting queue
    if (waitingQueue.length > 0) {
      const partnerId = waitingQueue.shift()!
      const partner = activeUsers.get(partnerId)

      if (partner) {
        // Create chat pair
        chatPairs.set(sessionId, partnerId)
        chatPairs.set(partnerId, sessionId)

        // Update user records
        activeUsers.set(sessionId, { ...activeUsers.get(sessionId)!, partnerId })
        activeUsers.set(partnerId, { ...partner, partnerId: sessionId })

        // Notify both users about the match
        global.eventStreams?.get(sessionId)?.write(
          `data: ${JSON.stringify({
            type: "matched",
            partnerId,
            partnerName: partner.name,
          })}\n\n`,
        )

        global.eventStreams?.get(partnerId)?.write(
          `data: ${JSON.stringify({
            type: "matched",
            partnerId: sessionId,
            partnerName: userName,
          })}\n\n`,
        )
      }
    } else {
      // Add to waiting queue
      waitingQueue.push(sessionId)
    }

    // Broadcast user count update
    broadcastUserCount()

    return NextResponse.json({
      success: true,
      userName,
      waitingInQueue: waitingQueue.length,
    })
  } catch (error) {
    console.error("Join chat error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" })
  }
}

function broadcastUserCount() {
  const count = activeUsers.size
  if (global.eventStreams) {
    for (const stream of global.eventStreams.values()) {
      stream.write(
        `data: ${JSON.stringify({
          type: "user_count",
          count,
        })}\n\n`,
      )
    }
  }
}

// Cleanup function for disconnected users
export function cleanupUser(sessionId: string) {
  const user = activeUsers.get(sessionId)
  if (!user) return

  // Remove from waiting queue
  const queueIndex = waitingQueue.indexOf(sessionId)
  if (queueIndex > -1) {
    waitingQueue.splice(queueIndex, 1)
  }

  // Handle partner disconnection
  if (user.partnerId) {
    const partnerId = user.partnerId
    const partner = activeUsers.get(partnerId)

    if (partner) {
      // Notify partner about disconnection
      global.eventStreams?.get(partnerId)?.write(
        `data: ${JSON.stringify({
          type: "partner_disconnected",
          partnerName: user.name,
        })}\n\n`,
      )

      // Remove partner relationship
      activeUsers.set(partnerId, { ...partner, partnerId: undefined })
      chatPairs.delete(partnerId)

      // Add partner back to waiting queue
      waitingQueue.push(partnerId)
    }

    chatPairs.delete(sessionId)
  }

  // Remove user
  activeUsers.delete(sessionId)
  broadcastUserCount()
}
