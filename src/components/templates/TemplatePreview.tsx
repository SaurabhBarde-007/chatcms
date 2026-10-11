import type { TemplateDraft } from "@/lib/marketing/template-builder";
import { WhatsAppText } from "./WhatsAppText";

const BUTTON_ICON = { QUICK_REPLY: "↩", URL: "↗", PHONE_NUMBER: "📞", COPY_CODE: "⧉" } as const;

/** Fill {{x}} with its sample (or leave the placeholder visible if there's none yet). */
function withSamples(text: string, samples: Record<string, string>) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, name: string) => samples[name]?.trim() || m);
}

/** How the template will look in WhatsApp, with sample values filled in. */
export function TemplatePreview({ draft, mediaUrl }: { draft: TemplateDraft; mediaUrl?: string | null }) {
  const h = draft.header;
  const headerSamples = h.type === "TEXT" ? Object.fromEntries((h.text.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/) ?? []).slice(1).map((n) => [n, h.example])) : {};
  const image = mediaUrl ?? (h.type !== "NONE" && h.type !== "TEXT" ? h.sampleUrl : undefined);

  return (
    <div className="rounded-lg bg-[#e5ddd5] p-3">
      <div className="max-w-[320px] overflow-hidden rounded-lg bg-white text-sm shadow-sm">
        {h.type === "TEXT" && h.text && (
          <div className="px-3 pt-2 font-semibold">{withSamples(h.text, headerSamples)}</div>
        )}
        {h.type === "IMAGE" &&
          (image ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview or Meta's sample URL
            <img src={image} alt="Header sample" className="max-h-48 w-full object-cover" />
          ) : (
            <div className="flex h-32 items-center justify-center bg-slate-100 text-xs text-slate-500">Image</div>
          ))}
        {h.type === "VIDEO" && <div className="flex h-32 items-center justify-center bg-slate-800 text-sm text-white">▶ Video</div>}
        {h.type === "DOCUMENT" && <div className="mx-3 mt-2 rounded bg-slate-100 px-3 py-2 text-xs text-slate-600">📄 Document</div>}

        <div className="px-3 py-2 whitespace-pre-wrap break-words">
          {draft.body.text ? <WhatsAppText text={withSamples(draft.body.text, draft.body.examples)} /> : <span className="text-slate-400">Your message…</span>}
        </div>
        {draft.footer && <div className="px-3 pb-1 text-xs text-slate-500">{draft.footer}</div>}
        <div className="px-3 pb-1.5 text-right text-[10px] text-slate-400">12:00</div>

        {draft.buttons.length > 0 && (
          <div className="border-t border-slate-100">
            {draft.buttons.map((b, i) => (
              <div key={i} className="flex items-center justify-center gap-1.5 border-b border-slate-100 py-2 text-[13px] text-sky-600 last:border-0">
                <span aria-hidden>{BUTTON_ICON[b.type]}</span>
                {b.type === "COPY_CODE" ? "Copy offer code" : b.text || <span className="text-slate-300">Button</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
