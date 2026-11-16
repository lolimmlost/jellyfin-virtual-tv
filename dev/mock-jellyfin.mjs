// Minimal fake Jellyfin for exercising the stream pipeline without a real server.
// Serves 3 x 40s "episodes" from two shows; the first request for the Parks and
// Rec stream returns 500 to simulate a failed open at a show boundary
// (set FAIL_B1=0 to disable). Usage: node dev/mock-jellyfin.mjs <clip-dir>
import http from "http";
import { spawn } from "child_process";
const dir = process.argv[2];
const T = 40 * 10_000_000;
const items = [
  { Id: "a1", Name: "Pilot", Type: "Episode", SeriesName: "The Office", SeriesId: "so", ParentIndexNumber: 1, IndexNumber: 1, RunTimeTicks: T, Path: "/x/a1" },
  { Id: "b1", Name: "Pilot", Type: "Episode", SeriesName: "Parks and Recreation", SeriesId: "sp", ParentIndexNumber: 1, IndexNumber: 1, RunTimeTicks: T, Path: "/x/b1" },
  { Id: "a2", Name: "Diversity Day", Type: "Episode", SeriesName: "The Office", SeriesId: "so", ParentIndexNumber: 1, IndexNumber: 2, RunTimeTicks: T, Path: "/x/a2" },
];
const fails = { b1: Number(process.env.FAIL_B1 ?? 1) };
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/Items") {
    res.setHeader("content-type", "application/json");
    if (u.searchParams.get("Ids")) return res.end(JSON.stringify({ Items: [{ MediaSources: [{ MediaStreams: [{ Type: "Audio", Index: 1, Language: "eng" }] }] }] }));
    return res.end(JSON.stringify({ Items: items, TotalRecordCount: items.length }));
  }
  const m = u.pathname.match(/^\/Videos\/(\w+)\/stream\.ts$/);
  if (m) {
    const id = m[1];
    const ss = Number(u.searchParams.get("StartTimeTicks") || 0) / 1e7;
    console.log(`[mock] stream ${id} ss=${ss}`);
    if (fails[id] > 0) { fails[id]--; console.log(`[mock] failing ${id}`); res.statusCode = 500; return res.end(); }
    const file = `${dir}/${id.startsWith("a") ? "office" : "parks"}.ts`;
    const ff = spawn("ffmpeg", ["-loglevel", "error", "-ss", String(ss), "-i", file, "-c", "copy", "-f", "mpegts", "pipe:1"]);
    res.setHeader("content-type", "video/mp2t");
    ff.stdout.pipe(res);
    req.on("close", () => ff.kill());
    return;
  }
  res.statusCode = 404; res.end("{}");
}).listen(8096, () => console.log("[mock] up"));
