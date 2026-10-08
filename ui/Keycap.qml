import QtQuick
import qs.Commons

// A key drawn as a small keycap, for the footer hints and the Alt+N shortcuts.
Rectangle {
  id: cap
  property string label: ""
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  property bool rounded: true
  implicitWidth: Math.max(implicitHeight, capText.implicitWidth + Style.space(10))
  implicitHeight: capText.implicitHeight + Style.space(4)
  radius: rounded ? Style.space(4) : 0
  color: Util.alpha(cap.foreground, 0.08)
  border.width: 1
  border.color: Util.alpha(cap.foreground, 0.18)

  Text {
    id: capText
    anchors.centerIn: parent
    text: cap.label
    color: cap.foreground
    opacity: 0.8
    font.family: cap.fontFamily
    font.pixelSize: Style.font.caption
  }
}
