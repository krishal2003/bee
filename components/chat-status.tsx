import { Badge } from "@/components/ui/badge"
import { Users, Wifi, WifiOff, Clock } from "lucide-react"

interface ChatStatusProps {
  status: "disconnected" | "connecting" | "waiting" | "connected"
  userCount?: number
}

export function ChatStatus({ status, userCount }: ChatStatusProps) {
  const getStatusConfig = () => {
    switch (status) {
      case "connecting":
        return {
          icon: Clock,
          text: "Connecting...",
          className: "bg-yellow-100 text-yellow-800 border-yellow-200",
        }
      case "waiting":
        return {
          icon: Users,
          text: "Finding stranger...",
          className: "bg-blue-100 text-blue-800 border-blue-200",
        }
      case "connected":
        return {
          icon: Wifi,
          text: "Connected",
          className: "bg-green-100 text-green-800 border-green-200",
        }
      default:
        return {
          icon: WifiOff,
          text: "Disconnected",
          className: "bg-gray-100 text-gray-800 border-gray-200",
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={config.className}>
        <Icon className="w-3 h-3 mr-1" />
        {config.text}
      </Badge>
      {userCount && <span className="text-sm text-gray-500">{userCount} users online</span>}
    </div>
  )
}
