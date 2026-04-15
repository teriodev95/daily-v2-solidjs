import { drizzle } from 'drizzle-orm/d1';
import { eq, or, and } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Env } from '../types';

interface LibrarianResult {
  summary: string;
  suggestedTags: string[];
  suggestedLinks: { title: string; reason: string }[];
}

const SYSTEM_PROMPT = `Eres un bibliotecario de wiki. Analiza el artículo y devuelve JSON estricto:
{ "summary": "resumen en 2 líneas máximo", "suggestedTags": ["tag1", "tag2"] (max 5, lowercase), "suggestedLinks": [{ "title": "Título exacto", "reason": "razón breve" }] }
Solo sugiere links a títulos que existan en la lista proporcionada. Responde SOLO JSON válido.`;

function buildUserMessage(title: string, content: string, existingTitles: string[]): string {
  return `Artículo: "${title}"

Contenido:
${content}

Títulos existentes en la wiki (solo sugiere links a estos):
${existingTitles.length > 0 ? existingTitles.map(t => `- ${t}`).join('\n') : '(ninguno)'}`;
}

function parseResult(raw: string): LibrarianResult {
  // Try to extract JSON from the response (might be wrapped in markdown code blocks)
  let jsonStr = raw.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  const parsed = JSON.parse(jsonStr);

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : '',
    suggestedTags: Array.isArray(parsed.suggestedTags)
      ? parsed.suggestedTags.filter((t: unknown) => typeof t === 'string').slice(0, 5).map((t: string) => t.toLowerCase())
      : [],
    suggestedLinks: Array.isArray(parsed.suggestedLinks)
      ? parsed.suggestedLinks
          .filter((l: any) => typeof l.title === 'string' && typeof l.reason === 'string')
          .slice(0, 10)
          .map((l: any) => ({ title: l.title, reason: l.reason }))
      : [],
  };
}

async function callDeepSeek(content: string, title: string, existingTitles: string[], env: Env): Promise<LibrarianResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(title, content, existingTitles) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DeepSeek API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json() as any;
    const text = data.choices?.[0]?.message?.content ?? '';
    return parseResult(text);
  } finally {
    clearTimeout(timeout);
  }
}

async function callWorkersAI(content: string, title: string, existingTitles: string[], env: Env): Promise<LibrarianResult> {
  const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast' as any, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(title, content, existingTitles) },
    ],
    max_tokens: 1024,
    temperature: 0.3,
  });

  const text = (response as any).response ?? '';
  return parseResult(text);
}

export async function analyzeArticle(
  content: string,
  title: string,
  existingTitles: string[],
  env: Env,
): Promise<LibrarianResult> {
  // Primary: DeepSeek
  if (env.DEEPSEEK_API_KEY) {
    try {
      return await callDeepSeek(content, title, existingTitles, env);
    } catch (err) {
      console.error('DeepSeek failed, falling back to Workers AI:', (err as Error).message);
    }
  }

  // Fallback: Workers AI
  try {
    return await callWorkersAI(content, title, existingTitles, env);
  } catch (err) {
    console.error('Workers AI also failed:', (err as Error).message);
    throw new Error(`All AI providers failed. Last error: ${(err as Error).message}`);
  }
}

export async function processLibrarianQueue(env: Env): Promise<{ processed: number; errors: number }> {
  const db = drizzle(env.DB, { schema });
  let processed = 0;
  let errors = 0;

  // 1. Get pending and error articles (retries < 3)
  const pending = await db
    .select()
    .from(schema.wikiArticles)
    .where(or(
      eq(schema.wikiArticles.librarian_status, 'pending'),
      eq(schema.wikiArticles.librarian_status, 'error'),
    ))
    .limit(20);

  // Filter retries < 3 in JS (D1/drizzle lt operator can be tricky)
  const eligible = pending.filter(a => a.librarian_retries < 3 && a.title !== '_Índice' && !a.is_archived).slice(0, 10);

  if (eligible.length === 0) return { processed: 0, errors: 0 };

  // 2. Get all article titles grouped by project_id (include all statuses so new articles are linkable)
  const allArticles = await db
    .select({ id: schema.wikiArticles.id, title: schema.wikiArticles.title, project_id: schema.wikiArticles.project_id })
    .from(schema.wikiArticles);

  const titlesByProject = new Map<string, string[]>();
  for (const a of allArticles) {
    const list = titlesByProject.get(a.project_id) ?? [];
    list.push(a.title);
    titlesByProject.set(a.project_id, list);
  }

  // 3. Process each article sequentially
  for (const article of eligible) {
    try {
      // Mark as processing
      await db
        .update(schema.wikiArticles)
        .set({ librarian_status: 'processing' } as any)
        .where(eq(schema.wikiArticles.id, article.id));

      // Skip empty articles
      if (!article.content?.trim()) {
        await db
          .update(schema.wikiArticles)
          .set({
            librarian_status: 'done',
            summary: '',
            suggested_tags: '[]',
            suggested_links: '[]',
            librarian_error: '',
          } as any)
          .where(eq(schema.wikiArticles.id, article.id));
        processed++;
        continue;
      }

      const existingTitles = (titlesByProject.get(article.project_id) ?? [])
        .filter(t => t.toLowerCase() !== article.title.toLowerCase());

      const result = await analyzeArticle(article.content, article.title, existingTitles, env);

      // Check team's librarian mode
      const [modeConfig] = await db.select().from(schema.configs)
        .where(and(
          eq(schema.configs.team_id, article.team_id),
          eq(schema.configs.key, 'librarian_mode'),
        ))
        .limit(1);
      const librarianMode = modeConfig?.value ?? 'auto';

      if (librarianMode === 'auto') {
        // Auto mode: apply tags directly, keep links as reference
        const existingTags: string[] = JSON.parse(article.tags || '[]');
        const mergedTags = [...new Set([...existingTags, ...result.suggestedTags])];

        await db.update(schema.wikiArticles).set({
          summary: result.summary,
          tags: JSON.stringify(mergedTags),
          suggested_tags: '[]',  // cleared — already applied
          suggested_links: JSON.stringify(result.suggestedLinks),  // kept as reference
          librarian_status: 'done',
          librarian_error: '',
        } as any).where(eq(schema.wikiArticles.id, article.id));
      } else {
        // Approval mode: store as suggestions (existing behavior)
        await db.update(schema.wikiArticles).set({
          summary: result.summary,
          suggested_tags: JSON.stringify(result.suggestedTags),
          suggested_links: JSON.stringify(result.suggestedLinks),
          librarian_status: 'done',
          librarian_error: '',
        } as any).where(eq(schema.wikiArticles.id, article.id));
      }

      processed++;
    } catch (err) {
      errors++;
      const message = (err as Error).message?.slice(0, 500) ?? 'Unknown error';
      await db
        .update(schema.wikiArticles)
        .set({
          librarian_status: 'error',
          librarian_error: message,
          librarian_retries: article.librarian_retries + 1,
        } as any)
        .where(eq(schema.wikiArticles.id, article.id));
    }
  }

  // After processing, regenerate the index for each affected project
  if (processed > 0) {
    const projectIds = new Set(eligible.map(a => a.project_id));
    for (const pid of projectIds) {
      try {
        const sample = eligible.find(a => a.project_id === pid)!;
        await generateProjectIndex(env, pid, sample.team_id, sample.created_by);
      } catch (err) {
        console.error(`Failed to generate index for project ${pid}:`, (err as Error).message);
      }
    }
  }

  return { processed, errors };
}

export async function generateProjectIndex(env: Env, projectId: string, teamId: string, createdBy: string): Promise<void> {
  const db = drizzle(env.DB, { schema });

  // Get all articles in the project
  const articles = await db.select().from(schema.wikiArticles)
    .where(and(
      eq(schema.wikiArticles.project_id, projectId),
      eq(schema.wikiArticles.team_id, teamId),
    ));

  const nonIndex = articles.filter(a => a.title !== '_Índice' && !a.is_archived);
  const indexArticle = articles.find(a => a.title === '_Índice');

  // Build the markdown content
  let content = '';

  // 1. Stats
  const total = nonIndex.length;
  const processed = nonIndex.filter(a => a.librarian_status === 'done').length;
  const pending = nonIndex.filter(a => a.librarian_status === 'pending' || a.librarian_status === 'processing').length;
  const errored = nonIndex.filter(a => a.librarian_status === 'error').length;

  content += `> **${total}** artículos · **${processed}** analizados · **${pending}** pendientes${errored > 0 ? ` · **${errored}** con error` : ''}\n\n`;

  // 2. Group by tags
  const tagMap = new Map<string, { title: string; summary: string }[]>();
  const untagged: { title: string; summary: string }[] = [];

  for (const a of nonIndex) {
    const tags: string[] = JSON.parse(a.tags || '[]');
    const entry = { title: a.title, summary: a.summary || '' };

    if (tags.length === 0) {
      untagged.push(entry);
    } else {
      for (const tag of tags) {
        const list = tagMap.get(tag) ?? [];
        list.push(entry);
        tagMap.set(tag, list);
      }
    }
  }

  // Sort tags alphabetically
  const sortedTags = [...tagMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  for (const [tag, entries] of sortedTags) {
    content += `## ${tag}\n\n`;
    for (const e of entries.sort((a, b) => a.title.localeCompare(b.title))) {
      content += `- [[${e.title}]]`;
      if (e.summary) content += ` — ${e.summary.split('\n')[0].slice(0, 100)}`;
      content += '\n';
    }
    content += '\n';
  }

  if (untagged.length > 0) {
    content += `## Sin categoría\n\n`;
    for (const e of untagged.sort((a, b) => a.title.localeCompare(b.title))) {
      content += `- [[${e.title}]]`;
      if (e.summary) content += ` — ${e.summary.split('\n')[0].slice(0, 100)}`;
      content += '\n';
    }
    content += '\n';
  }

  // 3. Orphan detection (no incoming or outgoing links)
  const titleSet = new Set(nonIndex.map(a => a.title.toLowerCase()));

  const hasOutgoing = new Set<string>();
  const hasIncoming = new Set<string>();

  for (const a of nonIndex) {
    let match;
    const re = /\[\[(.+?)(?:\|.+?)?\]\]/g;
    while ((match = re.exec(a.content || '')) !== null) {
      const targetLower = match[1].toLowerCase();
      if (titleSet.has(targetLower)) {
        hasOutgoing.add(a.title.toLowerCase());
        hasIncoming.add(targetLower);
      }
    }
  }

  const orphans = nonIndex.filter(a =>
    !hasOutgoing.has(a.title.toLowerCase()) && !hasIncoming.has(a.title.toLowerCase())
  );

  if (orphans.length > 0) {
    content += `## Artículos huérfanos\n\n`;
    content += `> Sin enlaces entrantes ni salientes\n\n`;
    for (const o of orphans) {
      content += `- [[${o.title}]]\n`;
    }
    content += '\n';
  }

  // 4. Recently updated (last 5)
  const recent = [...nonIndex]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5);

  if (recent.length > 0) {
    content += `## Actualizaciones recientes\n\n`;
    for (const r of recent) {
      const date = r.updated_at.split('T')[0];
      content += `- [[${r.title}]] · ${date}\n`;
    }
    content += '\n';
  }

  const now = new Date().toISOString();
  content = `*Actualizado: ${now.split('T')[0]} ${now.split('T')[1].slice(0, 5)}*\n\n` + content;

  // Upsert the _Índice article
  if (indexArticle) {
    await db.update(schema.wikiArticles)
      .set({
        content,
        tags: JSON.stringify(['_índice']),
        summary: `Índice automático: ${total} artículos, ${processed} analizados`,
        librarian_status: 'done',
        librarian_error: '',
        updated_at: now,
      } as any)
      .where(eq(schema.wikiArticles.id, indexArticle.id));
  } else {
    await db.insert(schema.wikiArticles).values({
      id: crypto.randomUUID(),
      project_id: projectId,
      team_id: teamId,
      title: '_Índice',
      content,
      tags: JSON.stringify(['_índice']),
      history: '[]',
      summary: `Índice automático: ${total} artículos, ${processed} analizados`,
      librarian_status: 'done',
      suggested_tags: '[]',
      suggested_links: '[]',
      librarian_error: '',
      librarian_retries: 0,
      created_by: createdBy,
      created_at: now,
      updated_at: now,
    });
  }
}
