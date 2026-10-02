# LAN server: app + shared state + ICS/JSON feeds
run:
    bun server.ts

# regenerate docs/index.json from docs/cal.js
index:
    bun -e "import {INDEX} from './docs/cal.js'; await Bun.write('docs/index.json', JSON.stringify(INDEX, null, 1))"
