import QtQuick
import qs.Commons

// Under the results: the selected row's group on the left, and on the right
// the keys that act on it (Esc to go back, Tab to fill in, Enter).
Item {
  id: footer
  required property var bar
  readonly property var row: bar.selectedRow
  readonly property bool canComplete: bar.canComplete(row)

  height: bar.footerHeight

  Rectangle {
    anchors.top: parent.top
    width: parent.width
    height: 1
    color: footer.bar.foreground
    opacity: 0.1
  }

  Row {
    anchors.left: parent.left
    anchors.leftMargin: Style.space(4)
    anchors.verticalCenter: parent.verticalCenter
    anchors.verticalCenterOffset: 1
    spacing: Style.space(6)

    Text {
      anchors.verticalCenter: parent.verticalCenter
      text: footer.row ? (footer.row.help ? "Help" : (footer.row.group || footer.row.providerName || "")) : ""
      color: footer.bar.foreground
      opacity: 0.5
      font.family: footer.bar.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  Row {
    anchors.right: parent.right
    anchors.rightMargin: Style.space(4)
    anchors.verticalCenter: parent.verticalCenter
    anchors.verticalCenterOffset: 1
    spacing: Style.space(6)

    Text {
      visible: footer.bar.inHelpTopic
      anchors.verticalCenter: parent.verticalCenter
      text: "Back"
      color: footer.bar.foreground
      opacity: 0.55
      font.family: footer.bar.fontFamily
      font.pixelSize: Style.font.caption
    }
    Keycap { visible: footer.bar.inHelpTopic; label: "Esc"; anchors.verticalCenter: parent.verticalCenter; foreground: footer.bar.foreground; fontFamily: footer.bar.fontFamily; rounded: footer.bar.cornerRadius > 0 }
    Item { visible: footer.bar.inHelpTopic; width: Style.space(8); height: 1 }

    Text {
      visible: footer.canComplete
      anchors.verticalCenter: parent.verticalCenter
      text: "Fill in"
      color: footer.bar.foreground
      opacity: 0.55
      font.family: footer.bar.fontFamily
      font.pixelSize: Style.font.caption
    }
    Keycap { visible: footer.canComplete; label: "Tab"; anchors.verticalCenter: parent.verticalCenter; foreground: footer.bar.foreground; fontFamily: footer.bar.fontFamily; rounded: footer.bar.cornerRadius > 0 }

    Item { visible: footer.canComplete; width: Style.space(8); height: 1 }

    Text {
      id: primary
      visible: text !== ""
      anchors.verticalCenter: parent.verticalCenter
      text: footer.bar.actionLabel(footer.row)
      color: footer.bar.foreground
      opacity: 0.85
      font.family: footer.bar.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }
    Keycap { visible: primary.text !== ""; label: "↵"; anchors.verticalCenter: parent.verticalCenter; foreground: footer.bar.foreground; fontFamily: footer.bar.fontFamily; rounded: footer.bar.cornerRadius > 0 }
  }
}
