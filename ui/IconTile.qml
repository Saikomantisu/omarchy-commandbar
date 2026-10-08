import QtQuick
import qs.Commons

// A row's icon: the app's own image, or a font glyph on a soft tile.
Rectangle {
  id: tileRoot
  property string glyph: ""
  property url imageSource: ""
  property bool selected: false
  property real size: Style.space(30)
  property color foreground: Color.foreground
  property color selectedText: Color.foreground
  property string fontFamily: Style.font.family
  readonly property bool hasImage: String(imageSource) !== ""
  width: size
  height: size
  color: hasImage ? "transparent" : Util.alpha(selected ? selectedText : foreground, selected ? 0.16 : 0.07)

  Image {
    visible: tileRoot.hasImage
    anchors.fill: parent
    sourceSize.width: width * 2
    sourceSize.height: height * 2
    fillMode: Image.PreserveAspectFit
    asynchronous: true
    smooth: true
    source: tileRoot.imageSource
  }

  Text {
    visible: !tileRoot.hasImage
    anchors.centerIn: parent
    text: tileRoot.glyph
    color: tileRoot.selected ? tileRoot.selectedText : tileRoot.foreground
    opacity: tileRoot.selected ? 1 : 0.8
    font.family: tileRoot.fontFamily
    font.pixelSize: Math.round(tileRoot.size * 0.56)
  }
}
