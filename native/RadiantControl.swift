// Radiant desktop control helper — CGEvent-based mouse/keyboard/scroll.
// Coordinates are in global display POINTS (top-left origin), matching the
// logical screen size reported by `screensize`. Screenshots are captured by
// the caller via `screencapture` and normalized to that same point space.
//
// Build: swiftc -O native/RadiantControl.swift -o native/radiant-control
// Requires Accessibility permission at runtime to actually deliver events.

import Foundation
import CoreGraphics
import AppKit

let args = CommandLine.arguments
func d(_ i: Int) -> Double { i < args.count ? (Double(args[i]) ?? 0) : 0 }
func post(_ e: CGEvent?) { e?.post(tap: .cghidEventTap) }
let src = CGEventSource(stateID: .combinedSessionState)

func mouseEvent(_ type: CGEventType, _ p: CGPoint, _ button: CGMouseButton, clicks: Int64 = 1) {
    guard let e = CGEvent(mouseEventSource: src, mouseType: type, mouseCursorPosition: p, mouseButton: button) else { return }
    if clicks > 1 { e.setIntegerValueField(.mouseEventClickState, value: clicks) }
    e.post(tap: .cghidEventTap)
}

// name -> virtual keycode for keys that aren't plain characters
let KEYCODES: [String: CGKeyCode] = [
    "return": 36, "enter": 36, "tab": 48, "space": 49, "delete": 51, "backspace": 51,
    "escape": 53, "esc": 53, "left": 123, "right": 124, "down": 125, "up": 126,
    "home": 115, "end": 119, "pageup": 116, "pagedown": 121, "forwarddelete": 117,
    "f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96, "f6": 97, "f7": 98, "f8": 100,
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
    "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "o": 31, "u": 32,
    "i": 34, "p": 35, "l": 37, "j": 38, "k": 40, "n": 45, "m": 46,
    "1": 18, "2": 19, "3": 20, "4": 21, "5": 23, "6": 22, "7": 26, "8": 28, "9": 25, "0": 29
]

func flagsFor(_ mods: [String]) -> CGEventFlags {
    var f = CGEventFlags()
    for m in mods {
        switch m {
        case "cmd", "command", "meta": f.insert(.maskCommand)
        case "shift": f.insert(.maskShift)
        case "alt", "option", "opt": f.insert(.maskAlternate)
        case "ctrl", "control": f.insert(.maskControl)
        default: break
        }
    }
    return f
}

guard args.count >= 2 else { print("usage: radiant-control <cmd> ..."); exit(1) }

switch args[1] {
case "screensize":
    let b = CGDisplayBounds(CGMainDisplayID())
    print("\(Int(b.width)) \(Int(b.height))")

case "move":
    mouseEvent(.mouseMoved, CGPoint(x: d(2), y: d(3)), .left)

case "click", "doubleclick", "rightclick":
    let p = CGPoint(x: d(2), y: d(3))
    let right = args[1] == "rightclick"
    let button: CGMouseButton = right ? .right : .left
    let downT: CGEventType = right ? .rightMouseDown : .leftMouseDown
    let upT: CGEventType = right ? .rightMouseUp : .leftMouseUp
    mouseEvent(.mouseMoved, p, .left)
    let clicks: Int64 = args[1] == "doubleclick" ? 2 : 1
    for i in 1...Int(clicks) {
        mouseEvent(downT, p, button, clicks: Int64(i))
        mouseEvent(upT, p, button, clicks: Int64(i))
    }

case "drag":
    let a = CGPoint(x: d(2), y: d(3)), b = CGPoint(x: d(4), y: d(5))
    mouseEvent(.mouseMoved, a, .left)
    mouseEvent(.leftMouseDown, a, .left)
    // a few intermediate moves so drag registers smoothly
    for t in stride(from: 0.0, through: 1.0, by: 0.2) {
        let p = CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t)
        mouseEvent(.leftMouseDragged, p, .left)
    }
    mouseEvent(.leftMouseUp, b, .left)

case "scroll":
    // scroll dy (positive = up) at optional point
    let dy = Int32(d(4))
    if let e = CGEvent(scrollWheelEvent2Source: src, units: .pixel, wheelCount: 1, wheel1: dy, wheel2: 0, wheel3: 0) {
        e.post(tap: .cghidEventTap)
    }

case "type":
    let text = args.count > 2 ? args[2] : ""
    var utf16 = Array(text.utf16)
    if let down = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: true) {
        down.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: &utf16)
        down.post(tap: .cghidEventTap)
    }
    if let up = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: false) {
        up.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: &utf16)
        up.post(tap: .cghidEventTap)
    }

case "key":
    // e.g. "cmd+c", "shift+tab", "return"
    let spec = (args.count > 2 ? args[2] : "").lowercased()
    let parts = spec.split(separator: "+").map(String.init)
    guard let keyName = parts.last, let code = KEYCODES[keyName] else {
        FileHandle.standardError.write("unknown key: \(spec)\n".data(using: .utf8)!); exit(1)
    }
    let flags = flagsFor(Array(parts.dropLast()))
    if let down = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: true) {
        down.flags = flags; down.post(tap: .cghidEventTap)
    }
    if let up = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: false) {
        up.flags = flags; up.post(tap: .cghidEventTap)
    }

default:
    print("unknown command: \(args[1])"); exit(1)
}
