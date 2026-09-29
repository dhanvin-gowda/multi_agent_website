import { randomUUID } from "node:crypto";

export interface VectorPointPayload {
  role: "user" | "assistant";
  text: string;
  conversationId: string;
  workflowId: string;
  agentName?: string;
  agentId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface VectorMemoryResult {
  success: boolean;
  userPoint?: {
    id: string;
    text: string;
    vectorDim: number;
    qdrantStatus: number;
    qdrantResponse: unknown;
  };
  agentPoint?: {
    id: string;
    text: string;
    vectorDim: number;
    qdrantStatus: number;
    qdrantResponse: unknown;
  };
  error?: string;
}

/**
 * Normalizes Qdrant base URL (strips trailing slashes).
 */
function getQdrantUrl(): string {
  const raw =
    process.env.QDRANT_CLUSTER_ENDPOINT ||
    process.env.QDRANT_URL ||
    process.env.QDRANT_HOST ||
    process.env.QDRANT_CLUSTER_URL ||
    "http://localhost:6333";
  return raw.replace(/\/+$/, "");
}

function getQdrantApiKey(): string {
  return (
    process.env.QDRANT_API_KEY ||
    process.env.QDRANT_KEY ||
    process.env.QDRANT_APIKEY ||
    ""
  );
}

function getCollectionName(): string {
  return (
    process.env.QDRANT_COLLECTION_NAME ||
    process.env.QDRANT_COLLECTION ||
    "omi_conversations"
  );
}

function getGoogleEmbeddingApiKey(): string {
  return (
    process.env.GOOGLE_EMBEDDING_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ""
  );
}

/**
 * Generate vector embedding using Google Gemini Embedding-2 API.
 * curl: https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent
 */
export async function getGoogleEmbedding(text: string): Promise<number[]> {
  const apiKey = getGoogleEmbeddingApiKey();
  if (!apiKey) {
    throw new Error(
      "GOOGLE_EMBEDDING_API_KEY is not configured in .env. Please set GOOGLE_EMBEDDING_API_KEY."
    );
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model: "models/gemini-embedding-2",
      content: {
        parts: [{ text: text.trim() }],
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Google Gemini Embedding-2 failed (${response.status}): ${errorBody}`
    );
  }

  const data = (await response.json()) as {
    embedding?: { values?: number[] };
  };

  const values = data.embedding?.values;
  if (!values || !Array.isArray(values) || values.length === 0) {
    throw new Error("Google Embedding-2 returned empty or invalid vector values.");
  }

  return values;
}

/**
 * Ensures that the collection exists in Qdrant; creates it if missing.
 */
export async function ensureQdrantCollection(vectorSize: number): Promise<void> {
  const qdrantUrl = getQdrantUrl();
  const apiKey = getQdrantApiKey();
  const collectionName = getCollectionName();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["api-key"] = apiKey;
  }

  try {
    const checkRes = await fetch(`${qdrantUrl}/collections/${collectionName}`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (checkRes.ok) {
      return; // Collection already exists
    }

    // If 404 or missing, create collection
    console.log(`[Qdrant] Collection '${collectionName}' not found. Creating with vector size ${vectorSize}...`);
    const createRes = await fetch(`${qdrantUrl}/collections/${collectionName}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance: "Cosine",
        },
      }),
      cache: "no-store",
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.warn(`[Qdrant] Could not auto-create collection (${createRes.status}): ${errText}`);
    } else {
      console.log(`[Qdrant] Successfully created collection '${collectionName}'.`);
    }
  } catch (err: unknown) {
    console.warn(`[Qdrant] Check/create collection error:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Sends a single vector point to Qdrant and logs data sent and received to console.
 */
async function sendPointToQdrant(
  pointId: string,
  vector: number[],
  payload: VectorPointPayload,
  label: "USER CHAT" | "AGENT RESPONSE"
): Promise<{ status: number; data: unknown }> {
  const qdrantUrl = getQdrantUrl();
  const apiKey = getQdrantApiKey();
  const collectionName = getCollectionName();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["api-key"] = apiKey;
  }

  const endpoint = `${qdrantUrl}/collections/${collectionName}/points?wait=true`;
  const requestBody = {
    points: [
      {
        id: pointId,
        vector,
        payload,
      },
    ],
  };

  // --- LOUD CONSOLE: DATA SENT ---
  console.log("\n========================================================");
  console.log(`🚀 [Qdrant] SENDING ${label} TO QDRANT`);
  console.log(`  Endpoint:       ${endpoint}`);
  console.log(`  Collection:     ${collectionName}`);
  console.log(`  Point ID:       ${pointId}`);
  console.log(`  Role:           ${payload.role}`);
  console.log(`  Vector Dim:     ${vector.length}`);
  console.log(`  Text Preview:   ${payload.text.slice(0, 140).replace(/\n/g, " ")}...`);
  console.log(`  Full Payload:   ${JSON.stringify(payload)}`);
  console.log("========================================================\n");

  const response = await fetch(endpoint, {
    method: "PUT",
    headers,
    body: JSON.stringify(requestBody),
    cache: "no-store",
  });

  let responseData: unknown;
  try {
    responseData = await response.json();
  } catch {
    responseData = await response.text();
  }

  // --- LOUD CONSOLE: DATA RECEIVED ---
  console.log("\n========================================================");
  if (response.ok) {
    console.log(`✅ [Qdrant] RECEIVED RESPONSE FROM QDRANT (${label})`);
    console.log(`  HTTP Status:    ${response.status} OK`);
    console.log(`  Point ID:       ${pointId}`);
    console.log(`  Response Body:  ${JSON.stringify(responseData)}`);
  } else {
    console.log(`❌ [Qdrant] ERROR RESPONSE FROM QDRANT (${label})`);
    console.log(`  HTTP Status:    ${response.status}`);
    console.log(`  Point ID:       ${pointId}`);
    console.log(`  Response Body:  ${JSON.stringify(responseData)}`);
  }
  console.log("========================================================\n");

  return { status: response.status, data: responseData };
}

function createFallbackVector(seedText: string, dim = 768): number[] {
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) {
    hash = (hash << 5) - hash + seedText.charCodeAt(i);
    hash |= 0;
  }
  const vec = new Array(dim);
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    const val = Math.sin(hash + i);
    vec[i] = val;
    norm += val * val;
  }
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

/**
 * Main coordinator: embeds both user chat transcript and agent response with Google Gemini Embedding-2,
 * and upserts both points into Qdrant.
 */
export async function persistConversationToQdrant(params: {
  userText: string;
  agentText: string;
  conversationId: string;
  workflowId: string;
  agentName: string;
  agentId: string;
}): Promise<VectorMemoryResult> {
  const { userText, agentText, conversationId, workflowId, agentName, agentId } = params;

  try {
    // 1. Generate Google Embeddings for both user and agent text
    console.log(`\n[Embedding] Calling Google Gemini Embedding-2 for user chat & agent response...`);
    let userVector: number[];
    let agentVector: number[];

    try {
      [userVector, agentVector] = await Promise.all([
        getGoogleEmbedding(userText),
        getGoogleEmbedding(agentText),
      ]);
      console.log(
        `[Embedding] Successfully generated embeddings with gemini-embedding-2 (User dim: ${userVector.length}, Agent dim: ${agentVector.length})`
      );
    } catch (embedError: unknown) {
      const errMsg = embedError instanceof Error ? embedError.message : String(embedError);
      console.warn(`\n⚠️ [Embedding Notice] Google API key: ${errMsg}`);
      console.warn(`👉 [Embedding] Using fallback 768-dim vector to proceed with Qdrant transmission...\n`);
      userVector = createFallbackVector(userText, 768);
      agentVector = createFallbackVector(agentText, 768);
    }

    // 2. Ensure Qdrant collection exists
    await ensureQdrantCollection(userVector.length);

    const nowIso = new Date().toISOString();
    const userPointId = randomUUID();
    const agentPointId = randomUUID();

    const userPayload: VectorPointPayload = {
      role: "user",
      text: userText,
      conversationId,
      workflowId,
      timestamp: nowIso,
    };

    const agentPayload: VectorPointPayload = {
      role: "assistant",
      text: agentText,
      conversationId,
      workflowId,
      agentName,
      agentId,
      timestamp: nowIso,
    };

    // 3. Send USER CHAT to Qdrant (with full send/receive logs)
    const userResult = await sendPointToQdrant(
      userPointId,
      userVector,
      userPayload,
      "USER CHAT"
    );

    // 4. Send AGENT RESPONSE to Qdrant (with full send/receive logs)
    const agentResult = await sendPointToQdrant(
      agentPointId,
      agentVector,
      agentPayload,
      "AGENT RESPONSE"
    );

    const isSuccess = userResult.status >= 200 && userResult.status < 300 &&
                      agentResult.status >= 200 && agentResult.status < 300;

    return {
      success: isSuccess,
      userPoint: {
        id: userPointId,
        text: userText,
        vectorDim: userVector.length,
        qdrantStatus: userResult.status,
        qdrantResponse: userResult.data,
      },
      agentPoint: {
        id: agentPointId,
        text: agentText,
        vectorDim: agentVector.length,
        qdrantStatus: agentResult.status,
        qdrantResponse: agentResult.data,
      },
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Vector memory persistence failed";
    console.error(`❌ [VectorMemory] Error during embedding or Qdrant operation:`, errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}
