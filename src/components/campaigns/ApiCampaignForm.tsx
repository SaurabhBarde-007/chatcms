"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api-client";
import { type ApiTrigger, DEFAULT_TRIGGER } from "@/lib/marketing/api-trigger";
import type { CampaignDTO } from "@/lib/marketing/campaigns";
import { EMPTY_VARIABLES, missingVariables, type Template, type TemplateVariables, usesApiValues } from "@/lib/marketing/templates";
import { ErrorNote } from "../ui/Page";
import { Field, FormShell, ProblemList } from "./CampaignForm";
import { MessagePreview, TemplateSetup } from "./TemplateSetup";

/** New API campaign: auto-reply to incoming messages and/or trigger it from your systems. */
export function ApiCampaignForm() {
  const router = useRouter();
  const templates = useFetch<Template[]>("/api/campaigns/templates");
  const fields = useFetch<{ fields: string[] }>("/api/contacts/tags");

  const [name, setName] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [variables, setVariables] = useState<TemplateVariables>(EMPTY_VARIABLES);
  const [trigger, setTrigger] = useState<ApiTrigger>(DEFAULT_TRIGGER);
  const [live, setLive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = templates.data?.find((t) => `${t.name}|${t.language}` === templateKey) ?? null;
  const inc = trigger.incoming;
  const autoReply = inc.enabled && template?.category !== "AUTHENTICATION";
  const missing = useMemo(() => (template ? missingVariables(template, variables) : []), [template, variables]);
  const problems = [
    !name.trim() && "Give the campaign a name",
    !template && "Pick a template",
    ...missing.map((m) => `Fill in ${m}`),
    autoReply && inc.match === "KEYWORDS" && !inc.keywords.length && "Add at least one keyword",
    autoReply && usesApiValues(variables) && "Auto-replies can't use “From each API call” values",
  ].filter(Boolean) as string[];

  const setIncoming = (change: Partial<ApiTrigger["incoming"]>) => setTrigger({ incoming: { ...inc, ...change } });

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const campaign = await api.post<CampaignDTO>("/api/campaigns", {
        type: "API",
        name,
        templateName: template!.name,
        templateLanguage: template!.language,
        variables,
        trigger: { incoming: { ...inc, enabled: autoReply } },
        live,
      });
      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the campaign");
      setSaving(false);
    }
  }

  return (
    <FormShell title="New API Campaign">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-5 md:p-6">
          <Field title="Campaign Name" help="Also used to trigger it from the API.">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="welcome_auto_reply" />
          </Field>

          <TemplateSetup
            kind="API"
            templates={templates.data}
            templatesError={templates.error}
            fields={fields.data?.fields ?? []}
            templateKey={templateKey}
            onTemplate={(key) => setTemplateKey(key)}
            variables={variables}
            onVariables={setVariables}
            autoReply={autoReply}
          />

          <Field title="Auto-reply to incoming messages" help="Send this template automatically when a customer messages you, to learn what they need.">
            {template?.category === "AUTHENTICATION" ? (
              <p className="text-sm text-slate-500">Authentication templates can only be sent from the API (each send needs its code).</p>
            ) : (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={inc.enabled} onChange={(e) => setIncoming({ enabled: e.target.checked })} />
                  Send automatically when a customer messages
                </label>
                {inc.enabled && (
                  <div className="mt-3 space-y-3 rounded-md bg-slate-50 p-3">
                    {(
                      [
                        ["ANY", "Any message", "Every message, at most once per cooldown period"],
                        ["FIRST_MESSAGE", "First message from a new contact", "Only someone's very first message to you"],
                        ["KEYWORDS", "Message contains keywords", "e.g. price, fees, demo (whole words; case doesn't matter)"],
                      ] as const
                    ).map(([value, label, help]) => (
                      <label key={value} className="flex items-start gap-2 text-sm">
                        <input type="radio" className="mt-1" name="match" checked={inc.match === value} onChange={() => setIncoming({ match: value })} />
                        <span>
                          {label}
                          <span className="block text-xs text-slate-500">{help}</span>
                        </span>
                      </label>
                    ))}
                    {inc.match === "KEYWORDS" && (
                      <input
                        className="input"
                        placeholder="price, fees, book a demo"
                        defaultValue={inc.keywords.join(", ")}
                        onChange={(e) => setIncoming({ keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })}
                      />
                    )}
                    <label className="flex flex-wrap items-center gap-2 text-sm">
                      Don&apos;t send again to the same person within
                      <input
                        className="input w-20 py-1"
                        inputMode="numeric"
                        value={inc.cooldownHours}
                        onChange={(e) => setIncoming({ cooldownHours: Math.max(0, Math.min(720, Number(e.target.value) || 0)) })}
                        aria-label="Cooldown in hours"
                      />
                      hours <span className="text-xs text-slate-500">(0 = every time)</span>
                    </label>
                    <p className="text-xs text-slate-500">
                      Keyword campaigns win over &ldquo;first message&rdquo;, which wins over &ldquo;any message&rdquo;. Each message gets at most one auto-reply. &ldquo;STOP&rdquo; never gets one.
                    </p>
                  </div>
                )}
              </>
            )}
          </Field>

          <Field title="Status">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              Live: start sending as soon as it&apos;s created
            </label>
          </Field>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-medium">Preview</h2>
            <MessagePreview template={template} variables={variables} />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            {problems.length > 0 ? <ProblemList problems={problems} /> : <p className="text-xs text-emerald-800">✓ Ready. After creating it you&apos;ll see how to call it from your systems.</p>}
            <button className="btn-primary mt-3 w-full" disabled={problems.length > 0 || saving} onClick={submit}>
              {saving ? "Creating…" : "Create API campaign"}
            </button>
            <div className="mt-2">
              <ErrorNote>{error}</ErrorNote>
            </div>
          </div>
        </aside>
      </div>
    </FormShell>
  );
}
