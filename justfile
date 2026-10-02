# LAN server: app + shared state + ICS/JSON feeds
run:
    bun server.ts

# regenerate docs/index.json from docs/cal.js
index:
    bun -e "import {INDEX} from './docs/cal.js'; await Bun.write('docs/index.json', JSON.stringify(INDEX, null, 1))"

# build the pink menu bar app into ~/Applications and start it at login (LaunchAgent)
menubar:
    mkdir -p ~/Applications/Alarmclock.app/Contents/MacOS ~/Applications/Alarmclock.app/Contents/Resources
    swiftc -O "{{justfile_directory()}}/macos/Menubar.swift" -o ~/Applications/Alarmclock.app/Contents/MacOS/Alarmclock
    cp macos/Info.plist ~/Applications/Alarmclock.app/Contents/
    magick -background none docs/icon.png -resize 512x512 /tmp/ac-icon.png && sips -s format icns /tmp/ac-icon.png --out ~/Applications/Alarmclock.app/Contents/Resources/icon.icns >/dev/null
    codesign --force -s - ~/Applications/Alarmclock.app
    cp macos/io.github.0rexin.alarmclock.plist ~/Library/LaunchAgents/
    launchctl bootout gui/$(id -u)/io.github.0rexin.alarmclock 2>/dev/null || true
    launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/io.github.0rexin.alarmclock.plist
