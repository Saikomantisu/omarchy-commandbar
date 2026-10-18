import Quickshell.Io
import QtQuick

// Random UUIDs from the kernel's secure generator (/proc/sys/kernel/random/uuid),
// since Math.random isn't fit for something you might use as a secret. One is
// kept ready so "uuid" answers at once; taking it asks for the next.
Item {
  id: uuids
  property string next: ""

  signal updated()

  function request() {
    uuids.next = ""
    if (!proc.running) proc.running = true
  }

  Process {
    id: proc
    // The file is 37 bytes; head keeps the read bounded all the same.
    command: ["head", "-c", "64", "/proc/sys/kernel/random/uuid"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var id = String(text || "").trim()
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) uuids.next = id
        uuids.updated()
      }
    }
  }

  Component.onCompleted: proc.running = true
}
