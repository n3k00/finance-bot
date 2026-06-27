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
  registerWebhookAction: (input?: BotConfigInput) => Promise<{
    error: string | null;
    message: string | null;
  }>;
  checkWebhookAction: () => Promise<{
    error: string | null;
    message: string | null;
  }>;
  setMenuButtonAction: () => Promise<{
    error: string | null;
    message: string | null;
  }>;
}

const EMPTY: BotConfigInput = {
  telegram_bot_token: "",
  ai_provider: "openai",
  ai_base_url: "https://api.openai.com/v1",
  openai_api_key: "",
  openai_model: "gpt-4o-mini",
  notion_token: "",
  personal_db_id: "",
  business_db_id: "",
  allowed_telegram_ids: "",
};

const XIAOMI_MIMO_MODELS: OpenAIModelOption[] = [
  { id: "mimo-v2.5-pro", created: 6, owned_by: "xiaomi-mimo" },
  { id: "mimo-v2.5-pro-ultraspeed", created: 5, owned_by: "xiaomi-mimo" },
  { id: "mimo-v2.5", created: 4, owned_by: "xiaomi-mimo" },
  { id: "mimo-v2.5-tts", created: 3, owned_by: "xiaomi-mimo" },
  { id: "mimo-v2.5-tts-voiceclone", created: 2, owned_by: "xiaomi-mimo" },
  { id: "mimo-v2.5-asr", created: 1, owned_by: "xiaomi-mimo" },
];

function mergeTelegramId(ids: string, telegramId?: string) {
  const cleanId = telegramId?.trim();
  if (!cleanId) return ids;

  const parts = ids
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return Array.from(new Set([...parts, cleanId])).join(", ");
}

function toInput(
  c: BotConfigFormInitial | null,
  initialTelegramId?: string,
): BotConfigInput {
  if (!c) {
    return {
      ...EMPTY,
      allowed_telegram_ids: mergeTelegramId("", initialTelegramId),
    };
  }
  return {
    telegram_bot_token: "",
    ai_provider: c.ai_provider ?? "openai",
    ai_base_url: c.ai_base_url ?? "https://api.openai.com/v1",
    openai_api_key: "",
    openai_model: c.openai_model ?? "gpt-4o-mini",
    notion_token: "",
    personal_db_id: c.personal_db_id ?? "",
    business_db_id: c.business_db_id ?? "",
    allowed_telegram_ids: mergeTelegramId(
      (c.allowed_telegram_ids ?? []).join(", "),
      initialTelegramId,
    ),
  };
}

function isXiaomiMiMo(provider?: string, baseUrl?: string) {
  return (
    provider === "xiaomi_mimo" ||
    (baseUrl ?? "").toLowerCase().includes("xiaomimimo.com")
  );
}

function providerFallbackModels(
  provider?: string,
  baseUrl?: string,
): OpenAIModelOption[] {
  return isXiaomiMiMo(provider, baseUrl) ? XIAOMI_MIMO_MODELS : [];
}

function mergeModelOptions(
  models: OpenAIModelOption[],
  fallback: OpenAIModelOption[],
) {
  const byId = new Map<string, OpenAIModelOption>();
  for (const model of [...models, ...fallback]) {
    if (!byId.has(model.id)) byId.set(model.id, model);
  }
  return Array.from(byId.values()).sort(
    (a, b) => b.created - a.created || a.id.localeCompare(b.id),
  );
}

export function SetupForm({
  initial,
  initialTelegramId,
  action,
  loadModelsAction,
  registerWebhookAction,
  checkWebhookAction,
  setMenuButtonAction,
}: Props) {
  const [form, setForm] = useState<BotConfigInput>(() =>
    toInput(initial, initialTelegramId),
  );
  const [saved, setSaved] = useState(false);
  const [modelOptions, setModelOptions] = useState<OpenAIModelOption[]>(() =>
    providerFallbackModels(initial?.ai_provider, initial?.ai_base_url),
  );
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [webhookMessage, setWebhookMessage] = useState<string | null>(null);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [checkingWebhook, setCheckingWebhook] = useState(false);
  const [settingMenuButton, setSettingMenuButton] = useState(false);
  const [menuButtonMessage, setMenuButtonMessage] = useState<string | null>(null);
  const [menuButtonError, setMenuButtonError] = useState<string | null>(null);
  const providerOptions = [
    {
      value: "openai",
      label: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
    },
    {
      value: "openrouter",
      label: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
    },
    {
      value: "xiaomi_mimo",
      label: "Xiaomi MiMo",
      baseUrl: "https://api.xiaomimimo.com/v1",
    },
    {
      value: "custom",
      label: "Custom OpenAI-compatible",
      baseUrl: "",
    },
  ];

  async function onSubmit(
    _prev: { error: string | null } | null,
    formData: FormData,
  ) {
    const input: BotConfigInput = {
      telegram_bot_token: String(formData.get("telegram_bot_token") ?? ""),
      ai_provider: String(formData.get("ai_provider") ?? "openai"),
      ai_base_url: String(formData.get("ai_base_url") ?? ""),
      openai_api_key: String(formData.get("openai_api_key") ?? ""),
      openai_model: String(formData.get("openai_model") ?? "gpt-4o-mini"),
      notion_token: String(formData.get("notion_token") ?? ""),
      personal_db_id: String(formData.get("personal_db_id") ?? ""),
      business_db_id: String(formData.get("business_db_id") ?? ""),
      allowed_telegram_ids: String(formData.get("allowed_telegram_ids") ?? ""),
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

  async function loadModels() {
    setLoadingModels(true);
    setModelError(null);
    const res = await loadModelsAction({
      openai_api_key: form.openai_api_key,
      ai_base_url: form.ai_base_url,
    });
    if (res.error) {
      setModelError(res.error);
      setModelOptions(providerFallbackModels(form.ai_provider, form.ai_base_url));
    } else {
      const models = mergeModelOptions(
        res.models,
        providerFallbackModels(form.ai_provider, form.ai_base_url),
      );
      setModelOptions(models);
      if (
        models.length > 0 &&
        !models.some((model) => model.id === form.openai_model)
      ) {
        update("openai_model", models[0].id);
      }
    }
    setLoadingModels(false);
  }

  async function registerWebhook() {
    setRegisteringWebhook(true);
    setWebhookMessage(null);
    setWebhookError(null);
    const res = await registerWebhookAction(form);
    if (res.error) {
      setWebhookError(res.error);
    } else {
      setWebhookMessage(res.message ?? "Webhook registered.");
      setSaved(true);
    }
    setRegisteringWebhook(false);
  }

  async function checkWebhook() {
    setCheckingWebhook(true);
    setWebhookMessage(null);
    setWebhookError(null);
    const res = await checkWebhookAction();
    if (res.error) {
      setWebhookError(res.error);
    } else {
      setWebhookMessage(res.message ?? "Webhook is configured.");
    }
    setCheckingWebhook(false);
  }

  async function setMenuButton() {
    setSettingMenuButton(true);
    setMenuButtonMessage(null);
    setMenuButtonError(null);
    const res = await setMenuButtonAction();
    if (res.error) {
      setMenuButtonError(res.error);
    } else {
      setMenuButtonMessage(res.message ?? "Telegram menu button set.");
    }
    setSettingMenuButton(false);
  }

  return (
    <form
      action={formAction}
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <Section title="Telegram" description="Bot token and allowed chat IDs.">
        {initialTelegramId ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Telegram ID {initialTelegramId} is prefilled from the Mini App
            allowlist flow.
          </div>
        ) : null}
        {field("telegram_bot_token", "Bot token", {
          required: !initial?.has_telegram_bot_token,
          placeholder: initial?.has_telegram_bot_token
            ? "Saved token hidden"
            : "123456789:ABCdef...",
          status: initial?.has_telegram_bot_token ? "Saved" : undefined,
          help: initial?.has_telegram_bot_token
            ? "Configured. Leave blank to keep the saved token."
            : "Create the bot with @BotFather.",
        })}
        {field("allowed_telegram_ids", "Allowed Telegram IDs", {
          required: true,
          placeholder: "123456789, 987654321",
          help: "Comma-separated IDs allowed to use this bot.",
        })}
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">
                Telegram webhook
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Saves this configuration, then registers the hosted Edge
                Function as this bot&apos;s webhook.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={checkWebhook}
                disabled={checkingWebhook}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-55"
              >
                {checkingWebhook ? "Checking..." : "Check webhook"}
              </button>
              <button
                type="button"
                onClick={registerWebhook}
                disabled={registeringWebhook}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-55"
              >
                {registeringWebhook ? "Registering..." : "Save and register"}
              </button>
            </div>
          </div>
          {webhookMessage ? (
            <p className="mt-2 whitespace-pre-line text-xs font-medium text-emerald-700">
              {webhookMessage}
            </p>
          ) : null}
          {webhookError ? (
            <p className="mt-2 text-xs font-medium text-red-700">
              {webhookError}
            </p>
          ) : null}
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">
                Telegram menu button
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Adds a permanent menu shortcut in the bot chat. Users can still
                type messages normally.
              </p>
            </div>
            <button
              type="button"
              onClick={setMenuButton}
              disabled={settingMenuButton}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-55"
            >
              {settingMenuButton ? "Setting..." : "Set menu button"}
            </button>
          </div>
          {menuButtonMessage ? (
            <p className="mt-2 whitespace-pre-line text-xs font-medium text-emerald-700">
              {menuButtonMessage}
            </p>
          ) : null}
          {menuButtonError ? (
            <p className="mt-2 text-xs font-medium text-red-700">
              {menuButtonError}
            </p>
          ) : null}
        </div>
      </Section>

      <Section title="AI parser" description="Provider, key, endpoint, and model.">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Provider
            </span>
            <select
              name="ai_provider"
              value={form.ai_provider}
              onChange={(e) => {
                const selected = providerOptions.find(
                  (option) => option.value === e.target.value,
                );
                update("ai_provider", e.target.value);
                if (selected?.baseUrl) {
                  update("ai_base_url", selected.baseUrl);
                }
                const fallback = providerFallbackModels(
                  selected?.value,
                  selected?.baseUrl,
                );
                setModelOptions(fallback);
                if (
                  fallback.length > 0 &&
                  !fallback.some((model) => model.id === form.openai_model)
                ) {
                  update("openai_model", fallback[0].id);
                }
              }}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
            >
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {field("ai_base_url", "API base URL", {
            required: true,
            placeholder: "https://api.openai.com/v1",
            help: "Must expose OpenAI-compatible /chat/completions and /models endpoints.",
          })}
        </div>

        {field("openai_api_key", "AI API key", {
          required: !initial?.has_openai_api_key,
          type: "password",
          placeholder: initial?.has_openai_api_key
            ? "Saved key hidden"
            : "sk-...",
          status: initial?.has_openai_api_key ? "Saved" : undefined,
          help: initial?.has_openai_api_key
            ? "Configured. Leave blank to keep the saved key."
            : "Use the API key from your selected AI provider.",
        })}
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label
              htmlFor="openai_model"
              className="text-sm font-medium text-slate-700"
            >
              AI model
            </label>
            <button
              type="button"
              onClick={loadModels}
              disabled={loadingModels}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-55"
            >
              {loadingModels ? "Loading..." : "Load models"}
            </button>
          </div>
          {modelOptions.length > 0 ? (
            <select
              id="openai_model"
              name="openai_model"
              value={form.openai_model ?? modelOptions[0].id}
              onChange={(e) => update("openai_model", e.target.value)}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
            >
              {modelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.id}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="openai_model"
              name="openai_model"
              value={form.openai_model ?? "gpt-4o-mini"}
              onChange={(e) => update("openai_model", e.target.value)}
              placeholder="gpt-4o-mini or provider/model-id"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
            />
          )}
          <span className="mt-1.5 block text-xs leading-5 text-slate-500">
            Loads models from the selected provider&apos;s /models endpoint. For
            custom providers, you can also type a model ID directly.
          </span>
          {modelError ? (
            <p className="mt-1.5 text-xs font-medium text-red-700">
              {modelError}
            </p>
          ) : null}
        </div>
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
