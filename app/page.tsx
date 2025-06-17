"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Send, Users, SkipForward, X, MessageCircle, User } from "lucide-react"

interface Message {
  id: string
  text: string
  sender: "me" | "stranger" | "system"
  timestamp: number
  senderName?: string
}

type ConnectionStatus = "disconnected" | "connecting" | "waiting" | "connected"

interface ChatState {
  sessionId: string
  partnerId: string | null
  myName: string
  partnerName: string | null
}

export default function ChatBee() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected")
  const [chatState, setChatState] = useState<ChatState>({
    sessionId: "",
    partnerId: null,
    myName: "",
    partnerName: null,
  })
  const [onlineUsers, setOnlineUsers] = useState(0)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout>()
  const lastEventIdRef = useRef("0")

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const generateSessionId = () => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36)
  }

  const addMessage = useCallback((text: string, sender: "me" | "stranger" | "system", senderName?: string) => {
    const message: Message = {
      id: Date.now().toString() + Math.random(),
      text,
      sender,
      timestamp: Date.now(),
      senderName,
    }
    setMessages((prev) => [...prev, message])
  }, [])

  const connectToChat = async () => {
    const sessionId = generateSessionId()
    setConnectionStatus("connecting")
    setMessages([])
    setConnectionError(null)
    lastEventIdRef.current = "0"

    try {
      console.log("Attempting to join chat...")

      // Join the chat queue
      const response = await fetch("/api/chat/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      console.log("Join response:", data)

      if (data.success) {
        setChatState({
          sessionId,
          partnerId: null,
          myName: data.userName,
          partnerName: null,
        })

        setConnectionStatus("waiting")
        addMessage(`You are now ${data.userName}. Looking for someone to chat with...`, "system")

        // Start polling for events
        startPolling(sessionId)
      } else {
        throw new Error(data.error || "Failed to join chat")
      }
    } catch (error) {
      console.error("Failed to connect:", error)
      setConnectionStatus("disconnected")
      setConnectionError(error instanceof Error ? error.message : "Connection failed")
      addMessage("Failed to connect. Please try again.", "system")
    }
  }

  const startPolling = useCallback(
    (sessionId: string) => {
      // Clear any existing polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }

      const pollEvents = async () => {
        try {
          const response = await fetch(`/api/chat/events?sessionId=${sessionId}&lastEventId=${lastEventIdRef.current}`)

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }

          const data = await response.json()

          if (data.success && data.events.length > 0) {
            // Process events
            for (const event of data.events) {
              lastEventIdRef.current = event.id

              switch (event.type) {
                case "connected":
                  console.log("Connected to chat system")
                  setConnectionError(null)
                  break

                case "matched":
                  console.log("Matched with partner:", event.data.partnerName)
                  setConnectionStatus("connected")
                  setChatState((prev) => ({
                    ...prev,
                    partnerId: event.data.partnerId,
                    partnerName: event.data.partnerName,
                  }))
                  addMessage(`Connected with ${event.data.partnerName}! Say hello!`, "system")
                  break

                case "message":
                  console.log("Received message from partner")
                  addMessage(event.data.message, "stranger", event.data.senderName)
                  break

                case "partner_disconnected":
                  console.log("Partner disconnected")
                  setConnectionStatus("waiting")
                  setChatState((prev) => ({
                    ...prev,
                    partnerId: null,
                    partnerName: null,
                  }))
                  addMessage(`${event.data.partnerName} has disconnected. Looking for someone new...`, "system")
                  break

                case "user_count":
                  setOnlineUsers(event.data.count)
                  break

                case "error":
                  console.error("Server error:", event.data.message)
                  addMessage(event.data.message, "system")
                  break

                default:
                  console.log("Unknown event type:", event.type)
              }
            }
          }
        } catch (error) {
          console.error("Polling error:", error)
          setConnectionError("Connection error. Retrying...")
        }
      }

      // Poll every 1 second
      pollingIntervalRef.current = setInterval(pollEvents, 1000)

      // Initial poll
      pollEvents()
    },
    [addMessage],
  )

  const sendMessage = async () => {
    if (!inputMessage.trim() || !chatState.partnerId) return

    const messageText = inputMessage.trim()
    addMessage(messageText, "me", chatState.myName)
    setInputMessage("")

    try {
      const response = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: chatState.sessionId,
          partnerId: chatState.partnerId,
          message: messageText,
          senderName: chatState.myName,
        }),
      })

      const result = await response.json()
      if (!result.success) {
        console.error("Failed to send message:", result.error)
        addMessage("Failed to send message. Please try again.", "system")
      }
    } catch (error) {
      console.error("Failed to send message:", error)
      addMessage("Failed to send message. Please try again.", "system")
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const nextChat = async () => {
    if (chatState.sessionId) {
      try {
        await fetch("/api/chat/next", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: chatState.sessionId }),
        })

        setConnectionStatus("waiting")
        setChatState((prev) => ({
          ...prev,
          partnerId: null,
          partnerName: null,
        }))
        addMessage("Looking for someone new to chat with...", "system")
      } catch (error) {
        console.error("Failed to find next chat:", error)
      }
    }
  }

  const endChat = async () => {
    // Clear polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    if (chatState.sessionId) {
      try {
        await fetch("/api/chat/leave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: chatState.sessionId }),
        })
      } catch (error) {
        console.error("Failed to leave chat:", error)
      }
    }

    setConnectionStatus("disconnected")
    setConnectionError(null)
    setMessages([])
    setChatState({
      sessionId: "",
      partnerId: null,
      myName: "",
      partnerName: null,
    })
    lastEventIdRef.current = "0"
  }

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case "connecting":
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            Connecting...
          </Badge>
        )
      case "waiting":
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            Finding stranger...
          </Badge>
        )
      case "connected":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            Connected to {chatState.partnerName}
          </Badge>
        )
      default:
        return <Badge variant="outline">Disconnected</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-purple-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <MessageCircle className="w-8 h-8 text-purple-600" />
            <h1 className="text-3xl font-bold text-purple-900">ChatBee</h1>
          </div>
          <p className="text-purple-700">Connect with strangers anonymously</p>
        </div>

        {/* Connection Error Alert */}
        {connectionError && (
          <Card className="mb-4 bg-red-50 border-red-200">
            <div className="p-3 text-center">
              <p className="text-sm text-red-700">{connectionError}</p>
            </div>
          </Card>
        )}

        {/* Online Users Box */}
        {onlineUsers > 0 && (
          <Card className="mb-4 bg-white shadow-md border border-purple-200">
            <div className="p-3 text-center">
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-purple-700">
                  {onlineUsers} {onlineUsers === 1 ? "user" : "users"} online
                </span>
              </div>
              <p className="text-xs text-purple-600 mt-1">
                {connectionStatus === "waiting"
                  ? "Looking for someone to chat with..."
                  : connectionStatus === "connected"
                    ? "You're chatting now!"
                    : "Click Start Chat to begin"}
              </p>
            </div>
          </Card>
        )}

        {/* Main Chat Interface */}
        <Card className="bg-white shadow-xl border-0 overflow-hidden">
          {/* Status Bar */}
          <div className="bg-purple-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              <span className="font-medium">{chatState.myName ? `You are ${chatState.myName}` : "Anonymous Chat"}</span>
            </div>
            {getStatusBadge()}
          </div>

          {/* Chat Messages */}
          <div className="h-96 overflow-y-auto p-4 bg-gray-50">
            {connectionStatus === "disconnected" && (
              <div className="text-center py-16">
                <MessageCircle className="w-16 h-16 text-purple-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">Welcome to ChatBee</h3>
                <p className="text-gray-500 mb-6">Click "Start Chat" to connect with a random stranger</p>
                <Button onClick={connectToChat} className="bg-purple-600 hover:bg-purple-700" size="lg">
                  Start Chat
                </Button>
              </div>
            )}

            {connectionStatus !== "disconnected" && (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.sender === "me"
                        ? "justify-end"
                        : message.sender === "system"
                          ? "justify-center"
                          : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.sender === "me"
                          ? "bg-purple-600 text-white"
                          : message.sender === "system"
                            ? "bg-gray-200 text-gray-700 text-sm"
                            : "bg-white border border-gray-200 text-gray-800"
                      }`}
                    >
                      {message.sender !== "system" && message.senderName && (
                        <div className="flex items-center gap-1 mb-1">
                          <User className="w-3 h-3" />
                          <span className="text-xs opacity-75">{message.senderName}</span>
                        </div>
                      )}
                      <p className="text-sm">{message.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Message Input */}
          {connectionStatus !== "disconnected" && (
            <div className="p-4 border-t bg-white">
              <div className="flex gap-2 mb-3">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={
                    chatState.partnerId
                      ? "Type your message..."
                      : connectionStatus === "waiting"
                        ? "Waiting for someone to connect..."
                        : "Connecting..."
                  }
                  disabled={!chatState.partnerId}
                  className="flex-1"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!inputMessage.trim() || !chatState.partnerId}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>

              {/* Chat Controls */}
              <div className="flex gap-2 justify-center">
                <Button
                  onClick={nextChat}
                  disabled={!chatState.partnerId}
                  variant="outline"
                  size="sm"
                  className="border-purple-200 text-purple-600 hover:bg-purple-50"
                >
                  <SkipForward className="w-4 h-4 mr-1" />
                  Next
                </Button>
                <Button
                  onClick={endChat}
                  variant="outline"
                  size="sm"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                >
                  <X className="w-4 h-4 mr-1" />
                  End Chat
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-purple-600">
          <p>Stay safe online. Don't share personal information.</p>
        </div>
      </div>
    </div>
  )
}
