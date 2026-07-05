/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_constants from "../ai/constants.js";
import type * as ai_index from "../ai/index.js";
import type * as api_agents from "../api/agents.js";
import type * as api_conversations from "../api/conversations.js";
import type * as api_crud_agentVersions from "../api/crud/agentVersions.js";
import type * as api_crud_agents from "../api/crud/agents.js";
import type * as api_crud_batchCallJobs from "../api/crud/batchCallJobs.js";
import type * as api_crud_batchCallRecipients from "../api/crud/batchCallRecipients.js";
import type * as api_crud_composioSessions from "../api/crud/composioSessions.js";
import type * as api_crud_conversationMessages from "../api/crud/conversationMessages.js";
import type * as api_crud_conversations from "../api/crud/conversations.js";
import type * as api_crud_kbChunks from "../api/crud/kbChunks.js";
import type * as api_crud_kbDocuments from "../api/crud/kbDocuments.js";
import type * as api_crud_kbEmbeddings from "../api/crud/kbEmbeddings.js";
import type * as api_crud_mcpConnections from "../api/crud/mcpConnections.js";
import type * as api_crud_phoneNumbers from "../api/crud/phoneNumbers.js";
import type * as api_crud_procedures from "../api/crud/procedures.js";
import type * as api_crud_tenantSettings from "../api/crud/tenantSettings.js";
import type * as api_embeddings from "../api/embeddings.js";
import type * as api_kbSearch from "../api/kbSearch.js";
import type * as api_knowledgeBase from "../api/knowledgeBase.js";
import type * as api_mcpConnections from "../api/mcpConnections.js";
import type * as api_procedures from "../api/procedures.js";
import type * as api_publishCore from "../api/publishCore.js";
import type * as api_registrations from "../api/registrations.js";
import type * as api_tenantSettings from "../api/tenantSettings.js";
import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as resend from "../resend.js";
import type * as tenancy from "../tenancy.js";
import type * as triggers from "../triggers.js";
import type * as utils from "../utils.js";
import type * as workos from "../workos.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "ai/constants": typeof ai_constants;
  "ai/index": typeof ai_index;
  "api/agents": typeof api_agents;
  "api/conversations": typeof api_conversations;
  "api/crud/agentVersions": typeof api_crud_agentVersions;
  "api/crud/agents": typeof api_crud_agents;
  "api/crud/batchCallJobs": typeof api_crud_batchCallJobs;
  "api/crud/batchCallRecipients": typeof api_crud_batchCallRecipients;
  "api/crud/composioSessions": typeof api_crud_composioSessions;
  "api/crud/conversationMessages": typeof api_crud_conversationMessages;
  "api/crud/conversations": typeof api_crud_conversations;
  "api/crud/kbChunks": typeof api_crud_kbChunks;
  "api/crud/kbDocuments": typeof api_crud_kbDocuments;
  "api/crud/kbEmbeddings": typeof api_crud_kbEmbeddings;
  "api/crud/mcpConnections": typeof api_crud_mcpConnections;
  "api/crud/phoneNumbers": typeof api_crud_phoneNumbers;
  "api/crud/procedures": typeof api_crud_procedures;
  "api/crud/tenantSettings": typeof api_crud_tenantSettings;
  "api/embeddings": typeof api_embeddings;
  "api/kbSearch": typeof api_kbSearch;
  "api/knowledgeBase": typeof api_knowledgeBase;
  "api/mcpConnections": typeof api_mcpConnections;
  "api/procedures": typeof api_procedures;
  "api/publishCore": typeof api_publishCore;
  "api/registrations": typeof api_registrations;
  "api/tenantSettings": typeof api_tenantSettings;
  auth: typeof auth;
  http: typeof http;
  lib: typeof lib;
  resend: typeof resend;
  tenancy: typeof tenancy;
  triggers: typeof triggers;
  utils: typeof utils;
  workos: typeof workos;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workOSAuthKit: import("@convex-dev/workos-authkit/_generated/component.js").ComponentApi<"workOSAuthKit">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
};
