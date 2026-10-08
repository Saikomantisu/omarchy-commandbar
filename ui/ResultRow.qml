import Quickshell
import QtQuick
import qs.Commons

// One result in the list. The first row of each group carries its label
// (Windows, Apps…), drawn above the row, outside the selectable area.
Item {
  id: rowItem
  required property var bar
  required property int index
  required property var modelData
  readonly property bool selected: index === bar.selectedIndex
  readonly property bool hero: !!modelData.hero
  readonly property string section: modelData.section || ""

  height: bar.rowSize(modelData)

  function iconSource(icon) {
    var value = String(icon || "")
    if (value.charAt(0) === "/") return "file://" + value
    var themed = value ? Quickshell.iconPath(value, true) : ""
    return themed || Quickshell.iconPath("application-x-executable", true)
  }

  Text {
    visible: rowItem.section !== ""
    anchors.left: parent.left
    anchors.leftMargin: Style.spacing.md
    anchors.top: parent.top
    height: rowItem.bar.sectionHeight
    verticalAlignment: Text.AlignVCenter
    text: rowItem.section
    color: rowItem.bar.foreground
    opacity: 0.5
    font.family: rowItem.bar.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: true
    font.letterSpacing: 0.4
  }

  Rectangle {
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.bottom: parent.bottom
    height: rowItem.hero ? rowItem.bar.heroHeight : rowItem.bar.rowHeight
    radius: rowItem.bar.cornerRadius > 0 ? Style.space(8) : 0
    color: rowItem.selected ? rowItem.bar.selectedBackground : "transparent"
    Behavior on color { ColorAnimation { duration: 80 } }

    IconTile {
      id: tile
      anchors.left: parent.left
      anchors.leftMargin: Style.spacing.md
      anchors.verticalCenter: parent.verticalCenter
      glyph: rowItem.modelData.icon || ""
      imageSource: rowItem.modelData.image ? rowItem.iconSource(rowItem.modelData.image) : ""
      selected: rowItem.selected
      size: rowItem.hero ? Math.round(rowItem.bar.tileSize * 1.4) : rowItem.bar.tileSize
      radius: rowItem.bar.tileRadius
      foreground: rowItem.bar.foreground
      selectedText: rowItem.bar.selectedText
      fontFamily: rowItem.bar.fontFamily
    }

    Column {
      anchors.left: tile.right
      anchors.leftMargin: Style.spacing.md
      anchors.right: quickKey.visible ? quickKey.left : parent.right
      anchors.rightMargin: Style.spacing.md
      anchors.verticalCenter: parent.verticalCenter
      spacing: rowItem.hero ? Style.space(4) : Style.space(2)

      Text {
        width: parent.width
        textFormat: Text.PlainText
        text: rowItem.modelData.title
        color: rowItem.selected ? rowItem.bar.selectedText : rowItem.bar.foreground
        font.family: rowItem.bar.fontFamily
        font.pixelSize: rowItem.hero ? Style.font.displayLarge : Style.font.subtitle
        font.bold: rowItem.hero
        elide: Text.ElideRight
      }

      Text {
        width: parent.width
        visible: text !== ""
        textFormat: Text.PlainText
        text: rowItem.modelData.subtitle || ""
        color: rowItem.selected ? rowItem.bar.selectedText : rowItem.bar.foreground
        opacity: rowItem.selected ? 0.7 : 0.5
        font.family: rowItem.bar.fontFamily
        font.pixelSize: Style.font.bodySmall
        elide: Text.ElideRight
      }
    }

    Keycap {
      id: quickKey
      visible: rowItem.index < rowItem.bar.quickKeys
      anchors.right: parent.right
      anchors.rightMargin: Style.spacing.md
      anchors.verticalCenter: parent.verticalCenter
      label: "Alt+" + (rowItem.index + 1)
      foreground: rowItem.selected ? rowItem.bar.selectedText : rowItem.bar.foreground
      fontFamily: rowItem.bar.fontFamily
      rounded: rowItem.bar.cornerRadius > 0
      opacity: rowItem.selected ? 0.9 : 0.6
    }

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      // Only real pointer movement selects: rows that slide under a
      // resting cursor (the card growing, the list re-rendering)
      // report positions too, but the window position stays put.
      onPositionChanged: function(mouse) {
        var bar = rowItem.bar
        var p = mapToItem(null, mouse.x, mouse.y)
        if (p.x === bar.lastPointer.x && p.y === bar.lastPointer.y) return
        var first = bar.lastPointer.x < 0
        bar.lastPointer = Qt.point(p.x, p.y)
        if (!first) bar.selectedIndex = rowItem.index
      }
      onClicked: {
        rowItem.bar.selectedIndex = rowItem.index
        rowItem.bar.activate(rowItem.index)
        rowItem.bar.input.forceActiveFocus()
      }
    }
  }
}
