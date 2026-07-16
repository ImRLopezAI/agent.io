/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: {
  api: {
    agents: {
      create: FunctionReference<
        "mutation",
        "public",
        {
          draft: {
            audio?: {
              input: {
                format: "pcm16" | "g711_ulaw" | "g711_alaw";
                transcription?: boolean;
              };
              output: {
                format: "pcm16" | "g711_ulaw" | "g711_alaw";
                speed?: number;
              };
            };
            dynamicVariableDefaults?: Record<string, string>;
            inboundWorkflow: {
              enabled?: boolean;
              firstSpeaker: "agent" | "caller";
              idleTimeoutSecs?: number;
              maxDurationSecs?: number;
              openingMessage?: string;
            };
            instructions?: string;
            knowledgeBase?: Array<{
              documentId: string;
              usageMode: "auto" | "prompt";
            }>;
            mcp?: Array<{
              connectionId: string;
              requireApproval?: "never" | "always";
              toolkits?:
                | { mode: "enable"; values: Array<string> }
                | { mode: "disable"; values: Array<string> };
              tools?: Record<
                string,
                | { mode: "enable"; values: Array<string> }
                | { mode: "disable"; values: Array<string> }
              >;
            }>;
            model: { model: string; provider: "openai" | "xai" };
            outboundWorkflow: {
              enabled?: boolean;
              firstSpeaker?: "agent";
              idleTimeoutSecs?: number;
              maxDurationSecs?: number;
              openingMessage?: string;
            };
            systemTools?: {
              end_call?: { enabled: boolean };
              language_detection?: { enabled: boolean };
              play_keypad_touch_tone?: { enabled: boolean };
              skip_turn?: { enabled: boolean };
              transfer_to_agent?: {
                enabled: boolean;
                transfers: Array<{ agentId: string; condition: string }>;
              };
              transfer_to_number?: {
                enabled: boolean;
                transfers: Array<{ condition: string; target: string }>;
              };
              voicemail_detection?: {
                enabled: boolean;
                voicemailMessage?: string;
              };
            };
            vad:
              | {
                  idleTimeoutMs?: number;
                  mode: "server_vad";
                  silenceMs?: number;
                }
              | { eagerness?: "low" | "medium" | "high"; mode: "semantic_vad" }
              | { mode: "manual" };
            voice: string;
          };
          name: string;
        },
        any
      >;
      get: FunctionReference<"query", "public", { id: string }, any>;
      list: FunctionReference<
        "query",
        "public",
        {
          archived?: boolean;
          paginationOpts: { cursor: string | null; numItems: number };
        },
        any
      >;
      publish: FunctionReference<"mutation", "public", { id: string }, any>;
      remove: FunctionReference<"mutation", "public", { id: string }, any>;
      update: FunctionReference<
        "mutation",
        "public",
        {
          id: string;
          patch: {
            allocationRevision?: number;
            archived?: boolean;
            name?: string;
          };
        },
        any
      >;
    };
    agentVariants: {
      create: FunctionReference<
        "mutation",
        "public",
        { agentId: string; name: string },
        any
      >;
      get: FunctionReference<"query", "public", { id: string }, any>;
      listByAgent: FunctionReference<
        "query",
        "public",
        {
          agentId: string;
          paginationOpts: { cursor: string | null; numItems: number };
        },
        any
      >;
      mergeToMain: FunctionReference<
        "mutation",
        "public",
        { sourceVariantId: string },
        any
      >;
      publish: FunctionReference<"mutation", "public", { id: string }, any>;
      remove: FunctionReference<"mutation", "public", { id: string }, any>;
      setTrafficAllocation: FunctionReference<
        "mutation",
        "public",
        {
          agentId: string;
          allocation: Array<{ variantId: string; weightBps: number }>;
        },
        any
      >;
      update: FunctionReference<
        "mutation",
        "public",
        {
          id: string;
          patch: {
            draft?: {
              audio?: {
                input: {
                  format: "pcm16" | "g711_ulaw" | "g711_alaw";
                  transcription?: boolean;
                };
                output: {
                  format: "pcm16" | "g711_ulaw" | "g711_alaw";
                  speed?: number;
                };
              };
              dynamicVariableDefaults?: Record<string, string>;
              inboundWorkflow?: {
                enabled?: boolean;
                firstSpeaker: "agent" | "caller";
                idleTimeoutSecs?: number;
                maxDurationSecs?: number;
                openingMessage?: string;
              };
              instructions?: string;
              knowledgeBase?: Array<{
                documentId: string;
                usageMode: "auto" | "prompt";
              }>;
              mcp?: Array<{
                connectionId: string;
                requireApproval?: "never" | "always";
                toolkits?:
                  | { mode: "enable"; values: Array<string> }
                  | { mode: "disable"; values: Array<string> };
                tools?: Record<
                  string,
                  | { mode: "enable"; values: Array<string> }
                  | { mode: "disable"; values: Array<string> }
                >;
              }>;
              model?: { model: string; provider: "openai" | "xai" };
              outboundWorkflow?: {
                enabled?: boolean;
                firstSpeaker?: "agent";
                idleTimeoutSecs?: number;
                maxDurationSecs?: number;
                openingMessage?: string;
              };
              systemTools?: {
                end_call?: { enabled: boolean };
                language_detection?: { enabled: boolean };
                play_keypad_touch_tone?: { enabled: boolean };
                skip_turn?: { enabled: boolean };
                transfer_to_agent?: {
                  enabled: boolean;
                  transfers: Array<{ agentId: string; condition: string }>;
                };
                transfer_to_number?: {
                  enabled: boolean;
                  transfers: Array<{ condition: string; target: string }>;
                };
                voicemail_detection?: {
                  enabled: boolean;
                  voicemailMessage?: string;
                };
              };
              vad?:
                | {
                    idleTimeoutMs?: number;
                    mode: "server_vad";
                    silenceMs?: number;
                  }
                | {
                    eagerness?: "low" | "medium" | "high";
                    mode: "semantic_vad";
                  }
                | { mode: "manual" };
              voice?: string;
            };
            name?: string;
          };
        },
        any
      >;
    };
    conversations: {
      get: FunctionReference<
        "query",
        "public",
        { conversationId: string },
        any
      >;
      list: FunctionReference<
        "query",
        "public",
        {
          agentId?: string;
          channel?:
            "voice_inbound" | "voice_outbound" | "whatsapp" | "sms" | "web";
          direction?: "inbound" | "outbound";
          paginationOpts: { cursor: string | null; numItems: number };
          status?:
            "initiated" | "in_progress" | "processing" | "done" | "failed";
        },
        any
      >;
      messages: FunctionReference<
        "query",
        "public",
        {
          conversationId: string;
          paginationOpts: { cursor: string | null; numItems: number };
        },
        any
      >;
      searchTranscripts: FunctionReference<
        "query",
        "public",
        {
          agentId?: string;
          conversationId?: string;
          paginationOpts: { cursor: string | null; numItems: number };
          role?: "user" | "agent" | "system";
          text: string;
        },
        any
      >;
    };
    knowledgeBase: {
      archiveDocument: FunctionReference<
        "action",
        "public",
        { documentId: string },
        any
      >;
      createDocument: FunctionReference<"mutation", "public", {}, any>;
      getDocument: FunctionReference<
        "query",
        "public",
        { documentId: string },
        any
      >;
      listDocumentChunks: FunctionReference<
        "query",
        "public",
        {
          documentId: string;
          paginationOpts: { cursor: string | null; numItems: number };
        },
        any
      >;
      listDocuments: FunctionReference<
        "query",
        "public",
        {
          archived?: boolean;
          paginationOpts: { cursor: string | null; numItems: number };
        },
        any
      >;
      upsertKnowledgeContent: FunctionReference<
        "action",
        "public",
        {
          documentId: string;
          metadata?: {
            sourceType?: "text" | "url" | "file";
            sourceUrl?: string | null;
            title: string;
          };
          text: string;
        },
        any
      >;
    };
    mcpConnections: {
      create: FunctionReference<
        "mutation",
        "public",
        {
          allowedTools?: Array<string>;
          approvalPolicy?:
            | "auto_approve_all"
            | "require_approval_all"
            | "require_approval_per_tool";
          composioAccountId?: string;
          description?: string;
          kind: "composio" | "byo";
          name: string;
          responseTimeoutSecs?: number;
          status?: "active" | "disabled" | "error";
          toolApprovals?: Array<{
            policy: "auto_approved" | "requires_approval";
            toolHash: string;
            toolName: string;
          }>;
          toolConfigOverrides?: Array<{
            inputOverrides?: Record<
              string,
              | { source: "constant"; value: string }
              | { name: string; source: "dynamic_variable" }
              | { prompt?: string; source: "llm" }
              | { source: "omit" }
            >;
            toolName: string;
          }>;
          toolkitSlugs?: Array<string>;
          transport?: "sse" | "streamable_http";
          url?: string;
        },
        any
      >;
      get: FunctionReference<"query", "public", { id: string }, any>;
      list: FunctionReference<
        "query",
        "public",
        {
          kind?: "composio" | "byo";
          paginationOpts: { cursor: string | null; numItems: number };
          status?: "active" | "disabled" | "error";
        },
        any
      >;
      remove: FunctionReference<"mutation", "public", { id: string }, any>;
      update: FunctionReference<
        "mutation",
        "public",
        {
          id: string;
          patch: {
            allowedTools?: Array<string>;
            approvalPolicy?:
              | "auto_approve_all"
              | "require_approval_all"
              | "require_approval_per_tool";
            composioAccountId?: string;
            description?: string;
            kind?: "composio" | "byo";
            name?: string;
            responseTimeoutSecs?: number;
            status?: "active" | "disabled" | "error";
            toolApprovals?: Array<{
              policy: "auto_approved" | "requires_approval";
              toolHash: string;
              toolName: string;
            }>;
            toolConfigOverrides?: Array<{
              inputOverrides?: Record<
                string,
                | { source: "constant"; value: string }
                | { name: string; source: "dynamic_variable" }
                | { prompt?: string; source: "llm" }
                | { source: "omit" }
              >;
              toolName: string;
            }>;
            toolkitSlugs?: Array<string>;
            transport?: "sse" | "streamable_http";
            url?: string;
          };
        },
        any
      >;
    };
    phoneNumbers: {
      archive: FunctionReference<
        "mutation",
        "public",
        { phoneNumberId: string },
        any
      >;
      assign: FunctionReference<
        "mutation",
        "public",
        { agentId: string | null; phoneNumberId: string },
        any
      >;
      get: FunctionReference<"query", "public", { phoneNumberId: string }, any>;
      list: FunctionReference<
        "query",
        "public",
        {
          agentId?: string;
          connectionId?: string;
          countryCode?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            numItems: number;
          };
          provider?: "twilio" | "sip_trunk";
          regionCode?: string;
          status?:
            "pending" | "active" | "disabled" | "provider_missing" | "archived";
        },
        any
      >;
      setStatus: FunctionReference<
        "mutation",
        "public",
        {
          phoneNumberId: string;
          status:
            "pending" | "active" | "disabled" | "provider_missing" | "archived";
        },
        any
      >;
      updateConfiguration: FunctionReference<
        "mutation",
        "public",
        {
          patch: {
            inboundSmsEnabled?: boolean;
            label?: string;
            routingRegion?: string | null;
          };
          phoneNumberId: string;
        },
        any
      >;
    };
    procedures: {
      create: FunctionReference<
        "mutation",
        "public",
        {
          agentVariantId: Id<"agentVariants">;
          content?: string;
          name: string;
          references?: Array<{
            health?: "valid" | "invalid" | "unavailable";
            location: "trigger" | "content";
            targetId: string;
            targetType:
              "system_tool" | "mcp_tool" | "knowledge_base" | "procedure";
          }>;
          source?: "manual" | "sop_import" | "generated";
          status?: "draft" | "active" | "archived";
          steps?: Array<
            | { instruction: string; type: "ask" }
            | { instruction: string; type: "tell" }
            | { text: string; type: "say" }
            | { instruction?: string; toolRef: string; type: "tool" }
            | {
                condition:
                  | { description: string; kind: "natural_language" }
                  | { expression: string; kind: "expression" };
                steps: Array<
                  | { instruction: string; type: "ask" }
                  | { instruction: string; type: "tell" }
                  | { text: string; type: "say" }
                  | { instruction?: string; toolRef: string; type: "tool" }
                >;
                type: "if";
              }
          >;
          trigger: string;
          type: "free_form" | "structured";
        },
        any
      >;
      get: FunctionReference<"query", "public", { id: string }, any>;
      listByVariant: FunctionReference<
        "query",
        "public",
        {
          agentVariantId: string;
          paginationOpts: { cursor: string | null; numItems: number };
          status?: "draft" | "active" | "archived";
        },
        any
      >;
      remove: FunctionReference<"mutation", "public", { id: string }, any>;
      update: FunctionReference<
        "mutation",
        "public",
        {
          id: string;
          patch: {
            content?: string;
            name?: string;
            references?: Array<{
              health?: "valid" | "invalid" | "unavailable";
              location: "trigger" | "content";
              targetId: string;
              targetType:
                "system_tool" | "mcp_tool" | "knowledge_base" | "procedure";
            }>;
            source?: "manual" | "sop_import" | "generated";
            status?: "draft" | "active" | "archived";
            steps?: Array<
              | { instruction: string; type: "ask" }
              | { instruction: string; type: "tell" }
              | { text: string; type: "say" }
              | { instruction?: string; toolRef: string; type: "tool" }
              | {
                  condition:
                    | { description: string; kind: "natural_language" }
                    | { expression: string; kind: "expression" };
                  steps: Array<
                    | { instruction: string; type: "ask" }
                    | { instruction: string; type: "tell" }
                    | { text: string; type: "say" }
                    | { instruction?: string; toolRef: string; type: "tool" }
                  >;
                  type: "if";
                }
            >;
            trigger?: string;
          };
        },
        any
      >;
    };
    telephonyConnections: {
      archive: FunctionReference<
        "mutation",
        "public",
        { connectionId: string },
        any
      >;
      create: FunctionReference<
        "mutation",
        "public",
        {
          credentialSecretRef: string;
          defaultRoutingRegion?: string;
          label?: string;
          lastError?: string;
          lastSyncedAt?: string;
          provider: "twilio" | "sip_trunk";
          providerAccountId: string;
          status:
            | "pending_verification"
            | "active"
            | "disabled"
            | "error"
            | "archived";
        },
        any
      >;
      get: FunctionReference<"query", "public", { connectionId: string }, any>;
      list: FunctionReference<
        "query",
        "public",
        {
          paginationOpts: { cursor: string | null; numItems: number };
          provider?: "twilio" | "sip_trunk";
          status?:
            | "pending_verification"
            | "active"
            | "disabled"
            | "error"
            | "archived";
        },
        any
      >;
      setStatus: FunctionReference<
        "mutation",
        "public",
        {
          connectionId: string;
          status:
            | "pending_verification"
            | "active"
            | "disabled"
            | "error"
            | "archived";
        },
        any
      >;
      update: FunctionReference<
        "mutation",
        "public",
        {
          connectionId: string;
          patch: { defaultRoutingRegion?: string | null; label?: string };
        },
        any
      >;
    };
    tenantSettings: {
      get: FunctionReference<"query", "public", {}, any>;
      patch: FunctionReference<
        "mutation",
        "public",
        {
          concurrencyLimit?: number;
          dailyCallLimit?: number;
          recordingEnabled?: boolean;
          transcriptRetentionDays?: number;
        },
        any
      >;
    };
  };
};

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: {
  api: {
    conversations: {
      appendMessage: FunctionReference<
        "mutation",
        "internal",
        {
          audioStorageId?: string;
          interrupted?: boolean;
          messageKey?: string;
          ownerId: Id<"conversations">;
          role: "user" | "agent" | "system";
          text?: string;
          timeInCallSecs?: number;
          toolCalls?: Array<{ argsJson: string; callId: string; name: string }>;
          toolResults?: Array<{
            callId: string;
            isError?: boolean;
            latencyMs?: number;
            output: string;
            retrievalEntryIds?: Array<string>;
          }>;
        },
        any
      >;
      finish: FunctionReference<
        "mutation",
        "internal",
        {
          durationSecs?: number;
          ownerId: Id<"conversations">;
          status: "done" | "failed";
          terminationReason?: string;
          usage?: {
            costUsd?: number;
            inputTokens: number;
            outputTokens: number;
          };
        },
        any
      >;
      getMachineStartResult: FunctionReference<
        "query",
        "internal",
        { conversationId: Id<"conversations"> },
        any
      >;
      resolveInboundPhoneNumber: FunctionReference<
        "query",
        "internal",
        {
          providerNumberId: string;
          telephonyConnectionId: Id<"telephonyConnections">;
        },
        any
      >;
      startFromPhoneNumber: FunctionReference<
        "mutation",
        "internal",
        {
          conversationKey: string;
          externalNumber?: string;
          ownerId: Id<"phoneNumbers">;
          provider: "openai" | "xai";
          providerSessionId?: string;
        },
        any
      >;
      startFromVersion: FunctionReference<
        "mutation",
        "internal",
        {
          channel: "sms" | "web";
          conversationKey: string;
          direction: "inbound" | "outbound";
          externalNumber?: string;
          ownerId: Id<"agentVersions">;
          provider: "openai" | "xai";
          providerSessionId?: string;
        },
        any
      >;
      startFromWhatsappAccount: FunctionReference<
        "mutation",
        "internal",
        {
          conversationKey: string;
          direction: "inbound" | "outbound";
          externalNumber?: string;
          ownerId: Id<"whatsappAccounts">;
          provider: "openai" | "xai";
          providerSessionId?: string;
        },
        any
      >;
      startOutboundFromRecipient: FunctionReference<
        "mutation",
        "internal",
        {
          agentVariantOverrideId?: string;
          conversationKey: string;
          destinationCountryCode?: string;
          destinationRegionCode?: string;
          externalNumber?: string;
          ownerId: Id<"batchCallRecipients">;
          provider: "openai" | "xai";
          providerSessionId?: string;
        },
        any
      >;
    };
    internals: {
      agents: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"agents">;
            allocationRevision?: number;
            archived?: boolean;
            createdAt: string;
            mainVariantId?: Id<"agentVariants">;
            name: string;
            tenant: string;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"agents"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<"query", "internal", { id: Id<"agents"> }, any>;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"agents">;
            patch: {
              _creationTime?: number;
              _id?: Id<"agents">;
              allocationRevision?: number;
              archived?: boolean;
              createdAt?: string;
              mainVariantId?: Id<"agentVariants">;
              name?: string;
              tenant?: string;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      agentVariants: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"agentVariants">;
            agentId: Id<"agents">;
            allocationOrdinal: number;
            archived?: boolean;
            createdAt: string;
            draft: {
              audio?: {
                input: {
                  format: "pcm16" | "g711_ulaw" | "g711_alaw";
                  transcription?: boolean;
                };
                output: {
                  format: "pcm16" | "g711_ulaw" | "g711_alaw";
                  speed?: number;
                };
              };
              dynamicVariableDefaults?: Record<string, string>;
              inboundWorkflow: {
                enabled?: boolean;
                firstSpeaker: "agent" | "caller";
                idleTimeoutSecs?: number;
                maxDurationSecs?: number;
                openingMessage?: string;
              };
              instructions?: string;
              knowledgeBase?: Array<{
                documentId: string;
                usageMode: "auto" | "prompt";
              }>;
              mcp?: Array<{
                connectionId: string;
                requireApproval?: "never" | "always";
                toolkits?:
                  | { mode: "enable"; values: Array<string> }
                  | { mode: "disable"; values: Array<string> };
                tools?: Record<
                  string,
                  | { mode: "enable"; values: Array<string> }
                  | { mode: "disable"; values: Array<string> }
                >;
              }>;
              model: { model: string; provider: "openai" | "xai" };
              outboundWorkflow: {
                enabled?: boolean;
                firstSpeaker?: "agent";
                idleTimeoutSecs?: number;
                maxDurationSecs?: number;
                openingMessage?: string;
              };
              systemTools?: {
                end_call?: { enabled: boolean };
                language_detection?: { enabled: boolean };
                play_keypad_touch_tone?: { enabled: boolean };
                skip_turn?: { enabled: boolean };
                transfer_to_agent?: {
                  enabled: boolean;
                  transfers: Array<{ agentId: string; condition: string }>;
                };
                transfer_to_number?: {
                  enabled: boolean;
                  transfers: Array<{ condition: string; target: string }>;
                };
                voicemail_detection?: {
                  enabled: boolean;
                  voicemailMessage?: string;
                };
              };
              vad:
                | {
                    idleTimeoutMs?: number;
                    mode: "server_vad";
                    silenceMs?: number;
                  }
                | {
                    eagerness?: "low" | "medium" | "high";
                    mode: "semantic_vad";
                  }
                | { mode: "manual" };
              voice: string;
            };
            isMain?: boolean;
            name: string;
            publishedVersionId?: Id<"agentVersions">;
            tenant: string;
            trafficWeightBps?: number;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"agentVariants"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"agentVariants"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"agentVariants">;
            patch: {
              _creationTime?: number;
              _id?: Id<"agentVariants">;
              agentId?: Id<"agents">;
              allocationOrdinal?: number;
              archived?: boolean;
              createdAt?: string;
              draft?: {
                audio?: {
                  input: {
                    format: "pcm16" | "g711_ulaw" | "g711_alaw";
                    transcription?: boolean;
                  };
                  output: {
                    format: "pcm16" | "g711_ulaw" | "g711_alaw";
                    speed?: number;
                  };
                };
                dynamicVariableDefaults?: Record<string, string>;
                inboundWorkflow: {
                  enabled?: boolean;
                  firstSpeaker: "agent" | "caller";
                  idleTimeoutSecs?: number;
                  maxDurationSecs?: number;
                  openingMessage?: string;
                };
                instructions?: string;
                knowledgeBase?: Array<{
                  documentId: string;
                  usageMode: "auto" | "prompt";
                }>;
                mcp?: Array<{
                  connectionId: string;
                  requireApproval?: "never" | "always";
                  toolkits?:
                    | { mode: "enable"; values: Array<string> }
                    | { mode: "disable"; values: Array<string> };
                  tools?: Record<
                    string,
                    | { mode: "enable"; values: Array<string> }
                    | { mode: "disable"; values: Array<string> }
                  >;
                }>;
                model: { model: string; provider: "openai" | "xai" };
                outboundWorkflow: {
                  enabled?: boolean;
                  firstSpeaker?: "agent";
                  idleTimeoutSecs?: number;
                  maxDurationSecs?: number;
                  openingMessage?: string;
                };
                systemTools?: {
                  end_call?: { enabled: boolean };
                  language_detection?: { enabled: boolean };
                  play_keypad_touch_tone?: { enabled: boolean };
                  skip_turn?: { enabled: boolean };
                  transfer_to_agent?: {
                    enabled: boolean;
                    transfers: Array<{ agentId: string; condition: string }>;
                  };
                  transfer_to_number?: {
                    enabled: boolean;
                    transfers: Array<{ condition: string; target: string }>;
                  };
                  voicemail_detection?: {
                    enabled: boolean;
                    voicemailMessage?: string;
                  };
                };
                vad:
                  | {
                      idleTimeoutMs?: number;
                      mode: "server_vad";
                      silenceMs?: number;
                    }
                  | {
                      eagerness?: "low" | "medium" | "high";
                      mode: "semantic_vad";
                    }
                  | { mode: "manual" };
                voice: string;
              };
              isMain?: boolean;
              name?: string;
              publishedVersionId?: Id<"agentVersions">;
              tenant?: string;
              trafficWeightBps?: number;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      agentVersions: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"agentVersions">;
            agentId: Id<"agents">;
            agentVariantId: Id<"agentVariants">;
            config: {
              audio?: {
                input: {
                  format: "pcm16" | "g711_ulaw" | "g711_alaw";
                  transcription?: boolean;
                };
                output: {
                  format: "pcm16" | "g711_ulaw" | "g711_alaw";
                  speed?: number;
                };
              };
              dynamicVariableDefaults?: Record<string, string>;
              inboundWorkflow: {
                enabled?: boolean;
                firstSpeaker: "agent" | "caller";
                idleTimeoutSecs?: number;
                maxDurationSecs?: number;
                openingMessage?: string;
              };
              instructions?: string;
              knowledgeBase?: Array<{
                documentId: string;
                usageMode: "auto" | "prompt";
              }>;
              mcp?: Array<{
                connectionId: string;
                requireApproval?: "never" | "always";
                toolkits?:
                  | { mode: "enable"; values: Array<string> }
                  | { mode: "disable"; values: Array<string> };
                tools?: Record<
                  string,
                  | { mode: "enable"; values: Array<string> }
                  | { mode: "disable"; values: Array<string> }
                >;
              }>;
              model: { model: string; provider: "openai" | "xai" };
              outboundWorkflow: {
                enabled?: boolean;
                firstSpeaker?: "agent";
                idleTimeoutSecs?: number;
                maxDurationSecs?: number;
                openingMessage?: string;
              };
              procedures:
                | {
                    items: Array<{
                      content?: string;
                      name: string;
                      references: Array<{
                        health?: "valid" | "invalid" | "unavailable";
                        location: "trigger" | "content";
                        targetId: string;
                        targetType:
                          | "system_tool"
                          | "mcp_tool"
                          | "knowledge_base"
                          | "procedure";
                      }>;
                      sourceProcedureId: string;
                      steps?: Array<
                        | { instruction: string; type: "ask" }
                        | { instruction: string; type: "tell" }
                        | { text: string; type: "say" }
                        | {
                            instruction?: string;
                            toolRef: string;
                            type: "tool";
                          }
                        | {
                            condition:
                              | {
                                  description: string;
                                  kind: "natural_language";
                                }
                              | { expression: string; kind: "expression" };
                            steps: Array<
                              | { instruction: string; type: "ask" }
                              | { instruction: string; type: "tell" }
                              | { text: string; type: "say" }
                              | {
                                  instruction?: string;
                                  toolRef: string;
                                  type: "tool";
                                }
                            >;
                            type: "if";
                          }
                      >;
                      trigger: string;
                      type: "free_form" | "structured";
                    }>;
                    kind: "inline";
                  }
                | { kind: "refs"; procedureVersionIds: Array<string> };
              systemTools?: {
                end_call?: { enabled: boolean };
                language_detection?: { enabled: boolean };
                play_keypad_touch_tone?: { enabled: boolean };
                skip_turn?: { enabled: boolean };
                transfer_to_agent?: {
                  enabled: boolean;
                  transfers: Array<{ agentId: string; condition: string }>;
                };
                transfer_to_number?: {
                  enabled: boolean;
                  transfers: Array<{ condition: string; target: string }>;
                };
                voicemail_detection?: {
                  enabled: boolean;
                  voicemailMessage?: string;
                };
              };
              vad:
                | {
                    idleTimeoutMs?: number;
                    mode: "server_vad";
                    silenceMs?: number;
                  }
                | {
                    eagerness?: "low" | "medium" | "high";
                    mode: "semantic_vad";
                  }
                | { mode: "manual" };
              voice: string;
            };
            createdAt: string;
            publishedBy: string;
            tenant: string;
            updatedAt?: string;
            version: number;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"agentVersions"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"agentVersions"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"agentVersions">;
            patch: {
              _creationTime?: number;
              _id?: Id<"agentVersions">;
              agentId?: Id<"agents">;
              agentVariantId?: Id<"agentVariants">;
              config?: {
                audio?: {
                  input: {
                    format: "pcm16" | "g711_ulaw" | "g711_alaw";
                    transcription?: boolean;
                  };
                  output: {
                    format: "pcm16" | "g711_ulaw" | "g711_alaw";
                    speed?: number;
                  };
                };
                dynamicVariableDefaults?: Record<string, string>;
                inboundWorkflow: {
                  enabled?: boolean;
                  firstSpeaker: "agent" | "caller";
                  idleTimeoutSecs?: number;
                  maxDurationSecs?: number;
                  openingMessage?: string;
                };
                instructions?: string;
                knowledgeBase?: Array<{
                  documentId: string;
                  usageMode: "auto" | "prompt";
                }>;
                mcp?: Array<{
                  connectionId: string;
                  requireApproval?: "never" | "always";
                  toolkits?:
                    | { mode: "enable"; values: Array<string> }
                    | { mode: "disable"; values: Array<string> };
                  tools?: Record<
                    string,
                    | { mode: "enable"; values: Array<string> }
                    | { mode: "disable"; values: Array<string> }
                  >;
                }>;
                model: { model: string; provider: "openai" | "xai" };
                outboundWorkflow: {
                  enabled?: boolean;
                  firstSpeaker?: "agent";
                  idleTimeoutSecs?: number;
                  maxDurationSecs?: number;
                  openingMessage?: string;
                };
                procedures:
                  | {
                      items: Array<{
                        content?: string;
                        name: string;
                        references: Array<{
                          health?: "valid" | "invalid" | "unavailable";
                          location: "trigger" | "content";
                          targetId: string;
                          targetType:
                            | "system_tool"
                            | "mcp_tool"
                            | "knowledge_base"
                            | "procedure";
                        }>;
                        sourceProcedureId: string;
                        steps?: Array<
                          | { instruction: string; type: "ask" }
                          | { instruction: string; type: "tell" }
                          | { text: string; type: "say" }
                          | {
                              instruction?: string;
                              toolRef: string;
                              type: "tool";
                            }
                          | {
                              condition:
                                | {
                                    description: string;
                                    kind: "natural_language";
                                  }
                                | { expression: string; kind: "expression" };
                              steps: Array<
                                | { instruction: string; type: "ask" }
                                | { instruction: string; type: "tell" }
                                | { text: string; type: "say" }
                                | {
                                    instruction?: string;
                                    toolRef: string;
                                    type: "tool";
                                  }
                              >;
                              type: "if";
                            }
                        >;
                        trigger: string;
                        type: "free_form" | "structured";
                      }>;
                      kind: "inline";
                    }
                  | { kind: "refs"; procedureVersionIds: Array<string> };
                systemTools?: {
                  end_call?: { enabled: boolean };
                  language_detection?: { enabled: boolean };
                  play_keypad_touch_tone?: { enabled: boolean };
                  skip_turn?: { enabled: boolean };
                  transfer_to_agent?: {
                    enabled: boolean;
                    transfers: Array<{ agentId: string; condition: string }>;
                  };
                  transfer_to_number?: {
                    enabled: boolean;
                    transfers: Array<{ condition: string; target: string }>;
                  };
                  voicemail_detection?: {
                    enabled: boolean;
                    voicemailMessage?: string;
                  };
                };
                vad:
                  | {
                      idleTimeoutMs?: number;
                      mode: "server_vad";
                      silenceMs?: number;
                    }
                  | {
                      eagerness?: "low" | "medium" | "high";
                      mode: "semantic_vad";
                    }
                  | { mode: "manual" };
                voice: string;
              };
              createdAt?: string;
              publishedBy?: string;
              tenant?: string;
              updatedAt?: string;
              version?: number;
            };
          },
          any
        >;
      };
      batchCallJobs: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"batchCallJobs">;
            agentId: Id<"agents">;
            agentVariantOverrideId?: Id<"agentVariants">;
            callerIdPolicy: {
              defaultPhoneNumberId: string;
              rules: Array<{
                destinationCountryCode?: string;
                destinationRegionCode?: string;
                id: string;
                phoneNumberId: string;
              }>;
            };
            createdAt: string;
            name: string;
            ringingTimeoutSecs?: number;
            scheduledAt?: string;
            status:
              "pending" | "in_progress" | "completed" | "failed" | "cancelled";
            targetConcurrency?: number;
            tenant: string;
            timezone?: string;
            totalDispatched?: number;
            totalFinished?: number;
            totalScheduled?: number;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"batchCallJobs"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"batchCallJobs"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"batchCallJobs">;
            patch: {
              _creationTime?: number;
              _id?: Id<"batchCallJobs">;
              agentId?: Id<"agents">;
              agentVariantOverrideId?: Id<"agentVariants">;
              callerIdPolicy?: {
                defaultPhoneNumberId: string;
                rules: Array<{
                  destinationCountryCode?: string;
                  destinationRegionCode?: string;
                  id: string;
                  phoneNumberId: string;
                }>;
              };
              createdAt?: string;
              name?: string;
              ringingTimeoutSecs?: number;
              scheduledAt?: string;
              status?:
                | "pending"
                | "in_progress"
                | "completed"
                | "failed"
                | "cancelled";
              targetConcurrency?: number;
              tenant?: string;
              timezone?: string;
              totalDispatched?: number;
              totalFinished?: number;
              totalScheduled?: number;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      batchCallRecipients: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"batchCallRecipients">;
            batchId: Id<"batchCallJobs">;
            callerIdSelectionReason?: string;
            conversationId?: Id<"conversations">;
            createdAt: string;
            dynamicVariables?: Record<string, string>;
            phoneNumber: string;
            selectedPhoneNumberId?: Id<"phoneNumbers">;
            status:
              | "pending"
              | "dispatched"
              | "initiated"
              | "in_progress"
              | "completed"
              | "failed"
              | "cancelled"
              | "voicemail";
            tenant: string;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"batchCallRecipients"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"batchCallRecipients"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"batchCallRecipients">;
            patch: {
              _creationTime?: number;
              _id?: Id<"batchCallRecipients">;
              batchId?: Id<"batchCallJobs">;
              callerIdSelectionReason?: string;
              conversationId?: Id<"conversations">;
              createdAt?: string;
              dynamicVariables?: Record<string, string>;
              phoneNumber?: string;
              selectedPhoneNumberId?: Id<"phoneNumbers">;
              status?:
                | "pending"
                | "dispatched"
                | "initiated"
                | "in_progress"
                | "completed"
                | "failed"
                | "cancelled"
                | "voicemail";
              tenant?: string;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      composioSessions: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"composioSessions">;
            configHash: string;
            connectionId: Id<"mcpConnections">;
            createdAt: string;
            sessionId: string;
            tenant: string;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"composioSessions"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"composioSessions"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"composioSessions">;
            patch: {
              _creationTime?: number;
              _id?: Id<"composioSessions">;
              configHash?: string;
              connectionId?: Id<"mcpConnections">;
              createdAt?: string;
              sessionId?: string;
              tenant?: string;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      conversationMessages: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"conversationMessages">;
            agentId: Id<"agents">;
            agentVariantId: Id<"agentVariants">;
            audioStorageId?: string;
            conversationId: Id<"conversations">;
            createdAt: string;
            idempotencyFingerprint?: string;
            interrupted?: boolean;
            messageKey?: string;
            role: "user" | "agent" | "system";
            sequence: number;
            tenant: string;
            text?: string;
            timeInCallSecs?: number;
            toolCalls?: Array<{
              argsJson: string;
              callId: string;
              name: string;
            }>;
            toolResults?: Array<{
              callId: string;
              isError?: boolean;
              latencyMs?: number;
              output: string;
              retrievalEntryIds?: Array<string>;
            }>;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"conversationMessages"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"conversationMessages"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"conversationMessages">;
            patch: {
              _creationTime?: number;
              _id?: Id<"conversationMessages">;
              agentId?: Id<"agents">;
              agentVariantId?: Id<"agentVariants">;
              audioStorageId?: string;
              conversationId?: Id<"conversations">;
              createdAt?: string;
              idempotencyFingerprint?: string;
              interrupted?: boolean;
              messageKey?: string;
              role?: "user" | "agent" | "system";
              sequence?: number;
              tenant?: string;
              text?: string;
              timeInCallSecs?: number;
              toolCalls?: Array<{
                argsJson: string;
                callId: string;
                name: string;
              }>;
              toolResults?: Array<{
                callId: string;
                isError?: boolean;
                latencyMs?: number;
                output: string;
                retrievalEntryIds?: Array<string>;
              }>;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      conversations: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"conversations">;
            acceptedAt?: string;
            agentId: Id<"agents">;
            agentVariantId: Id<"agentVariants">;
            agentVersionId: Id<"agentVersions">;
            allocationBucket?: number;
            allocationMode: "weighted" | "override" | "direct";
            allocationRevision?: number;
            batchCallRecipientId?: Id<"batchCallRecipients">;
            callerIdSelectionReason?: string;
            channel:
              "voice_inbound" | "voice_outbound" | "whatsapp" | "sms" | "web";
            conversationKey: string;
            createdAt: string;
            direction: "inbound" | "outbound";
            durationSecs?: number;
            endedAt?: string;
            externalNumber?: string;
            hasAudio?: boolean;
            idempotencyFingerprint: string;
            messageCount?: number;
            phoneNumberId?: Id<"phoneNumbers">;
            phoneNumberSnapshot?: {
              number: string;
              provider: "twilio" | "sip_trunk";
              providerNumberId: string;
              telephonyConnectionId: string;
            };
            provider: "openai" | "xai";
            providerSessionId?: string;
            startedAt: string;
            status:
              "initiated" | "in_progress" | "processing" | "done" | "failed";
            successStatus?: "success" | "failure" | "unknown";
            summary?: string;
            tenant: string;
            terminationReason?: string;
            updatedAt?: string;
            usage?: {
              costUsd?: number;
              inputTokens: number;
              outputTokens: number;
            };
            whatsappAccountId?: Id<"whatsappAccounts">;
            workflow: "inbound" | "outbound" | "none";
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"conversations"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"conversations"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"conversations">;
            patch: {
              _creationTime?: number;
              _id?: Id<"conversations">;
              acceptedAt?: string;
              agentId?: Id<"agents">;
              agentVariantId?: Id<"agentVariants">;
              agentVersionId?: Id<"agentVersions">;
              allocationBucket?: number;
              allocationMode?: "weighted" | "override" | "direct";
              allocationRevision?: number;
              batchCallRecipientId?: Id<"batchCallRecipients">;
              callerIdSelectionReason?: string;
              channel?:
                "voice_inbound" | "voice_outbound" | "whatsapp" | "sms" | "web";
              conversationKey?: string;
              createdAt?: string;
              direction?: "inbound" | "outbound";
              durationSecs?: number;
              endedAt?: string;
              externalNumber?: string;
              hasAudio?: boolean;
              idempotencyFingerprint?: string;
              messageCount?: number;
              phoneNumberId?: Id<"phoneNumbers">;
              phoneNumberSnapshot?: {
                number: string;
                provider: "twilio" | "sip_trunk";
                providerNumberId: string;
                telephonyConnectionId: string;
              };
              provider?: "openai" | "xai";
              providerSessionId?: string;
              startedAt?: string;
              status?:
                "initiated" | "in_progress" | "processing" | "done" | "failed";
              successStatus?: "success" | "failure" | "unknown";
              summary?: string;
              tenant?: string;
              terminationReason?: string;
              updatedAt?: string;
              usage?: {
                costUsd?: number;
                inputTokens: number;
                outputTokens: number;
              };
              whatsappAccountId?: Id<"whatsappAccounts">;
              workflow?: "inbound" | "outbound" | "none";
            };
          },
          any
        >;
      };
      email: {
        handleEmailEvent: FunctionReference<
          "mutation",
          "internal",
          {
            event:
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    created_at: string;
                    email_id: string;
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.sent";
                }
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    created_at: string;
                    email_id: string;
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.delivered";
                }
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    created_at: string;
                    email_id: string;
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.delivery_delayed";
                }
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    created_at: string;
                    email_id: string;
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.complained";
                }
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    bounce: { message: string; subType: string; type: string };
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    created_at: string;
                    email_id: string;
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.bounced";
                }
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    created_at: string;
                    email_id: string;
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    open: {
                      ipAddress: string;
                      timestamp: string;
                      userAgent: string;
                    };
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.opened";
                }
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    click: {
                      ipAddress: string;
                      link: string;
                      timestamp: string;
                      userAgent: string;
                    };
                    created_at: string;
                    email_id: string;
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.clicked";
                }
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    created_at: string;
                    email_id: string;
                    failed: { reason: string };
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.failed";
                };
            id: string;
          },
          any
        >;
      };
      kbDocuments: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"kbDocuments">;
            activeEntryId?: string;
            archived?: boolean;
            archivedAt?: string;
            createdAt: string;
            lastError?: string;
            tenant: string;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"kbDocuments"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"kbDocuments"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"kbDocuments">;
            patch: {
              _creationTime?: number;
              _id?: Id<"kbDocuments">;
              activeEntryId?: string;
              archived?: boolean;
              archivedAt?: string;
              createdAt?: string;
              lastError?: string;
              tenant?: string;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      mcpConnections: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"mcpConnections">;
            allowedTools?: Array<string>;
            approvalPolicy?:
              | "auto_approve_all"
              | "require_approval_all"
              | "require_approval_per_tool";
            composioAccountId?: string;
            createdAt: string;
            description?: string;
            kind: "composio" | "byo";
            name: string;
            requestHeaders?: Record<string, string | { secretRef: string }>;
            responseTimeoutSecs?: number;
            secretRef?: string;
            status?: "active" | "disabled" | "error";
            tenant: string;
            toolApprovals?: Array<{
              policy: "auto_approved" | "requires_approval";
              toolHash: string;
              toolName: string;
            }>;
            toolConfigOverrides?: Array<{
              inputOverrides?: Record<
                string,
                | { source: "constant"; value: string }
                | { name: string; source: "dynamic_variable" }
                | { prompt?: string; source: "llm" }
                | { source: "omit" }
              >;
              toolName: string;
            }>;
            toolkitSlugs?: Array<string>;
            transport?: "sse" | "streamable_http";
            updatedAt?: string;
            url?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"mcpConnections"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"mcpConnections"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"mcpConnections">;
            patch: {
              _creationTime?: number;
              _id?: Id<"mcpConnections">;
              allowedTools?: Array<string>;
              approvalPolicy?:
                | "auto_approve_all"
                | "require_approval_all"
                | "require_approval_per_tool";
              composioAccountId?: string;
              createdAt?: string;
              description?: string;
              kind?: "composio" | "byo";
              name?: string;
              requestHeaders?: Record<string, string | { secretRef: string }>;
              responseTimeoutSecs?: number;
              secretRef?: string;
              status?: "active" | "disabled" | "error";
              tenant?: string;
              toolApprovals?: Array<{
                policy: "auto_approved" | "requires_approval";
                toolHash: string;
                toolName: string;
              }>;
              toolConfigOverrides?: Array<{
                inputOverrides?: Record<
                  string,
                  | { source: "constant"; value: string }
                  | { name: string; source: "dynamic_variable" }
                  | { prompt?: string; source: "llm" }
                  | { source: "omit" }
                >;
                toolName: string;
              }>;
              toolkitSlugs?: Array<string>;
              transport?: "sse" | "streamable_http";
              updatedAt?: string;
              url?: string;
            };
          },
          any
        >;
      };
      phoneNumbers: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"phoneNumbers">;
            archivedAt?: string;
            assignedAgentId?: Id<"agents">;
            capabilities: {
              inboundSms: boolean;
              inboundVoice: boolean;
              outboundSms: boolean;
              outboundVoice: boolean;
            };
            countryCode: string;
            createdAt: string;
            inboundSmsEnabled?: boolean;
            label?: string;
            lastError?: string;
            lastSyncedAt?: string;
            locality?: string;
            number: string;
            provider: "twilio" | "sip_trunk";
            providerNumberId: string;
            regionCode?: string;
            routingRegion?: string;
            status?:
              | "pending"
              | "active"
              | "disabled"
              | "provider_missing"
              | "archived";
            telephonyConnectionId: Id<"telephonyConnections">;
            tenant: string;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"phoneNumbers"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"phoneNumbers"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"phoneNumbers">;
            patch: {
              _creationTime?: number;
              _id?: Id<"phoneNumbers">;
              archivedAt?: string;
              assignedAgentId?: Id<"agents">;
              capabilities?: {
                inboundSms: boolean;
                inboundVoice: boolean;
                outboundSms: boolean;
                outboundVoice: boolean;
              };
              countryCode?: string;
              createdAt?: string;
              inboundSmsEnabled?: boolean;
              label?: string;
              lastError?: string;
              lastSyncedAt?: string;
              locality?: string;
              number?: string;
              provider?: "twilio" | "sip_trunk";
              providerNumberId?: string;
              regionCode?: string;
              routingRegion?: string;
              status?:
                | "pending"
                | "active"
                | "disabled"
                | "provider_missing"
                | "archived";
              telephonyConnectionId?: Id<"telephonyConnections">;
              tenant?: string;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      procedures: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"procedures">;
            agentVariantId: Id<"agentVariants">;
            content?: string;
            createdAt: string;
            name: string;
            references?: Array<{
              health?: "valid" | "invalid" | "unavailable";
              location: "trigger" | "content";
              targetId: string;
              targetType:
                "system_tool" | "mcp_tool" | "knowledge_base" | "procedure";
            }>;
            source?: "manual" | "sop_import" | "generated";
            status?: "draft" | "active" | "archived";
            steps?: Array<
              | { instruction: string; type: "ask" }
              | { instruction: string; type: "tell" }
              | { text: string; type: "say" }
              | { instruction?: string; toolRef: string; type: "tool" }
              | {
                  condition:
                    | { description: string; kind: "natural_language" }
                    | { expression: string; kind: "expression" };
                  steps: Array<
                    | { instruction: string; type: "ask" }
                    | { instruction: string; type: "tell" }
                    | { text: string; type: "say" }
                    | { instruction?: string; toolRef: string; type: "tool" }
                  >;
                  type: "if";
                }
            >;
            tenant: string;
            trigger: string;
            type: "free_form" | "structured";
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"procedures"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"procedures"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"procedures">;
            patch: {
              _creationTime?: number;
              _id?: Id<"procedures">;
              agentVariantId?: Id<"agentVariants">;
              content?: string;
              createdAt?: string;
              name?: string;
              references?: Array<{
                health?: "valid" | "invalid" | "unavailable";
                location: "trigger" | "content";
                targetId: string;
                targetType:
                  "system_tool" | "mcp_tool" | "knowledge_base" | "procedure";
              }>;
              source?: "manual" | "sop_import" | "generated";
              status?: "draft" | "active" | "archived";
              steps?: Array<
                | { instruction: string; type: "ask" }
                | { instruction: string; type: "tell" }
                | { text: string; type: "say" }
                | { instruction?: string; toolRef: string; type: "tool" }
                | {
                    condition:
                      | { description: string; kind: "natural_language" }
                      | { expression: string; kind: "expression" };
                    steps: Array<
                      | { instruction: string; type: "ask" }
                      | { instruction: string; type: "tell" }
                      | { text: string; type: "say" }
                      | { instruction?: string; toolRef: string; type: "tool" }
                    >;
                    type: "if";
                  }
              >;
              tenant?: string;
              trigger?: string;
              type?: "free_form" | "structured";
              updatedAt?: string;
            };
          },
          any
        >;
      };
      telephonyConnections: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"telephonyConnections">;
            createdAt: string;
            credentialSecretRef: string;
            defaultRoutingRegion?: string;
            label?: string;
            lastError?: string;
            lastSyncedAt?: string;
            provider: "twilio" | "sip_trunk";
            providerAccountId: string;
            status:
              | "pending_verification"
              | "active"
              | "disabled"
              | "error"
              | "archived";
            tenant: string;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"telephonyConnections"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"telephonyConnections"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"telephonyConnections">;
            patch: {
              _creationTime?: number;
              _id?: Id<"telephonyConnections">;
              createdAt?: string;
              credentialSecretRef?: string;
              defaultRoutingRegion?: string;
              label?: string;
              lastError?: string;
              lastSyncedAt?: string;
              provider?: "twilio" | "sip_trunk";
              providerAccountId?: string;
              status?:
                | "pending_verification"
                | "active"
                | "disabled"
                | "error"
                | "archived";
              tenant?: string;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      tenantSettings: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"tenantSettings">;
            concurrencyLimit?: number;
            createdAt: string;
            dailyCallLimit?: number;
            recordingEnabled?: boolean;
            tenant: string;
            transcriptRetentionDays?: number;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"tenantSettings"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"tenantSettings"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"tenantSettings">;
            patch: {
              _creationTime?: number;
              _id?: Id<"tenantSettings">;
              concurrencyLimit?: number;
              createdAt?: string;
              dailyCallLimit?: number;
              recordingEnabled?: boolean;
              tenant?: string;
              transcriptRetentionDays?: number;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      whatsappAccounts: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"whatsappAccounts">;
            accessTokenSecretRef: string;
            assignedAgentId?: Id<"agents">;
            businessAccountId: string;
            businessAccountName?: string;
            createdAt: string;
            enableAudioMessageResponse?: boolean;
            enableMessaging?: boolean;
            label?: string;
            metaPhoneNumberId: string;
            phoneNumber?: string;
            phoneNumberName?: string;
            status?: "active" | "disabled" | "token_expired";
            tenant: string;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"whatsappAccounts"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"whatsappAccounts"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"whatsappAccounts">;
            patch: {
              _creationTime?: number;
              _id?: Id<"whatsappAccounts">;
              accessTokenSecretRef?: string;
              assignedAgentId?: Id<"agents">;
              businessAccountId?: string;
              businessAccountName?: string;
              createdAt?: string;
              enableAudioMessageResponse?: boolean;
              enableMessaging?: boolean;
              label?: string;
              metaPhoneNumberId?: string;
              phoneNumber?: string;
              phoneNumberName?: string;
              status?: "active" | "disabled" | "token_expired";
              tenant?: string;
              updatedAt?: string;
            };
          },
          any
        >;
      };
    };
    kbSearch: {
      loadPromptKnowledge: FunctionReference<
        "action",
        "internal",
        { conversationId: Id<"conversations"> },
        any
      >;
      promptScopeForConversation: FunctionReference<
        "query",
        "internal",
        { conversationId: Id<"conversations"> },
        any
      >;
      scopeForConversation: FunctionReference<
        "query",
        "internal",
        { conversationId: Id<"conversations"> },
        any
      >;
      search: FunctionReference<
        "action",
        "internal",
        {
          callId?: string;
          chunkContext?: { after: number; before: number };
          conversationId: Id<"conversations">;
          limit?: number;
          query: string;
          vectorScoreThreshold?: number;
        },
        any
      >;
      searchKnowledge: FunctionReference<
        "action",
        "internal",
        {
          callId?: string;
          chunkContext?: { after: number; before: number };
          conversationId: Id<"conversations">;
          limit?: number;
          query: string;
          vectorScoreThreshold?: number;
        },
        any
      >;
    };
    knowledgeBase: {
      activateEntry: FunctionReference<
        "mutation",
        "internal",
        { documentId: Id<"kbDocuments">; entryId: string },
        any
      >;
      markArchived: FunctionReference<
        "mutation",
        "internal",
        { documentId: Id<"kbDocuments"> },
        any
      >;
      recordFailure: FunctionReference<
        "mutation",
        "internal",
        { documentId: Id<"kbDocuments">; message: string },
        any
      >;
      resolveDocument: FunctionReference<
        "query",
        "internal",
        { documentId: string },
        any
      >;
    };
    phoneNumbers: {
      markMissingAfterRefresh: FunctionReference<
        "mutation",
        "internal",
        {
          seenProviderNumberIds: Array<string>;
          telephonyConnectionId: Id<"telephonyConnections">;
        },
        any
      >;
      upsertImportedNumber: FunctionReference<
        "mutation",
        "internal",
        {
          capabilities: {
            inboundSms: boolean;
            inboundVoice: boolean;
            outboundSms: boolean;
            outboundVoice: boolean;
          };
          countryCode: string;
          inboundSmsEnabled: boolean;
          label: string;
          locality?: string;
          number: string;
          providerNumberId: string;
          regionCode?: string;
          routingRegion?: string;
          status: "pending" | "active";
          telephonyConnectionId: Id<"telephonyConnections">;
        },
        any
      >;
    };
    phoneRouting: {
      selectOutboundForRecipient: FunctionReference<
        "mutation",
        "internal",
        {
          destinationCountryCode?: string;
          destinationRegionCode?: string;
          recipientId: Id<"batchCallRecipients">;
        },
        any
      >;
    };
    telephonyConnections: {
      recordProviderSync: FunctionReference<
        "mutation",
        "internal",
        { connectionId: Id<"telephonyConnections">; error?: string },
        any
      >;
      resolveForProviderSync: FunctionReference<
        "query",
        "internal",
        { connectionId: Id<"telephonyConnections"> },
        any
      >;
    };
  };
  auth: {
    authKitEvent: FunctionReference<
      "mutation",
      "internal",
      { data: Record<string, any>; event: string },
      null
    >;
    backfillUsers: FunctionReference<"mutation", "internal", {}, null>;
  };
  workos: {
    ensureCustomerRoleOnOrg: FunctionReference<
      "action",
      "internal",
      { organizationId: string },
      any
    >;
  };
};

export declare const components: {
  workOSAuthKit: import("@convex-dev/workos-authkit/_generated/component.js").ComponentApi<"workOSAuthKit">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  rag: import("@convex-dev/rag/_generated/component.js").ComponentApi<"rag">;
};
