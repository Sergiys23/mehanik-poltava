
// Replace the comment in worker.js with this exact block:
if(u.pathname==="/api/admin/ai" && req.method==="POST"){
  const a=await auth(req,e);
  if(a.error)return J({error:a.error},a.status);
  return adminAI(req,e,a.role);
}
