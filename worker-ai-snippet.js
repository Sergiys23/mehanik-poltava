
/*
 * MEHANIK POLTAVA — Cloudflare Workers AI module
 * Insert this code into worker.js.
 *
 * Existing worker already provides:
 *   J(), auth(), audit(), and api().
 *
 * The endpoint is admin-only and never exposes the AI binding to the browser.
 */

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

function aiText(result) {
  if (!result) return "";
  if (typeof result === "string") return result.trim();
  return String(result.response ?? result.text ?? result.output_text ?? "").trim();
}

async function aiRun(e, prompt) {
  if (!e.AI || typeof e.AI.run !== "function") {
    throw new Error("Workers AI binding AI is not configured");
  }

  const result = await e.AI.run(AI_MODEL, {
    prompt,
    max_tokens: 500,
    temperature: 0.2
  });

  const text = aiText(result);
  if (!text) throw new Error("AI не повернув відповідь");
  return text;
}

async function adminAI(req, e, actor) {
  let b;
  try { b = await req.json(); }
  catch { return J({ error: "Некоректний запит" }, 400); }

  const task = String(b.task || "").trim();
  if (!task) return J({ error: "Вкажіть завдання для AI" }, 400);
  if (task.length > 6000) return J({ error: "Запит занадто великий" }, 413);

  const system = `
Ти внутрішній AI-помічник СТО «Механік Полтава».
Відповідай українською, стисло і по суті.
Не вигадуй ціни, факти, діагнози або нормативи, яких немає у вхідних даних.
Ти лише радник для адміністратора. Не приймай остаточних рішень щодо ремонту.
Якщо бракує даних, прямо скажи, яких саме.
`.trim();

  try {
    const answer = await aiRun(e, `${system}\n\nЗавдання адміністратора:\n${task}`);
    await audit(e.DB, actor, "ai_assist", "ai", task.slice(0, 500));
    return J({ ok: true, answer, model: AI_MODEL });
  } catch (err) {
    console.error("AI error", err);
    return J({
      error: "AI тимчасово недоступний",
      detail: String(err?.message || err)
    }, 503);
  }
}

/*
 * Add this route inside api(), BEFORE the generic /api/admin/ route
 * or inside it, as shown below:
 *
 * if(u.pathname==="/api/admin/ai" && req.method==="POST"){
 *   const a=await auth(req,e);
 *   if(a.error)return J({error:a.error},a.status);
 *   return adminAI(req,e,a.role);
 * }
 */
