import { z } from "zod";

// Authorization
export const AuthorizationHeader = z.string().describe("API Key authorization header in format: ApiKey <key>");

// Principal schemas
export const Principal = z.object({
  secret_hash: z.string(),
  display_name: z.string(),
  created_at: z.string().datetime(),
  active: z.boolean(),
});

export const PrincipalList = z.object({
  items: z.array(Principal),
});

export const PrincipalCreateRequest = z.object({
  display_name: z.string(),
});

export const PrincipalCreateResponse = z.object({
  secret_hash: z.string(),
  display_name: z.string(),
  created_at: z.string().datetime(),
  active: z.boolean(),
  secret: z.string(),
});

export const PrincipalDeleteRequest = z.object({
  secret_hash: z.string(),
});

// KV schemas
export const NamespaceValue = z.string();

export const KVEntry = z.object({
  key: z.string(),
  value: z.string(),
});

export const ListKeysRequest = z.object({
  namespace: NamespaceValue,
});

export const ListKeysResponse = z.object({
  keys: z.array(z.string()),
});

export const ListNamespacesResponse = z.object({
  namespaces: z.array(z.string()),
});

export const GetRequest = z.object({
  namespace: NamespaceValue,
  key: z.string(),
});

export const GetResponse = z.object({
  value: z.string(),
});

export const SetRequest = z.object({
  namespace: NamespaceValue,
  key: z.string(),
  value: z.string(),
});

export const BulkGetRequest = z.object({
  namespace: NamespaceValue,
  keys: z.array(z.string()),
});

export const BulkGetResponse = z.object({
  entries: z.array(KVEntry),
});

export const BulkSetRequest = z.object({
  namespace: NamespaceValue,
  entries: z.array(KVEntry),
});

export const BulkSetResponse = z.object({
  success: z.boolean(),
  count: z.number().int(),
});

export const KVDumpEntry = z.object({
  namespace: NamespaceValue,
  entries: z.array(KVEntry),
});

export const KVDumpResponse = z.object({
  namespaces: z.array(KVDumpEntry),
});

// Blob visibility levels
export const BlobVisibility = z.enum(["public", "presigned", "private"]);

// Blob schemas
export const BlobMetadata = z.object({
  key: z.string(),
  namespace: NamespaceValue,
  size: z.number().int().positive(),
  contentType: z.string(),
  uploadedAt: z.string().datetime(),
  visibility: BlobVisibility,
});

export const BlobUploadResponse = z.object({
  metadata: BlobMetadata,
});

export const BlobPresignUploadRequest = z.object({
  namespace: NamespaceValue,
  key: z.string(),
  contentType: z.string(),
  size: z.number().int().positive(),
  visibility: BlobVisibility.optional().default("private"),
  // Legacy support
  isPublic: z.boolean().optional(),
});

export const BlobPresignUploadResponse = z.object({
  uploadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  metadata: BlobMetadata,
});

export const BlobGetRequest = z.object({
  namespace: NamespaceValue,
  key: z.string(),
});

export const BlobGetResponse = z.object({
  url: z.string().url(),
  metadata: BlobMetadata,
  expiresAt: z.string().datetime().optional(),
});

export const BlobDeleteRequest = z.object({
  namespace: NamespaceValue,
  key: z.string(),
});

export const BlobListRequest = z.object({
  namespace: NamespaceValue.optional(),
});

export const BlobListResponse = z.object({
  blobs: z.array(BlobMetadata),
});

export const BlobSetVisibilityRequest = z.object({
  namespace: NamespaceValue,
  key: z.string(),
  visibility: BlobVisibility,
});

export const BlobSetVisibilityResponse = z.object({
  metadata: BlobMetadata,
});

// Error response
export const ErrorResponse = z.object({
  code: z.number().int(),
  message: z.string(),
});

// Log schemas
export const LogMeta = z.object({
  logId: z.string(),
  name: z.string(),
  ownerNamespace: NamespaceValue,
  createdAt: z.string().datetime(),
});

export const LogEvent = z.object({
  id: z.string(),
  seq: z.number().int(),
  authorId: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
});

export const LogCreateRequest = z.object({
  namespace: NamespaceValue,
  name: z.string().min(1).max(100),
});

export const LogCreateResponse = z.object({
  metadata: LogMeta,
  secret: z.string(),
});

export const LogListRequest = z.object({
  namespace: NamespaceValue,
});

export const LogListResponse = z.object({
  logs: z.array(LogMeta),
});

export const LogAppendRequest = z.object({
  logId: z.string(),
  content: z.string().max(10000),
  authorId: z.string().optional(), // Required for token auth, derived from API key auth
});

export const LogAppendResponse = z.object({
  event: LogEvent,
});

export const LogReadRequest = z.object({
  logId: z.string(),
  afterSeq: z.number().int().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const LogReadResponse = z.object({
  events: z.array(LogEvent),
  hasMore: z.boolean(),
});

export const LogTokenCreateRequest = z.object({
  namespace: NamespaceValue,
  logId: z.string(),
  permissions: z.array(z.enum(["read", "write"])),
  expiresInSeconds: z.number().int().positive().default(604800), // 7 days
});

export const LogTokenCreateResponse = z.object({
  token: z.string(),
  expiresAt: z.string().datetime(),
});

// Log capability token structure (for parsing, not API response)
export const LogCapabilityToken = z.object({
  l: z.string(), // logId
  g: z.string(), // gatewayUrl
  p: z.array(z.enum(["r", "w"])), // permissions
  a: z.string(), // authorId
  e: z.number(), // expiresAt (unix timestamp)
  s: z.string(), // signature
});

// Admin schemas
export const AdminCheckResponse = z.object({
  kv: z.boolean(),
  blob: z.boolean(),
  presigned_ready: z.boolean(),
});

// Type exports for use in code
export type Principal = z.infer<typeof Principal>;
export type PrincipalCreateRequest = z.infer<typeof PrincipalCreateRequest>;
export type PrincipalCreateResponse = z.infer<typeof PrincipalCreateResponse>;
export type PrincipalDeleteRequest = z.infer<typeof PrincipalDeleteRequest>;
export type KVEntry = z.infer<typeof KVEntry>;
export type GetRequest = z.infer<typeof GetRequest>;
export type SetRequest = z.infer<typeof SetRequest>;
export type BulkGetRequest = z.infer<typeof BulkGetRequest>;
export type BulkSetRequest = z.infer<typeof BulkSetRequest>;
export type BlobVisibility = z.infer<typeof BlobVisibility>;
export type BlobMetadata = z.infer<typeof BlobMetadata>;
export type BlobPresignUploadRequest = z.infer<typeof BlobPresignUploadRequest>;
export type BlobGetRequest = z.infer<typeof BlobGetRequest>;
export type BlobDeleteRequest = z.infer<typeof BlobDeleteRequest>;
export type BlobListRequest = z.infer<typeof BlobListRequest>;
export type BlobSetVisibilityRequest = z.infer<typeof BlobSetVisibilityRequest>;
export type ErrorResponse = z.infer<typeof ErrorResponse>;
export type LogMeta = z.infer<typeof LogMeta>;
export type LogEvent = z.infer<typeof LogEvent>;
export type LogCreateRequest = z.infer<typeof LogCreateRequest>;
export type LogCreateResponse = z.infer<typeof LogCreateResponse>;
export type LogListRequest = z.infer<typeof LogListRequest>;
export type LogListResponse = z.infer<typeof LogListResponse>;
export type LogAppendRequest = z.infer<typeof LogAppendRequest>;
export type LogAppendResponse = z.infer<typeof LogAppendResponse>;
export type LogReadRequest = z.infer<typeof LogReadRequest>;
export type LogReadResponse = z.infer<typeof LogReadResponse>;
export type LogTokenCreateRequest = z.infer<typeof LogTokenCreateRequest>;
export type LogTokenCreateResponse = z.infer<typeof LogTokenCreateResponse>;
export type LogCapabilityToken = z.infer<typeof LogCapabilityToken>;
