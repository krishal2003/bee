import { type NextRequest, NextResponse } from "next/server"
import { addEventForSession, clearEventsForSession } from "../events/route"

// Declare global types
declare global {
  var activeUsers:
    | Map<string, { sessionId: string; name: string; gender: "male" | "female"; partnerId?: string; lastSeen: number }>
    | undefined
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
const maleAdjectives = ["Strong", "Brave", "Cool", "Smart", "Bold", "Swift", "Wise", "Noble", "Clever", "Quick"]
const femaleAdjectives = ["Bright", "Kind", "Gentle", "Sweet", "Lovely", "Grace", "Sunny", "Happy", "Pretty", "Witty"]

const maleAnimals = ["Lion", "Wolf", "Bear", "Hawk", "Tiger", "Eagle", "Fox", "Shark", "Falcon", "Panther"]
const femaleAnimals = ["Butterfly", "Swan", "Dove", "Cat", "Deer", "Bird", "Bee", "Owl", "Seal", "Wren"]

function generateRandomName(gender: "male" | "female"): string {
  const adjectives = gender === "male" ? maleAdjectives : femaleAdjectives
  const animals = gender === "male" ? maleAnimals : femaleAnimals

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)]
  const animal = animals[Math.floor(Math.random() * animals.length)]
  const number = Math.floor(Math.random() * 999) + 1
  return `${adjective}${animal}${number}`
}

// Cleanup stale users every 30 seconds
function cleanupStaleUsers() {
  const now = Date.now()
  const staleThreshold = 90000 // 90 seconds
  const activeUsers = globalThis.activeUsers!

  for (const [sessionId, user] of activeUsers.entries()) {
    if (now - user.lastSeen > staleThreshold) {
      console.log(`Cleaning up stale user: ${sessionId}`)
      cleanupUser(sessionId)
    }
  }
}

setInterval(cleanupStaleUsers, 30000)

export async function POST(request: NextRequest) {
  try {
    const { sessionId, gender } = await request.json()

    if (!sessionId || !gender) {
      return NextResponse.json({ success: false, error: "Session ID and gender required" })
    }

    const userName = generateRandomName(gender)
    const now = Date.now()

    const activeUsers = globalThis.activeUsers!
    const waitingQueue = globalThis.waitingQueue!
    const chatPairs = globalThis.chatPairs!

    console.log(`User ${userName} (${gender}, ${sessionId}) joining chat`)

    // Add user to active users with timestamp and gender
    activeUsers.set(sessionId, { sessionId, name: userName, gender, lastSeen: now })

    // Send initial event
    addEventForSession(sessionId, "connected", { sessionId, userName, gender })

    // Try to match with someone from the waiting queue
    if (waitingQueue.length > 0) {
      const partnerId = waitingQueue.shift()!
      const partner = activeUsers.get(partnerId)

      if (partner && !partner.partnerId) {
        console.log(`Matching ${userName} (${gender}) with ${partner.name} (${partner.gender})`)

        // Create chat pair
        chatPairs.set(sessionId, partnerId)
        chatPairs.set(partnerId, sessionId)

        // Update user records with partner info
        activeUsers.set(sessionId, {
          sessionId,
          name: userName,
          gender,
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
          partnerGender: partner.gender,
        })
        addEventForSession(partnerId, "matched", {
          partnerId: sessionId,
          partnerName: userName,
          partnerGender: gender,
        })

        console.log(`Successfully matched ${userName} (${gender}) with ${partner.name} (${partner.gender})`)
      } else {
        // Partner is no longer available, add current user to queue
        waitingQueue.push(sessionId)
        console.log(`Partner not available, added ${userName} to queue`)
      }
    } else {
      // Add to waiting queue
      waitingQueue.push(sessionId)
      console.log(`Added ${userName} to waiting queue`)
    }

    // Broadcast user count update
    setTimeout(broadcastUserCount, 100)

    return NextResponse.json({
      success: true,
      userName,
      gender,
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

  console.log(`Cleaning up user: ${user.name} (${user.gender}, ${sessionId})`)

  // Remove from waiting queue
  const queueIndex = waitingQueue.indexOf(sessionId)
  if (queueIndex > -1) {
    waitingQueue.splice(queueIndex, 1)
    console.log(`Removed ${user.name} from waiting queue`)
  }

  // Handle partner disconnection
  if (user.partnerId) {
    const partnerId = user.partnerId
    const partner = activeUsers.get(partnerId)

    if (partner) {
      console.log(`Notifying partner ${partner.name} about disconnection`)

      // Notify partner about disconnection and end their chat too
      addEventForSession(partnerId, "partner_disconnected", {
        partnerName: user.name,
      })
      addEventForSession(partnerId, "chat_ended", {
        reason: "Partner disconnected",
        partnerName: user.name,
      })

      // Remove partner relationship
      activeUsers.set(partnerId, { ...partner, partnerId: undefined, lastSeen: Date.now() })
      chatPairs.delete(partnerId)

      // Add partner back to waiting queue
      waitingQueue.push(partnerId)
      console.log(`Added partner ${partner.name} back to waiting queue`)
    }

    chatPairs.delete(sessionId)
  }

  // Remove user
  activeUsers.delete(sessionId)

  // Clear events for this session
  clearEventsForSession(sessionId)

  console.log(`Successfully cleaned up user: ${user.name}`)

  // Broadcast updated user count
  setTimeout(broadcastUserCount, 100)
}

// Update user activity
export function updateUserActivity(sessionId: string) {
  const activeUsers = globalThis.activeUsers!
  const user = activeUsers.get(sessionId)

  if (user) {
    activeUsers.set(sessionId, { ...user, lastSeen: Date.now() })
  }
}
