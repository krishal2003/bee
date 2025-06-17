import { type NextRequest, NextResponse } from "next/server"
import { addEventForSession, clearEventsForSession } from "../events/route"

// Declare global types
declare global {
  var activeUsers: Map<string, { sessionId: string; name: string; partnerId?: string; lastSeen: number }> | undefined
  var waitingQueue: string[] | undefined
  var chatPairs: Map<string, string> | undefined
}

// Initialize global variables
if (!globalThis.activeUsers) {
  globalThis.activeUsers = new Map()
}
if (!globalThis.waitingQueue) {
  globalThis.waitingQueue = []
}
if (!globalThis.chatPairs) {
  globalThis.chatPairs = new Map()
}

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

// Cleanup stale users every 30 seconds
function cleanupStaleUsers() {
  const now = Date.now()
  const staleThreshold = 60000 // 60 seconds
  const activeUsers = globalThis.activeUsers!

  for (const [sessionId, user] of activeUsers.entries()) {
    if (now - user.lastSeen > staleThreshold) {
      cleanupUser(sessionId)
    }
  }
}

setInterval(cleanupStaleUsers, 30000)

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ success: false, error: "Session ID required" })
    }

    const userName = generateRandomName()
    const now = Date.now()

    const activeUsers = globalThis.activeUsers!
    const waitingQueue = globalThis.waitingQueue!
    const chatPairs = globalThis.chatPairs!

    // Add user to active users with timestamp
    activeUsers.set(sessionId, { sessionId, name: userName, lastSeen: now })

    // Send initial event
    addEventForSession(sessionId, "connected", { sessionId, userName })

    // Try to match with someone from the waiting queue
    if (waitingQueue.length > 0) {
      const partnerId = waitingQueue.shift()!
      const partner = activeUsers.get(partnerId)

      if (partner) {
        // Create chat pair
        chatPairs.set(sessionId, partnerId)
        chatPairs.set(partnerId, sessionId)

        // Update user records with partner info
        activeUsers.set(sessionId, {
          sessionId,
          name: userName,
          partnerId,
          lastSeen: now,
        })
        activeUsers.set(partnerId, {
          ...partner,
          partnerId: sessionId,
          lastSeen: now,
        })

        // Notify both users about the match
        addEventForSession(sessionId, "matched", {
          partnerId,
          partnerName: partner.name,
        })
        addEventForSession(partnerId, "matched", {
          partnerId: sessionId,
          partnerName: userName,
        })
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
      totalUsers: activeUsers.size,
    })
  } catch (error) {
    console.error("Join chat error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" })
  }
}

function broadcastUserCount() {
  const activeUsers = globalThis.activeUsers!
  const count = activeUsers.size

  // Send user count to all active sessions
  for (const [sessionId] of activeUsers.entries()) {
    addEventForSession(sessionId, "user_count", { count })
  }
}

// Cleanup function for disconnected users
export function cleanupUser(sessionId: string) {
  const activeUsers = globalThis.activeUsers!
  const waitingQueue = globalThis.waitingQueue!
  const chatPairs = globalThis.chatPairs!

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
      addEventForSession(partnerId, "partner_disconnected", {
        partnerName: user.name,
      })

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

  // Clear events for this session
  clearEventsForSession(sessionId)

  broadcastUserCount()
}
