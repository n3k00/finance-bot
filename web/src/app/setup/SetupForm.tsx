"use client";

import { useState, useActionState } from "react";
import type {
  BotConfigFormInitial,
  BotConfigInput,
  OpenAIModelOption,
} from "@/lib/types";

interface Props {
  initial: BotConfigFormInitial | null;
  initialTelegramId?: string;
  action: (input: BotConfigInput) => Promise<{ error: string | null }>;
  loadModelsAction: (input: {
    openai_api_key?: string;
    ai_base_url?: string;
  }) => Promise<{ error: string | null; models: OpenAIModelOption[] }>;
}

const EMPTY: BotConfigInput = {
  ai_provider: "openai",
  ai_base_url: "https://api.openai.com/v1",
  openai_api_key: "",
  openai_model: "gpt-4o-mini",
  personal_categories: [
    "Food",
    "Drink",
    "Transport",
    "Shopping",
    "Bills",
    "Entertainment",
    "Health",
    "Family Support",
    "Education",
    "Tobacco",
    "Donation",
    "Gift",
    "Other",
  ],
  notion_token: "",
  personal_db_id: "",
  business_db_id: "",
};

function toInput(
  c: BotConfigFormInitial | null,
): BotConfigInput {
  if (!c) return EMPTY;

  return {
    ai_provider: c.ai_provider ?? "openai",
    ai_base_url: c.ai_base_url ?? "https://api.openai.com/v1",
    openai_api_key: "",
    openai_model: c.openai_model ?? "gpt-4o-mini",
    personal_categories: c.personal_categories ?? EMPTY.personal_categories,
    notion_token: "",
    personal_db_id: c.personal_db_id ?? "",
    business_db_id: c.business_db_id ?? "",
  };
}

export function SetupForm({
  initial,
  initialTelegramId,
  action,
}: Props) {
  const [form, setForm] = useState<BotConfigInput>(() => toInput(initial));
  const [saved, setSaved] = useState(false);

  async function onSubmit(
    _prev: { error: string | null } | null,
    formData: FormData,
  ) {
    const input: BotConfigInput = {
      ai_provider: String(formData.get("ai_provider") ?? "openai"),
      ai_base_url: String(formData.get("ai_base_url") ?? ""),
      openai_api_key: String(formData.get("openai_api_key") ?? ""),
      openai_model: String(formData.get("openai_model") ?? "gpt-4o-mini"),
      personal_categories: String(formData.get("personal_categories") ?? "")
        .split(/\r?\n|,/)
        .map((category) => category.trim())
        .filter(Boolean),
      notion_token: String(formData.get("notion_token") ?? ""),
      personal_db_id: String(formData.get("personal_db_id") ?? ""),
      business_db_id: String(formData.get("business_db_id") ?? ""),
    };
    const res = await action(input);
    if (!res.error) setSaved(true);
    return res;
  }

  const [state, formAction, pending] = useActionState<
    { error: string | null } | null,
    FormData
  >(onSubmit, null);

  function update<K extends keyof BotConfigInput>(
    name: K,
    value: BotConfigInput[K],
  ) {
    setSaved(false);
    setForm((current) => ({ ...current, [name]: value }));
  }

  function field<K extends keyof BotConfigInput>(
    name: K,
    label: string,
    opts: {
      type?: string;
      placeholder?: string;
      required?: boolean;
      help?: string;
      status?: string;
    } = {},
  ) {
    const { type = "text", placeholder, required, help, status } = opts;
    return (
      <label className="block">
        <span className="mb-1.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
            {label}
            {required ? <span className="text-red-500">*</span> : null}
          </span>
          {status ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {status}
            </span>
          ) : null}
        </span>
        <input
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          value={form[name]}
          onChange={(e) => update(name, e.target.value as BotConfigInput[K])}
          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
        />
        {help ? (
          <span className="mt-1.5 block text-xs leading-5 text-slate-500">
            {help}
          </span>
        ) : null}
      </label>
    );
  }

  return (
    <form
      action={formAction}
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <Section title="Telegram" description="Account access is managed by admin allowlist.">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-800">
          Telegram login uses the shared bot and Supabase allowlist. Users do
          not need to enter bot tokens or Telegram IDs here.
          {initialTelegramId ? (
            <span className="mt-1 block font-mono text-xs">
              Telegram ID: {initialTelegramId}
            </span>
          ) : null}
        </div>
      </Section>

      <Section title="Parser" description="Shared AI is managed by the app admin.">
        <input type="hidden" name="ai_provider" value={form.ai_provider} />
        <input type="hidden" name="ai_base_url" value={form.ai_base_url} />
        <input type="hidden" name="openai_api_key" value="" />
        <input type="hidden" name="openai_model" value={form.openai_model} />

        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
          AI parsing and chat replies use the shared admin key. Users do not
          need to enter provider keys or choose models.
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Personal categories
          </span>
          <textarea
            name="personal_categories"
            value={form.personal_categories.join("\n")}
            onChange={(e) =>
              update(
                "personal_categories",
                e.target.value
                  .split(/\r?\n|,/)
                  .map((category) => category.trim())
                  .filter(Boolean),
              )
            }
            rows={7}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
          />
          <span className="mt-1.5 block text-xs leading-5 text-slate-500">
            One category per line. Keyword rules and AI fallback will use this
            list.
          </span>
        </label>
      </Section>

      <Section
        title="Notion"
        description="Optional sync destination. Supabase remains primary."
      >
        {field("notion_token", "Integration token", {
          type: "password",
          placeholder: initial?.has_notion_token
            ? "Saved token hidden"
            : "secret_xxx...",
          status: initial?.has_notion_token ? "Saved" : undefined,
          help: initial?.has_notion_token
            ? "Configured. Leave blank to keep the saved token."
            : "Optional. Add only if you also want entries copied to Notion.",
        })}
        <div className="grid gap-4 md:grid-cols-2">
          {field("personal_db_id", "Personal database ID", {
            placeholder: "32-char hex",
          })}
          {field("business_db_id", "Bank ledger database ID", {
            placeholder: "32-char hex",
          })}
        </div>
      </Section>

      <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {state?.error ? (
            <p className="text-sm font-medium text-red-700">{state.error}</p>
          ) : saved ? (
            <p className="text-sm font-medium text-emerald-700">
              Configuration saved.
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              Secrets are stored in Supabase and not shown after saving.
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-md bg-slate-950 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-55"
        >
          {pending ? "Saving..." : "Save configuration"}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t border-slate-200 px-5 py-5 first:border-t-0 md:grid-cols-[180px_1fr]">
      <div>
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
