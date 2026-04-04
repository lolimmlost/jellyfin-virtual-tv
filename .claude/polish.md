# Auto-Polish Config

## budget
3

## max-turns
30

## diagnostics
npm run build 2>&1 | tail -10
curl -sf http://localhost:3336/health/detailed
npx tsc --noEmit 2>&1 | tail -20

## focus
- Fix any TypeScript errors or warnings from diagnostics
- Review error patterns in health/detailed stream stats — fix root causes
- Investigate empty channels and fix their filters
- Improve error handling around Jellyfin API calls and ffmpeg spawns
- Address TODO/FIXME comments in the codebase
- Clean up dead code and unused imports

## constraints
- Do not modify the database schema
- Do not change M3U or XMLTV output format (Jellyfin depends on it)
- Do not add new npm dependencies without clear justification
- Do not modify docker-compose.yaml or Dockerfile
- Do not change the streaming pipeline (ffmpeg args) without explaining why
- Always ensure `npm run build` passes after changes

## test-command
npm run build

## branch-prefix
auto-polish
