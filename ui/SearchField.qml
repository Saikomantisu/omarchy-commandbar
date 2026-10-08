import QtQuick
import qs.Commons

// The search input, with the mode chip a prefix puts up (Emoji, Windows,
// Search Google…) or, while it's empty, the "? for help" hint. The keys
// that move the selection and act on rows are handled here.
Item {
  id: field
  required property var bar
  property alias input: textInput

  height: bar.inputHeight

  Text {
    id: promptGlyph
    anchors.left: parent.left
    anchors.leftMargin: Style.space(4)
    anchors.verticalCenter: parent.verticalCenter
    text: "󰍉"
    color: field.bar.foreground
    opacity: 0.55
    font.family: field.bar.fontFamily
    font.pixelSize: Math.round(field.bar.inputFont * 1.05)
  }

  TextInput {
    id: textInput
    anchors.left: promptGlyph.right
    anchors.leftMargin: Style.spacing.md
    anchors.right: modeChip.visible ? modeChip.left : (helpHint.visible ? helpHint.left : parent.right)
    anchors.rightMargin: Style.spacing.md
    anchors.verticalCenter: parent.verticalCenter
    color: field.bar.foreground
    selectionColor: field.bar.selectedBackground
    selectedTextColor: field.bar.selectedText
    font.family: field.bar.fontFamily
    font.pixelSize: field.bar.inputFont
    clip: true
    focus: true
    onTextChanged: {
      field.bar.selectedIndex = 0
      field.bar.recompute()
    }

    Text {
      anchors.fill: parent
      verticalAlignment: Text.AlignVCenter
      visible: !textInput.text
      text: "Search apps and windows, or type a sum"
      color: field.bar.foreground
      opacity: 0.4
      font: textInput.font
      elide: Text.ElideRight
    }

    Keys.priority: Keys.BeforeItem
    Keys.onPressed: function(event) {
      var bar = field.bar
      if (event.key === Qt.Key_Escape) {
        if (bar.inHelpTopic) bar.helpBack()
        else if (textInput.text) textInput.text = ""
        else bar.dismiss()
        event.accepted = true
      } else if (event.key === Qt.Key_Down || (event.key === Qt.Key_N && event.modifiers & Qt.ControlModifier)) {
        bar.move(1); event.accepted = true
      } else if (event.key === Qt.Key_Up || (event.key === Qt.Key_P && event.modifiers & Qt.ControlModifier)) {
        bar.move(-1); event.accepted = true
      } else if (event.key === Qt.Key_Backspace && bar.inHelpTopic && !textInput.selectedText
                 && /^\s*\?[a-z]+$/.test(textInput.text) && bar.showingHelp && !!bar.rows[0].helpTopic
                 && textInput.cursorPosition === textInput.text.length) {
        bar.helpBack(); event.accepted = true
      } else if (event.key === Qt.Key_Tab) {
        var row = bar.rows[bar.selectedIndex]
        if (row) bar.complete(row)
        event.accepted = true
      } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
        bar.activate(bar.selectedIndex); event.accepted = true
      } else if ((event.modifiers & Qt.AltModifier) && event.key >= Qt.Key_1 && event.key <= Qt.Key_9) {
        var quick = event.key - Qt.Key_1
        if (quick < Math.min(bar.quickKeys, bar.rows.length)) { bar.selectedIndex = quick; bar.activate(quick) }
        event.accepted = true
      }
    }
  }

  Rectangle {
    id: modeChip
    visible: !!field.bar.mode
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    implicitWidth: chipRow.implicitWidth + Style.space(16)
    implicitHeight: chipRow.implicitHeight + Style.space(8)
    width: implicitWidth
    height: implicitHeight
    radius: field.bar.cornerRadius > 0 ? height / 2 : 0
    color: field.bar.selectedBackground

    Row {
      id: chipRow
      anchors.centerIn: parent
      spacing: Style.space(6)

      Text {
        anchors.verticalCenter: parent.verticalCenter
        text: field.bar.mode ? (field.bar.mode.icon || "") : ""
        visible: text !== ""
        color: field.bar.selectedText
        font.family: field.bar.fontFamily
        font.pixelSize: Style.font.body
      }

      Text {
        anchors.verticalCenter: parent.verticalCenter
        text: field.bar.mode ? field.bar.mode.label : ""
        color: field.bar.selectedText
        font.family: field.bar.fontFamily
        font.pixelSize: Style.font.bodySmall
        font.bold: true
      }
    }
  }

  Row {
    id: helpHint
    visible: !field.bar.mode && !textInput.text
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.space(6)

    Keycap { label: "?"; anchors.verticalCenter: parent.verticalCenter; foreground: field.bar.foreground; fontFamily: field.bar.fontFamily; rounded: field.bar.cornerRadius > 0 }
    Text {
      anchors.verticalCenter: parent.verticalCenter
      text: "for help"
      color: field.bar.foreground
      opacity: 0.45
      font.family: field.bar.fontFamily
      font.pixelSize: Style.font.caption
    }
  }
}
