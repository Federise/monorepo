import { z } from "zod";

// Authorization
export const AuthorizationHeader = z.string().describe("API Key authorization header in format: ApiKey <key>");

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
  code: z.string(),
  message: z.string(),
});

// Channel schemas

// Channel permission types
export const ChannelPermission = z.enum([
  "read",        // Read non-deleted events
  "append",      // Append new events (renamed from 'write')
  "read:deleted", // Read all events including soft-deleted
  "delete:own",  // Soft-delete events with matching authorId
  "delete:any",  // Soft-delete any event
]);
export type ChannelPermission = z.infer<typeof ChannelPermission>;

// Channel permission input type
export const ChannelPermissionInput = z.enum([
  "read", "append", "read:deleted", "delete:own", "delete:any"
]);
export type ChannelPermissionInput = z.infer<typeof ChannelPermissionInput>;

// Event type discriminator
export const ChannelEventType = z.enum(["message", "deletion"]);
export type ChannelEventType = z.infer<typeof ChannelEventType>;

export const ChannelMeta = z.object({
  channelId: z.string(),
  name: z.string(),
  ownerNamespace: NamespaceValue,
  createdAt: z.string().datetime(),
});

export const ChannelEvent = z.object({
  id: z.string(),
  seq: z.number().int(),
  authorId: z.string(),
  type: ChannelEventType.optional().default("message"), // 'message' or 'deletion'
  content: z.string().optional(), // Optional for deletion events
  targetSeq: z.number().int().optional(), // Only for deletion events - the seq being deleted
  deleted: z.boolean().optional(), // Flag when returning soft-deleted events with read:deleted
  createdAt: z.string().datetime(),
});

export const ChannelCreateRequest = z.object({
  namespace: NamespaceValue,
  name: z.string().min(1).max(100),
});

export const ChannelCreateResponse = z.object({
  metadata: ChannelMeta,
  secret: z.string(),
});

export const ChannelListRequest = z.object({
  namespace: NamespaceValue,
});

export const ChannelListResponse = z.object({
  channels: z.array(ChannelMeta),
});

export const ChannelAppendRequest = z.object({
  channelId: z.string(),
  content: z.string().max(10000),
  authorId: z.string().optional(), // Required for token auth, derived from API key auth
});

export const ChannelAppendResponse = z.object({
  event: ChannelEvent,
});

export const ChannelReadRequest = z.object({
  channelId: z.string(),
  afterSeq: z.number().int().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const ChannelReadResponse = z.object({
  events: z.array(ChannelEvent),
  hasMore: z.boolean(),
});

export const ChannelDeleteRequest = z.object({
  namespace: NamespaceValue,
  channelId: z.string(),
});

export const ChannelDeleteResponse = z.object({
  success: z.boolean(),
});

export const ChannelTokenCreateRequest = z.object({
  namespace: NamespaceValue,
  channelId: z.string(),
  permissions: z.array(ChannelPermissionInput),
  displayName: z.string().max(32).optional(), // User-provided name for the token author
  expiresInSeconds: z.number().int().positive().default(604800), // 7 days
});

export const ChannelTokenCreateResponse = z.object({
  token: z.string(),
  expiresAt: z.string().datetime(),
});

export const ChannelDeleteEventRequest = z.object({
  channelId: z.string(),
  targetSeq: z.number().int().positive(),
  authorId: z.string().optional(), // Required for API key auth, derived from token
});

export const ChannelDeleteEventResponse = z.object({
  event: ChannelEvent,
});


// Admin schemas
export const AdminCheckResponse = z.object({
  kv: z.boolean(),
  blob: z.boolean(),
  presigned_ready: z.boolean(),
});

// Type exports for use in code
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
export type ChannelMeta = z.infer<typeof ChannelMeta>;
export type ChannelEvent = z.infer<typeof ChannelEvent>;
export type ChannelCreateRequest = z.infer<typeof ChannelCreateRequest>;
export type ChannelCreateResponse = z.infer<typeof ChannelCreateResponse>;
export type ChannelListRequest = z.infer<typeof ChannelListRequest>;
export type ChannelListResponse = z.infer<typeof ChannelListResponse>;
export type ChannelAppendRequest = z.infer<typeof ChannelAppendRequest>;
export type ChannelAppendResponse = z.infer<typeof ChannelAppendResponse>;
export type ChannelReadRequest = z.infer<typeof ChannelReadRequest>;
export type ChannelReadResponse = z.infer<typeof ChannelReadResponse>;
export type ChannelDeleteRequest = z.infer<typeof ChannelDeleteRequest>;
export type ChannelDeleteResponse = z.infer<typeof ChannelDeleteResponse>;
export type ChannelTokenCreateRequest = z.infer<typeof ChannelTokenCreateRequest>;
export type ChannelTokenCreateResponse = z.infer<typeof ChannelTokenCreateResponse>;
export type ChannelDeleteEventRequest = z.infer<typeof ChannelDeleteEventRequest>;
export type ChannelDeleteEventResponse = z.infer<typeof ChannelDeleteEventResponse>;

// Short Link schemas
export const ShortLinkSchema = z.object({
  id: z.string(),
  targetUrl: z.string().url(),
  createdAt: z.number().int(),
});

export const ShortLinkCreateRequest = z.object({
  url: z.string().url(),
});

export const ShortLinkCreateResponse = z.object({
  id: z.string(),
  shortUrl: z.string().url(),
  targetUrl: z.string().url(),
});

export const ShortLinkDeleteResponse = z.object({
  success: z.boolean(),
});

// Short Link type exports
export type ShortLinkSchema = z.infer<typeof ShortLinkSchema>;
export type ShortLinkCreateRequest = z.infer<typeof ShortLinkCreateRequest>;
export type ShortLinkCreateResponse = z.infer<typeof ShortLinkCreateResponse>;
export type ShortLinkDeleteResponse = z.infer<typeof ShortLinkDeleteResponse>;
