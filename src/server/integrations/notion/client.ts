import {
  Client,
  type GetDataSourceResponse,
  type QueryDataSourceParameters,
  type QueryDataSourceResponse,
} from "@notionhq/client";

let clientInstance: Client | null = null;

/**
 * Returns a lazy singleton Notion SDK client instance.
 * Throws a readable error if NOTION_TOKEN is not set in process.env.
 */
export function getNotionClient(): Client {
  if (clientInstance) {
    return clientInstance;
  }

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error(
      "NOTION_TOKEN environment variable is missing. Set NOTION_TOKEN in your environment or .env file."
    );
  }

  clientInstance = new Client({
    auth: token,
    timeoutMs: 30_000,
    // The SDK retries 429/529 up to 2 times by default with exponential backoff + jitter.
    // Do NOT add custom retry logic on top of this.
  });

  return clientInstance;
}

/**
 * Thin wrapper for dataSources.query.
 */
export async function queryDataSource(
  dataSourceId: string,
  opts?: {
    start_cursor?: string;
    page_size?: number;
    filter?: QueryDataSourceParameters["filter"];
  }
): Promise<QueryDataSourceResponse> {
  const client = getNotionClient();
  return client.dataSources.query({
    data_source_id: dataSourceId,
    ...opts,
  });
}

/**
 * Thin wrapper for dataSources.retrieve.
 */
export async function retrieveDataSource(
  dataSourceId: string
): Promise<GetDataSourceResponse> {
  const client = getNotionClient();
  return client.dataSources.retrieve({
    data_source_id: dataSourceId,
  });
}
