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

// Blob schemas
export const BlobMetadata = z.object({
  key: z.string(),
  namespace: NamespaceValue,
  size: z.number().int().positive(),
  contentType: z.string(),
  uploadedAt: z.string().datetime(),
  isPublic: z.boolean(),
});

export const BlobUploadResponse = z.object({
  metadata: BlobMetadata,
});

export const BlobPresignUploadRequest = z.object({
  namespace: NamespaceValue,
  key: z.string(),
  contentType: z.string(),
  contentLength: z.number().int().positive(),
  isPublic: z.boolean().optional().default(false),
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

// Error response
export const ErrorResponse = z.object({
  code: z.number().int(),
  message: z.string(),
});

// Admin schemas
export const AdminCheckResponse = z.object({
  kv: z.boolean(),
  r2_private: z.boolean(),
  r2_public: z.boolean(),
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
export type BlobMetadata = z.infer<typeof BlobMetadata>;
export type BlobPresignUploadRequest = z.infer<typeof BlobPresignUploadRequest>;
export type BlobGetRequest = z.infer<typeof BlobGetRequest>;
export type BlobDeleteRequest = z.infer<typeof BlobDeleteRequest>;
export type BlobListRequest = z.infer<typeof BlobListRequest>;
export type ErrorResponse = z.infer<typeof ErrorResponse>;
