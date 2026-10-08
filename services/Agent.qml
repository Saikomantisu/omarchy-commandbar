import Quickshell.Io
import QtQuick

// Omarchy's default agent, asked of `omarchy-default-agent` (the same answer
// Omarchy's launcher uses) at startup and on every open. The shell never opens
// the file itself: at most 64 bytes of the answer come back, and
// providers/ai.js accepts only an agent-like name.
Item {
  id: agent
  property string name: ""          // claude, codex, …; "" until one is picked

  signal updated()

  function refresh() {
    if (!proc.running) proc.running = true
  }

  Component.onCompleted: agent.refresh()

  Process {
    id: proc
    command: ["bash", "-c", "timeout 2 omarchy-default-agent 2>/dev/null | head -c 64"]
    stdout: StdioCollector { id: out; waitForEnd: true }
    onExited: {
      var next = (String(out.text || "").split("\n")[0] || "").trim()
      if (next === agent.name) return
      agent.name = next
      agent.updated()
    }
  }
}
