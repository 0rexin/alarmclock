// Menu bar icon: pink dial next to the clock; click opens the app in a popover.
import AppKit
import WebKit

let projectDir = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let localURL = URL(string: "http://localhost:8787/")!
let pagesURL = URL(string: "https://0rexin.github.io/alarmclock/")!

func pinkDial() -> NSImage {
  let img = NSImage(size: NSSize(width: 18, height: 18), flipped: false) { r in
    // same pink as the neighbouring menu bar glyphs, drawn as a line icon
    let pink = NSColor(srgbRed: 0xf1/255, green: 0xb9/255, blue: 0xd8/255, alpha: 1)
    let disc = r.insetBy(dx: 2, dy: 2)
    let ring = NSBezierPath(ovalIn: disc); ring.lineWidth = 1.6
    pink.setStroke(); ring.stroke()
    let c = NSPoint(x: r.midX, y: r.midY), wedge = NSBezierPath()
    wedge.move(to: c)
    wedge.appendArc(withCenter: c, radius: disc.width / 2 - 2.2, startAngle: 90, endAngle: -30, clockwise: true)
    wedge.close()
    pink.setFill()
    wedge.fill()
    return true
  }
  img.isTemplate = false
  return img
}

final class App: NSObject, NSApplicationDelegate {
  let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
  let popover = NSPopover()
  let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 400, height: 720))
  var server: Process?

  func applicationDidFinishLaunching(_ n: Notification) {
    item.button?.image = pinkDial()
    item.button?.toolTip = "Alarmclock"
    item.button?.target = self
    item.button?.action = #selector(click)
    item.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])
    let vc = NSViewController(); vc.view = web
    popover.contentViewController = vc
    popover.contentSize = web.frame.size
    popover.behavior = .transient
    ensureServer { [weak self] ok in self?.web.load(URLRequest(url: ok ? localURL : pagesURL)) }
  }

  // Start the LAN server if nothing answers on 8787, then report whether it is up.
  func ensureServer(_ done: @escaping (Bool) -> Void) {
    ping { up in
      if up { return done(true) }
      let p = Process()
      p.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/bun")
      p.arguments = ["server.ts"]
      p.currentDirectoryURL = projectDir
      let log = projectDir.appendingPathComponent("data/server.log")
      FileManager.default.createFile(atPath: log.path, contents: nil)
      if let h = try? FileHandle(forWritingTo: log) { p.standardOutput = h; p.standardError = h }
      try? p.run(); self.server = p
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self.ping(done) }
    }
  }
  func ping(_ done: @escaping (Bool) -> Void) {
    var r = URLRequest(url: localURL.appendingPathComponent("index.json")); r.timeoutInterval = 1
    URLSession.shared.dataTask(with: r) { _, res, _ in
      DispatchQueue.main.async { done((res as? HTTPURLResponse)?.statusCode == 200) }
    }.resume()
  }

  @objc func click() {
    if NSApp.currentEvent?.type == .rightMouseUp {
      let m = NSMenu()
      m.addItem(withTitle: "Öppna i webbläsaren", action: #selector(openBrowser), keyEquivalent: "").target = self
      m.addItem(withTitle: "Ladda om", action: #selector(reload), keyEquivalent: "r").target = self
      m.addItem(.separator())
      m.addItem(withTitle: "Avsluta Alarmclock", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
      item.menu = m; item.button?.performClick(nil); item.menu = nil
      return
    }
    if popover.isShown { popover.performClose(nil) }
    else if let b = item.button { popover.show(relativeTo: b.bounds, of: b, preferredEdge: .minY); NSApp.activate(ignoringOtherApps: true) }
  }
  @objc func openBrowser() { NSWorkspace.shared.open(web.url ?? pagesURL) }
  @objc func reload() { web.reload() }
  func applicationWillTerminate(_ n: Notification) { server?.terminate() }
}

let app = NSApplication.shared
let delegate = App()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
