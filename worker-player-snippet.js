/*
WORKER INTEGRATION
1) In works INSERT add player_type:
   INSERT INTO works (..., media_type, media_url, player_type, ...) VALUES (..., ?, ?, ?, ...)

2) In works UPDATE add:
   player_type = ?

3) In public/admin work SELECT include:
   player_type

4) Validate server-side:
*/
const ALLOWED_PLAYER_TYPES = new Set(["youtube","youtube_nocookie","instagram","html5"]);
function normalizePlayerType(value){
  const p=String(value||"youtube").toLowerCase();
  return ALLOWED_PLAYER_TYPES.has(p)?p:"youtube";
}
/*
Never trust the value from the browser. Use normalizePlayerType()
before writing it to D1.
*/
