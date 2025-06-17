"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Send, Users, SkipForward, X, MessageCircle, User, Heart, Sparkles } from "lucide-react"

interface Message {
  id: string
  text: string
  sender: "me" | "stranger" | "system"
  timestamp: number
  senderName?: string
  senderGender?: "male" | "female"
}

type ConnectionStatus = "disconnected" | "connecting" | "waiting" | "connected"
type Gender = "male" | "female"

interface ChatState {
  sessionId: string
  partnerId: string | null
  myName: string
  myGender: Gender | null
  partnerName: string | null
  partnerGender: Gender | null
}

export default function ChatBee() {
  const [showGenderSelection, setShowGenderSelection] = useState(true)
  const [selectedGender, setSelectedGender] = useState<Gender | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected")
  const [chatState, setChatState] = useState<ChatState>({
    sessionId: "",
    partnerId: null,
    myName: "",
    myGender: null,
    partnerName: null,
    partnerGender: null,
  })
  const [onlineUsers, setOnlineUsers] = useState(0)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout>()
  const lastEventIdRef = useRef("0")
  const isActiveRef = useRef(true)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const generateSessionId = () => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36)
  }

  const getGenderColor = (gender: Gender | null) => {
    if (gender === "male") return "text-blue-600"
    if (gender === "female") return "text-pink-600"
    return "text-gray-600"
  }

  const getGenderBadgeColor = (gender: Gender | null) => {
    if (gender === "male") return "bg-blue-100 text-blue-800 border-blue-200"
    if (gender === "female") return "bg-pink-100 text-pink-800 border-pink-200"
    return "bg-gray-100 text-gray-800 border-gray-200"
  }

  const addMessage = useCallback(
    (text: string, sender: "me" | "stranger" | "system", senderName?: string, senderGender?: Gender) => {
      const message: Message = {
        id: Date.now().toString() + Math.random(),
        text,
        sender,
        timestamp: Date.now(),
        senderName,
        senderGender,
      }
      setMessages((prev) => [...prev, message])
    },
    [],
  )

  const handleGenderSelection = (gender: Gender) => {
    setSelectedGender(gender)
    setShowGenderSelection(false)
    setChatState((prev) => ({ ...prev, myGender: gender }))
  }

  const connectToChat = async () => {
    if (!selectedGender) return

    const sessionId = generateSessionId()
    setConnectionStatus("connecting")
    setMessages([])
    setConnectionError(null)
    lastEventIdRef.current = "0"
    isActiveRef.current = true

    try {
      console.log("Attempting to join chat...")

      // Join the chat queue
      const response = await fetch("/api/chat/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, gender: selectedGender }),
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
          myGender: selectedGender,
          partnerName: null,
          partnerGender: null,
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
        if (!isActiveRef.current) return

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
                    partnerGender: event.data.partnerGender,
                  }))
                  addMessage(`Connected with ${event.data.partnerName}! Say hello!`, "system")
                  break

                case "message":
                  console.log("Received message from partner")
                  addMessage(event.data.message, "stranger", event.data.senderName, event.data.senderGender)
                  break

                case "partner_disconnected":
                  console.log("Partner disconnected")
                  setConnectionStatus("waiting")
                  setChatState((prev) => ({
                    ...prev,
                    partnerId: null,
                    partnerName: null,
                    partnerGender: null,
                  }))
                  addMessage(`${event.data.partnerName} has disconnected. Looking for someone new...`, "system")
                  break

                case "chat_ended":
                  console.log("Chat ended by partner")
                  setConnectionStatus("disconnected")
                  setChatState({
                    sessionId: "",
                    partnerId: null,
                    myName: "",
                    myGender: selectedGender,
                    partnerName: null,
                    partnerGender: null,
                  })
                  addMessage(`Chat ended. ${event.data.partnerName} left the conversation.`, "system")
                  // Stop polling
                  if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current)
                  }
                  isActiveRef.current = false
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
          if (isActiveRef.current) {
            setConnectionError("Connection error. Retrying...")
          }
        }
      }

      // Poll every 1 second
      pollingIntervalRef.current = setInterval(pollEvents, 1000)

      // Initial poll
      pollEvents()
    },
    [addMessage, selectedGender],
  )

  const sendMessage = async () => {
    if (!inputMessage.trim() || !chatState.partnerId || connectionStatus !== "connected") return

    const messageText = inputMessage.trim()
    addMessage(messageText, "me", chatState.myName, chatState.myGender || undefined)
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
          senderGender: chatState.myGender,
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
        const response = await fetch("/api/chat/next", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: chatState.sessionId }),
        })

        const data = await response.json()
        if (data.success) {
          setConnectionStatus("waiting")
          setChatState((prev) => ({
            ...prev,
            partnerId: null,
            partnerName: null,
            partnerGender: null,
            myName: data.userName || prev.myName,
          }))
          addMessage("Looking for someone new to chat with...", "system")
          lastEventIdRef.current = "0"
        }
      } catch (error) {
        console.error("Failed to find next chat:", error)
      }
    }
  }

  const endChat = async () => {
    isActiveRef.current = false

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
      myGender: selectedGender,
      partnerName: null,
      partnerGender: null,
    })
    lastEventIdRef.current = "0"
  }

  const resetToGenderSelection = () => {
    endChat()
    setShowGenderSelection(true)
    setSelectedGender(null)
  }

  useEffect(() => {
    return () => {
      isActiveRef.current = false
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

  // Gender Selection Screen
  if (showGenderSelection) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md bg-white/80 backdrop-blur-sm shadow-2xl border-0 overflow-hidden">
          <div className="p-8 text-center">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="relative">
                  <MessageCircle className="w-12 h-12 text-purple-600" />
                  <Sparkles className="w-4 h-4 text-pink-500 absolute -top-1 -right-1" />
                </div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  ChatBee
                </h1>
              </div>
              <p className="text-gray-600 text-lg">Connect with strangers anonymously</p>
              <div className="flex items-center justify-center gap-1 mt-2">
                <Heart className="w-4 h-4 text-red-400" />
                <span className="text-sm text-gray-500">Choose your identity</span>
                <Heart className="w-4 h-4 text-red-400" />
              </div>
            </div>

            {/* Gender Selection */}
            <div className="space-y-4 mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-6">I am a...</h2>

              <div className="grid grid-cols-2 gap-4">
                {/* Male Option */}
                <button
                  onClick={() => handleGenderSelection("male")}
                  className="group relative p-6 rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 transition-all duration-300 hover:scale-105 hover:shadow-lg"
                >
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-bold group-hover:bg-blue-600 transition-colors">
                      ♂
                    </div>
                    <h3 className="text-lg font-semibold text-blue-700 group-hover:text-blue-800">Male</h3>
                    <p className="text-sm text-blue-600 mt-1">Your name will appear in blue</p>
                  </div>
                  <div className="absolute inset-0 rounded-2xl bg-blue-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </button>

                {/* Female Option */}
                <button
                  onClick={() => handleGenderSelection("female")}
                  className="group relative p-6 rounded-2xl border-2 border-pink-200 bg-gradient-to-br from-pink-50 to-pink-100 hover:from-pink-100 hover:to-pink-200 transition-all duration-300 hover:scale-105 hover:shadow-lg"
                >
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-pink-500 flex items-center justify-center text-white text-2xl font-bold group-hover:bg-pink-600 transition-colors">
                      ♀
                    </div>
                    <h3 className="text-lg font-semibold text-pink-700 group-hover:text-pink-800">Female</h3>
                    <p className="text-sm text-pink-600 mt-1">Your name will appear in pink</p>
                  </div>
                  <div className="absolute inset-0 rounded-2xl bg-pink-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-2">This helps personalize your chat experience</p>
              <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                <span>Safe</span>
                <span>•</span>
                <span>Anonymous</span>
                <span>•</span>
                <span>Fun</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  // Main Chat Interface
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-purple-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <MessageCircle className="w-8 h-8 text-purple-600" />
            <h1 className="text-3xl font-bold text-purple-900">ChatBee</h1>
            <Badge className={`ml-2 ${getGenderBadgeColor(chatState.myGender)}`}>
              {chatState.myGender === "male" ? "♂ Male" : "♀ Female"}
            </Badge>
          </div>
          <p className="text-purple-700">Connect with strangers anonymously</p>
          <button
            onClick={resetToGenderSelection}
            className="text-xs text-purple-600 hover:text-purple-800 underline mt-1"
          >
            Change gender
          </button>
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
              {chatState.partnerName && chatState.partnerGender && (
                <span className="text-sm opacity-75">
                  • Chatting with {chatState.partnerGender === "male" ? "♂" : "♀"} {chatState.partnerName}
                </span>
              )}
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
                          <span
                            className={`text-xs font-medium ${
                              message.sender === "me" ? "text-white/75" : getGenderColor(message.senderGender || null)
                            }`}
                          >
                            {message.senderGender === "male" ? "♂" : "♀"} {message.senderName}
                          </span>
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
                    connectionStatus === "connected"
                      ? "Type your message..."
                      : connectionStatus === "waiting"
                        ? "Waiting for someone to connect..."
                        : "Connecting..."
                  }
                  disabled={connectionStatus !== "connected"}
                  className="flex-1"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!inputMessage.trim() || connectionStatus !== "connected"}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>

              {/* Chat Controls */}
              <div className="flex gap-2 justify-center">
                <Button
                  onClick={nextChat}
                  disabled={connectionStatus !== "connected"}
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
