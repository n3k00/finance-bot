import type {
  BusinessEntry,
  PersonalEntry,
} from "./_types.ts";

// Notion API helpers (no SDK — plain fetch, works in Deno).

const NOTION_API = "https://api.notion.com";

const COMMON_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "Notion-Version": "2022-06-28",
});

function titleProp(text: string) {
  return {
    title: [{ type: "text", text: { content: text.slice(0, 2000) } }],
  };
}

function richTextProp(text: string) {
  const content = (text ?? "").toString().slice(0, 2000);
  return { rich_text: [{ type: "text", text: { content } }] };
}

function selectProp(name: string) {
  return name ? { select: { name } } : { select: null };
}

function numberProp(n: number) {
  return { number: n };
}

function dateProp(date: string) {
  return { date: { start: date } };
}

function pagePropsPersonal(e: PersonalEntry) {
  return {
    // Title = description (e.g. "မနက်စာ")
    Name: titleProp(e.description || e.category || "Expense"),
    Date: dateProp(e.date),
    Type: selectProp(e.type),
    Category: selectProp(e.category),
    Description: richTextProp(e.description),
    Amount: numberProp(e.amount),
    Currency: selectProp(e.currency),
    "Payment Method": selectProp(e.payment_method),
    Note: richTextProp(e.note ?? ""),
  };
}

function pagePropsBusiness(e: BusinessEntry) {
  return {
    // Title = person + purpose
    Name: titleProp(`${e.person} — ${e.purpose}`.slice(0, 200)),
    Date: dateProp(e.date),
    Direction: selectProp(
      e.direction.charAt(0).toUpperCase() + e.direction.slice(1),
    ),
    Person: richTextProp(e.person),
    Amount: numberProp(e.amount),
    Currency: selectProp(e.currency),
    "Payment Method": selectProp(e.method),
    Purpose: richTextProp(e.purpose),
    Status: selectProp(
      e.status.charAt(0).toUpperCase() + e.status.slice(1),
    ),
    Note: richTextProp(e.note ?? ""),
  };
}

interface NotionDatabase {
  properties: Record<string, { type: string }>;
}

async function getDatabaseSchema(
  notionToken: string,
  databaseId: string,
): Promise<NotionDatabase> {
  const res = await fetch(`${NOTION_API}/v1/databases/${databaseId}`, {
    method: "GET",
    headers: COMMON_HEADERS(notionToken),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Notion database read failed (${res.status}): ${txt}`);
  }
  return (await res.json()) as NotionDatabase;
}

function findProp(
  schema: NotionDatabase,
  type: string,
  aliases: string[],
): string | null {
  for (const name of aliases) {
    if (schema.properties[name]?.type === type) return name;
  }
  return null;
}

function putProp(
  out: Record<string, unknown>,
  schema: NotionDatabase,
  type: string,
  aliases: string[],
  value: unknown,
) {
  const name = findProp(schema, type, aliases);
  if (name && value !== undefined && value !== null && value !== "") {
    out[name] = value;
  }
}

function pagePropsBusinessForSchema(e: BusinessEntry, schema: NotionDatabase) {
  const props: Record<string, unknown> = {};

  putProp(
    props,
    schema,
    "title",
    ["Name", "အကြောင်းအရာ", "နာမည်", "အမည်"],
    titleProp(e.person || e.purpose || "Business entry"),
  );
  putProp(props, schema, "date", ["Date", "ရက်စွဲ"], dateProp(e.date));
  putProp(
    props,
    schema,
    "select",
    ["Account Type", "ငွေစာရင်း", "အကောင့်အမျိုးအစား"],
    selectProp(e.account_type || e.method),
  );
  putProp(
    props,
    schema,
    "rich_text",
    ["Acc No", "Account No", "ဖုန်းနံပါတ် / Acc No", "အကောင့်နံပါတ်"],
    richTextProp(e.account_no ?? ""),
  );
  putProp(props, schema, "number", ["In", "အဝင်"], numberProp(e.in_amount ?? 0));
  putProp(
    props,
    schema,
    "number",
    ["Out", "အထွက်"],
    numberProp(e.out_amount ?? 0),
  );
  putProp(
    props,
    schema,
    "number",
    ["Debt", "Balance", "ဘောက်", "အကြွေး", "ကျန်"],
    numberProp(e.debt_amount ?? 0),
  );
  putProp(props, schema, "rich_text", ["Note", "မှတ်ချက်"], richTextProp(e.note ?? ""));

  putProp(
    props,
    schema,
    "select",
    ["Direction"],
    selectProp(e.direction.charAt(0).toUpperCase() + e.direction.slice(1)),
  );
  putProp(props, schema, "rich_text", ["Person"], richTextProp(e.person));
  putProp(props, schema, "number", ["Amount"], numberProp(e.amount));
  putProp(props, schema, "select", ["Currency"], selectProp(e.currency));
  putProp(props, schema, "select", ["Payment Method"], selectProp(e.method));
  putProp(props, schema, "rich_text", ["Purpose"], richTextProp(e.purpose));
  putProp(
    props,
    schema,
    "select",
    ["Status"],
    selectProp(e.status.charAt(0).toUpperCase() + e.status.slice(1)),
  );

  return Object.keys(props).length ? props : pagePropsBusiness(e);
}

export async function insertEntry(opts: {
  notionToken: string;
  databaseId: string;
  book: "personal" | "business";
  entry: PersonalEntry | BusinessEntry;
}): Promise<string> {
  const properties =
    opts.book === "personal"
      ? pagePropsPersonal(opts.entry as PersonalEntry)
      : pagePropsBusinessForSchema(
        opts.entry as BusinessEntry,
        await getDatabaseSchema(opts.notionToken, opts.databaseId),
      );

  const res = await fetch(`${NOTION_API}/v1/pages`, {
    method: "POST",
    headers: COMMON_HEADERS(opts.notionToken),
    body: JSON.stringify({
      parent: { database_id: opts.databaseId },
      properties,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Notion insert failed (${res.status}): ${txt}`);
  }

  const json = (await res.json()) as { id: string };
  return json.id;
}
